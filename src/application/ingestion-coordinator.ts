/**
 * Single ingestion coordinator — sole writer of Run/Store generation and
 * publication/projection state (AD-17).
 */

import type { StoreMap } from "../contracts/store-map";
import {
  FailureCodeSchema,
  type StoreRunEvidence,
} from "../contracts/store-run-evidence";
import {
  canTransitionRun,
  INGESTION_RUN_CONTRACT_VERSION,
  type IngestionRun,
  type PublicationClass,
  type RunState,
} from "../contracts/ingestion-run";
import { QUEUE_ENVELOPE_CONTRACT_VERSION } from "../contracts/queue-envelope";
import type { StoreObservationPort } from "./ports";
import {
  compilePublicationClass,
  observationsForStages,
} from "./stages/completeness";
import { normalizeAndValidateObservations } from "./stages/normalize-validate";
import {
  executePublicationBatch,
  terminalizeRunWithoutPublish,
} from "../adapters/persistence/publish-batch";
import type {
  OfferIdentityLineageRecord,
  OfferIdentityRecord,
} from "../domain/identity/offer-identity";
import type { StagedOffer } from "../contracts/offer";

export type CoordinatorEnv = {
  DB: D1Database;
  RECOVERY_EPOCH: string;
};

export type CoordinatorDeps = {
  db: D1Database;
  recoveryEpochAuthority: number;
  now?: () => Date;
  randomId?: () => string;
};

function sha256Hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function digestJson(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return sha256Hex(digest);
}

/** Load current Offer identities for a Store, keyed by source key (AD-16 continuity). */
async function loadExistingIdentities(
  db: D1Database,
  storeId: string,
): Promise<Map<string, OfferIdentityRecord>> {
  const { results } = await db
    .prepare(
      `SELECT offer_id, source_key, store_id, canonical_pdp_url,
              merchant_variant_id, continuity_fingerprint, tombstoned
       FROM offers WHERE store_id = ?`,
    )
    .bind(storeId)
    .all<{
      offer_id: string;
      source_key: string;
      store_id: string;
      canonical_pdp_url: string;
      merchant_variant_id: string | null;
      continuity_fingerprint: string;
      tombstoned: number;
    }>();

  const bySourceKey = new Map<string, OfferIdentityRecord>();
  for (const row of results) {
    bySourceKey.set(row.source_key, {
      offerId: row.offer_id,
      sourceKey: row.source_key,
      storeId: row.store_id,
      canonicalPdpUrl: row.canonical_pdp_url,
      merchantVariantId: row.merchant_variant_id,
      continuityFingerprint: row.continuity_fingerprint,
      tombstoned: row.tombstoned === 1,
    });
  }
  return bySourceKey;
}

async function loadIdentityLineage(db: D1Database, storeId: string): Promise<{
  aliases: Map<string, string>;
  tombstones: Set<string>;
  lineage: Map<string, OfferIdentityLineageRecord>;
}> {
  const { results } = await db
    .prepare(
      `SELECT l.source_key, l.offer_id, l.kind
       FROM offer_identity_lineage l
       INNER JOIN offers o ON o.offer_id = l.offer_id
       WHERE o.store_id = ?`,
    )
    .bind(storeId)
    .all<{
      source_key: string;
      offer_id: string;
      kind: string;
    }>();
  const aliases = new Map<string, string>();
  const tombstones = new Set<string>();
  const lineage = new Map<string, OfferIdentityLineageRecord>();
  for (const row of results) {
    if (
      row.kind !== "alias" &&
      row.kind !== "tombstone" &&
      row.kind !== "reviewed_split" &&
      row.kind !== "quarantine"
    ) {
      continue;
    }
    const record: OfferIdentityLineageRecord = {
      sourceKey: row.source_key,
      offerId: row.offer_id,
      kind: row.kind,
    };
    lineage.set(row.source_key, record);
    if (row.kind === "alias" || row.kind === "reviewed_split") {
      aliases.set(row.source_key, row.offer_id);
    } else if (row.kind === "tombstone") {
      tombstones.add(row.source_key);
    }
  }
  return { aliases, tombstones, lineage };
}

export class IllegalRunTransitionError extends Error {
  constructor(from: RunState, to: RunState) {
    super(`illegal_run_transition:${from}->${to}`);
    this.name = "IllegalRunTransitionError";
  }
}

export async function createRun(
  deps: CoordinatorDeps,
  input: {
    runId: string;
    storeId: string;
    probeId?: string | null;
    supportGeneration: number;
    projectionEpoch: number;
  },
): Promise<IngestionRun> {
  const nowIso = (deps.now ?? (() => new Date()))().toISOString();
  const run: IngestionRun = {
    contractVersion: INGESTION_RUN_CONTRACT_VERSION,
    runId: input.runId,
    storeId: input.storeId,
    state: "created",
    probeId: input.probeId ?? null,
    storeGeneration: null,
    supportGeneration: input.supportGeneration,
    projectionEpoch: input.projectionEpoch,
    recoveryEpoch: deps.recoveryEpochAuthority,
    publicationClass: null,
    failureCodes: [],
    evidenceDigestSha256: null,
    payloadArtifactId: null,
    mapVersion: null,
    parserVersion: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    terminalAt: null,
  };

  await deps.db
    .prepare(
      `INSERT INTO ingestion_runs (
        run_id, store_id, state, probe_id, store_generation, support_generation,
        projection_epoch, recovery_epoch, publication_class, failure_codes_json,
        evidence_digest_sha256, payload_artifact_id, map_version, parser_version,
        created_at, updated_at, terminal_at
      ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NULL, '[]', NULL, NULL, NULL, NULL, ?, ?, NULL)`,
    )
    .bind(
      run.runId,
      run.storeId,
      run.state,
      run.probeId,
      run.supportGeneration,
      run.projectionEpoch,
      run.recoveryEpoch,
      run.createdAt,
      run.updatedAt,
    )
    .run();

  return run;
}

export async function transitionRun(
  deps: CoordinatorDeps,
  input: { runId: string; from: RunState; to: RunState },
): Promise<void> {
  if (!canTransitionRun(input.from, input.to)) {
    throw new IllegalRunTransitionError(input.from, input.to);
  }
  const nowIso = (deps.now ?? (() => new Date()))().toISOString();
  const terminal = ["published", "failed", "quarantined", "superseded"].includes(
    input.to,
  );
  const result = await deps.db
    .prepare(
      `UPDATE ingestion_runs
       SET state = ?, updated_at = ?, terminal_at = CASE WHEN ? THEN ? ELSE terminal_at END
       WHERE run_id = ? AND state = ?`,
    )
    .bind(
      input.to,
      nowIso,
      terminal ? 1 : 0,
      terminal ? nowIso : null,
      input.runId,
      input.from,
    )
    .run();
  if ((result.meta.changes ?? 0) === 0) {
    throw new IllegalRunTransitionError(input.from, input.to);
  }
}

export type PublishPathResult =
  | { outcome: "published"; publicationClass: PublicationClass; generation: number }
  | {
      outcome: "terminal_no_publish";
      state: "failed" | "quarantined" | "superseded";
      reason: string;
    }
  | { outcome: "idempotent_noop"; reason: string }
  | { outcome: "rejected"; reason: string };

/**
 * Full publish path after observation evidence is retained:
 * decode → claim inbox → verify digest → stage/classify → guarded batch → inbox complete.
 */
export async function publishRetainedEvidence(
  deps: CoordinatorDeps,
  input: {
    evidence: StoreRunEvidence;
    map: StoreMap;
    idempotencyKey: string;
    messageId: string;
    payloadArtifactId: string;
    payloadDigestSha256: string;
    expectedStoreGeneration: number;
    expectedSupportGeneration: number;
    expectedProjectionEpoch: number;
    existingIdentities?: ReadonlyMap<string, OfferIdentityRecord>;
    allowedHosts: readonly string[];
    apexToWww?: { apex: string; www: string };
  },
): Promise<PublishPathResult> {
  const now = deps.now ?? (() => new Date());
  const nowIso = now().toISOString();
  const randomId = deps.randomId ?? (() => crypto.randomUUID());

  // Reject old recovery epoch.
  if (input.evidence.probeId !== null) {
    return { outcome: "rejected", reason: "probe_non_publishing" };
  }

  type InboxIdentityRow = {
    idempotency_key: string;
    store_id: string;
    run_id: string;
    message_id: string;
    status: string;
    recovery_epoch: number;
    payload_artifact_id: string | null;
  };
  const inboxMatches = (row: InboxIdentityRow): boolean =>
    row.idempotency_key === input.idempotencyKey &&
    row.store_id === input.evidence.storeId &&
    row.run_id === input.evidence.runId &&
    row.message_id === input.messageId &&
    row.recovery_epoch === deps.recoveryEpochAuthority &&
    row.payload_artifact_id === input.payloadArtifactId;

  // Detect collisions across both unique inbox identities. Never treat a
  // reused idempotency key or message id as an idempotent delivery unless the
  // complete provenance tuple is identical.
  let existingInbox = await deps.db
    .prepare(
      `SELECT idempotency_key, store_id, run_id, message_id, status,
              recovery_epoch, payload_artifact_id
       FROM ingestion_inbox
       WHERE idempotency_key = ? OR message_id = ?
       LIMIT 1`,
    )
    .bind(input.idempotencyKey, input.messageId)
    .first<InboxIdentityRow>();

  if (existingInbox && !inboxMatches(existingInbox)) {
    return { outcome: "rejected", reason: "inbox_identity_collision" };
  }

  if (existingInbox?.status === "completed") {
    return { outcome: "idempotent_noop", reason: "inbox_already_completed" };
  }
  if (existingInbox?.status === "quarantined") {
    return { outcome: "idempotent_noop", reason: "inbox_already_quarantined" };
  }

  type RunBindingRow = {
    state: RunState;
    store_id: string;
    probe_id: string | null;
    support_generation: number;
    projection_epoch: number;
    recovery_epoch: number;
    evidence_digest_sha256: string | null;
    payload_artifact_id: string | null;
    map_version: number | null;
    parser_version: number | null;
  };
  let runRow = await deps.db
    .prepare(
      `SELECT state, store_id, probe_id, support_generation, projection_epoch,
              recovery_epoch, evidence_digest_sha256, payload_artifact_id,
              map_version, parser_version
       FROM ingestion_runs WHERE run_id = ?`,
    )
    .bind(input.evidence.runId)
    .first<RunBindingRow>();

  if (runRow && ["published", "failed", "quarantined", "superseded"].includes(runRow.state)) {
    if (existingInbox?.status === "claimed") {
      await deps.db
        .prepare(
          `UPDATE ingestion_inbox
           SET status = 'completed', completed_at = ?
           WHERE idempotency_key = ? AND status = 'claimed'`,
        )
        .bind(nowIso, input.idempotencyKey)
        .run();
    }
    return { outcome: "idempotent_noop", reason: `terminal_run:${runRow.state}` };
  }

  if (!runRow) {
    await createRun(deps, {
      runId: input.evidence.runId,
      storeId: input.evidence.storeId,
      probeId: input.evidence.probeId,
      supportGeneration: input.expectedSupportGeneration,
      projectionEpoch: input.expectedProjectionEpoch,
    });
    runRow = await deps.db
      .prepare(
        `SELECT state, store_id, probe_id, support_generation, projection_epoch,
                recovery_epoch, evidence_digest_sha256, payload_artifact_id,
                map_version, parser_version
         FROM ingestion_runs WHERE run_id = ?`,
      )
      .bind(input.evidence.runId)
      .first<RunBindingRow>();
  }

  if (
    !runRow ||
    runRow.store_id !== input.evidence.storeId ||
    runRow.probe_id !== input.evidence.probeId ||
    runRow.support_generation !== input.expectedSupportGeneration ||
    runRow.projection_epoch !== input.expectedProjectionEpoch ||
    runRow.recovery_epoch !== deps.recoveryEpochAuthority ||
    (runRow.evidence_digest_sha256 !== null &&
      runRow.evidence_digest_sha256 !== input.payloadDigestSha256) ||
    (runRow.payload_artifact_id !== null &&
      runRow.payload_artifact_id !== input.payloadArtifactId) ||
    (runRow.map_version !== null && runRow.map_version !== input.evidence.mapVersion) ||
    (runRow.parser_version !== null &&
      runRow.parser_version !== input.evidence.parserVersion)
  ) {
    return { outcome: "rejected", reason: "run_identity_mismatch" };
  }

  // Bind retained evidence to the Run before an inbox claim can proceed.
  const bindRun = await deps.db
    .prepare(
      `UPDATE ingestion_runs
       SET evidence_digest_sha256 = ?, payload_artifact_id = ?,
           map_version = ?, parser_version = ?, updated_at = ?
       WHERE run_id = ? AND store_id = ?
         AND state NOT IN ('published', 'failed', 'quarantined', 'superseded')
         AND (evidence_digest_sha256 IS NULL OR evidence_digest_sha256 = ?)
         AND (payload_artifact_id IS NULL OR payload_artifact_id = ?)
         AND (map_version IS NULL OR map_version = ?)
         AND (parser_version IS NULL OR parser_version = ?)`,
    )
    .bind(
      input.payloadDigestSha256,
      input.payloadArtifactId,
      input.evidence.mapVersion,
      input.evidence.parserVersion,
      nowIso,
      input.evidence.runId,
      input.evidence.storeId,
      input.payloadDigestSha256,
      input.payloadArtifactId,
      input.evidence.mapVersion,
      input.evidence.parserVersion,
    )
    .run();
  if ((bindRun.meta.changes ?? 0) === 0) {
    return { outcome: "rejected", reason: "run_binding_lost" };
  }

  if (!existingInbox) {
    await deps.db
      .prepare(
        `INSERT OR IGNORE INTO ingestion_inbox (
          idempotency_key, store_id, run_id, message_id, status,
          recovery_epoch, payload_artifact_id, claimed_at, completed_at
        ) VALUES (?, ?, ?, ?, 'claimed', ?, ?, ?, NULL)`,
      )
      .bind(
        input.idempotencyKey,
        input.evidence.storeId,
        input.evidence.runId,
        input.messageId,
        deps.recoveryEpochAuthority,
        input.payloadArtifactId,
        nowIso,
      )
      .run();
    existingInbox = await deps.db
      .prepare(
        `SELECT idempotency_key, store_id, run_id, message_id, status,
                recovery_epoch, payload_artifact_id
         FROM ingestion_inbox
         WHERE idempotency_key = ? OR message_id = ?
         LIMIT 1`,
      )
      .bind(input.idempotencyKey, input.messageId)
      .first<InboxIdentityRow>();
    if (!existingInbox || !inboxMatches(existingInbox)) {
      return { outcome: "rejected", reason: "inbox_identity_collision" };
    }
  }

  const decision = compilePublicationClass({
    evidence: input.evidence,
    map: input.map,
  });

  // Advance through discovering → staged → validated (or terminal).
  const current = await deps.db
    .prepare(`SELECT state FROM ingestion_runs WHERE run_id = ?`)
    .bind(input.evidence.runId)
    .first<{ state: RunState }>();

  async function ensureAt(target: RunState, path: RunState[]) {
    let state = current?.state ?? "created";
    for (const next of path) {
      if (state === target) return;
      if (state === next) continue;
      if (canTransitionRun(state, next)) {
        await transitionRun(deps, {
          runId: input.evidence.runId,
          from: state,
          to: next,
        });
        state = next;
      }
    }
  }

  if (decision.publicationClass === "publish-nothing") {
    const terminalState =
      decision.terminalHint === "failed"
        ? "failed"
        : decision.terminalHint === "quarantined"
          ? "quarantined"
          : "quarantined";
    await ensureAt("discovering", ["discovering"]);
    await terminalizeRunWithoutPublish(deps.db, {
      runId: input.evidence.runId,
      storeId: input.evidence.storeId,
      state: terminalState,
      publicationClass: "publish-nothing",
      failureCodes: decision.failureCodes,
      idempotencyKey: input.idempotencyKey,
      nowIso,
      lastRunOutcome:
        input.evidence.outcome === "oversized" ? "oversized" : input.evidence.outcome,
    });
    return {
      outcome: "terminal_no_publish",
      state: terminalState,
      reason: decision.reason,
    };
  }

  await ensureAt("validated", ["discovering", "staged", "validated"]);

  const existingIdentities =
    input.existingIdentities ??
    (await loadExistingIdentities(deps.db, input.evidence.storeId));
  const identityLineage = await loadIdentityLineage(
    deps.db,
    input.evidence.storeId,
  );

  const observations = observationsForStages(input.evidence);
  const stagedResult = normalizeAndValidateObservations({
    observations,
    allowedHosts: input.allowedHosts,
    apexToWww: input.apexToWww,
    existingBySourceKey: existingIdentities,
    aliases: identityLineage.aliases,
    tombstones: identityLineage.tombstones,
    lineage: identityLineage.lineage,
  });

  if (!stagedResult.publicationSafe) {
    await terminalizeRunWithoutPublish(deps.db, {
      runId: input.evidence.runId,
      storeId: input.evidence.storeId,
      state: "quarantined",
      publicationClass: "publish-nothing",
      failureCodes: ["quarantine"],
      idempotencyKey: input.idempotencyKey,
      nowIso,
      lastRunOutcome: "quarantined",
    });
    return {
      outcome: "terminal_no_publish",
      state: "quarantined",
      reason:
        stagedResult.quarantined.length > 0
          ? "identity_quarantine"
          : (stagedResult.blockingReason ?? "validation_rejected"),
    };
  }

  // PricePoint append/supersede (unchanged-price dedup) is decided by
  // executePublicationBatch directly against the live price_points table —
  // see publish-batch.ts's insertPricePoints/supersedePricePoints statements.
  const staged: StagedOffer[] = stagedResult.staged;

  // A transient batch failure leaves the Run in `publishing`. Redelivery must
  // reuse that legal state instead of attempting validated → publishing twice.
  if (current?.state !== "publishing") {
    await transitionRun(deps, {
      runId: input.evidence.runId,
      from: "validated",
      to: "publishing",
    });
  }

  const publishableOutcome = input.evidence.outcome;
  if (publishableOutcome !== "complete" && publishableOutcome !== "partial") {
    return { outcome: "rejected", reason: "non_publishable_evidence_outcome" };
  }
  const boundedFailureCodes = FailureCodeSchema.array().parse(
    decision.failureCodes,
  );
  const claimId = randomId();
  const result = await executePublicationBatch(deps.db, {
    fences: {
      storeId: input.evidence.storeId,
      runId: input.evidence.runId,
      claimId,
      expectedStoreGeneration: input.expectedStoreGeneration,
      expectedSupportGeneration: input.expectedSupportGeneration,
      expectedProjectionEpoch: input.expectedProjectionEpoch,
      expectedRecoveryEpoch: deps.recoveryEpochAuthority,
      recoveryEpochAuthority: deps.recoveryEpochAuthority,
    },
    publicationClass: decision.publicationClass,
    runOutcome: publishableOutcome,
    failureCodes: boundedFailureCodes,
    observationCount: input.evidence.observations.length,
    staged,
    idempotencyKey: input.idempotencyKey,
    nowIso,
    markAbsentUnavailable: decision.publicationClass === "authoritative-complete",
  });

  if (!result.ok) {
    if (result.code === "fence_mismatch" || result.code === "activation_blocked") {
      await terminalizeRunWithoutPublish(deps.db, {
        runId: input.evidence.runId,
        storeId: input.evidence.storeId,
        state: "failed",
        publicationClass: "publish-nothing",
        failureCodes: ["unknown"],
        idempotencyKey: input.idempotencyKey,
        nowIso,
        lastRunOutcome: "failed",
      });
      return {
        outcome: "terminal_no_publish",
        state: "failed",
        reason: result.detail,
      };
    }
    return { outcome: "rejected", reason: `${result.code}:${result.detail}` };
  }

  return {
    outcome: "published",
    publicationClass: decision.publicationClass,
    generation: result.newStoreGeneration,
  };
}

/**
 * Retain immutable bounded structured payload in D1 (not Queue body).
 */
export async function retainPayload(
  deps: CoordinatorDeps,
  input: {
    artifactId: string;
    storeId: string;
    runId: string;
    evidence: StoreRunEvidence;
    expiresAt: string;
  },
): Promise<{ digestSha256: string; byteLength: number }> {
  const payloadJson = JSON.stringify(input.evidence);
  const byteLength = new TextEncoder().encode(payloadJson).length;
  const digestSha256 = await digestJson(input.evidence);
  const nowIso = (deps.now ?? (() => new Date()))().toISOString();

  await deps.db
    .prepare(
      `INSERT INTO retained_payloads (
        artifact_id, store_id, run_id, digest_sha256, contract_version,
        map_version, parser_version, payload_json, byte_length, expires_at,
        purged_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    )
    .bind(
      input.artifactId,
      input.storeId,
      input.runId,
      digestSha256,
      input.evidence.contractVersion,
      input.evidence.mapVersion,
      input.evidence.parserVersion,
      payloadJson,
      byteLength,
      input.expiresAt,
      nowIso,
    )
    .run();

  return { digestSha256, byteLength };
}

export function buildPublishEnvelope(input: {
  messageId: string;
  idempotencyKey: string;
  storeId: string;
  runId: string;
  storeGeneration: number | null;
  supportGeneration: number;
  projectionEpoch: number;
  recoveryEpoch: number;
  payloadDigestSha256: string;
  payloadArtifactId: string;
  payloadExpiresAt: string;
  enqueuedAt: string;
  probeId?: string | null;
}) {
  return {
    contractVersion: QUEUE_ENVELOPE_CONTRACT_VERSION,
    kind: "ingest.publish" as const,
    messageId: input.messageId,
    idempotencyKey: input.idempotencyKey,
    storeId: input.storeId,
    runId: input.runId,
    storeGeneration: input.storeGeneration,
    supportGeneration: input.supportGeneration,
    projectionEpoch: input.projectionEpoch,
    recoveryEpoch: input.recoveryEpoch,
    payloadDigestSha256: input.payloadDigestSha256,
    payloadArtifactId: input.payloadArtifactId,
    payloadExpiresAt: input.payloadExpiresAt,
    enqueuedAt: input.enqueuedAt,
    probeId: input.probeId ?? null,
  };
}

/**
 * Discovery orchestration: observe Store → retain → enqueue publish envelope.
 * Lazy-loaded by scheduled/queue handlers — never top-level in ingest module.
 */
export async function runDiscoveryAndEnqueue(input: {
  deps: CoordinatorDeps;
  adapter: StoreObservationPort;
  map: StoreMap;
  runId: string;
  probeId?: string | null;
  queue: Queue<unknown>;
  supportGeneration: number;
  projectionEpoch: number;
  storeGeneration: number;
  allowedHosts: readonly string[];
  apexToWww?: { apex: string; www: string };
  retentionHours?: number;
}): Promise<{ enqueued: boolean; reason: string }> {
  const now = input.deps.now ?? (() => new Date());
  const nowIso = now().toISOString();
  const randomId = input.deps.randomId ?? (() => crypto.randomUUID());

  await createRun(input.deps, {
    runId: input.runId,
    storeId: input.map.storeId,
    probeId: input.probeId,
    supportGeneration: input.supportGeneration,
    projectionEpoch: input.projectionEpoch,
  });
  await transitionRun(input.deps, {
    runId: input.runId,
    from: "created",
    to: "discovering",
  });

  let evidence: Awaited<ReturnType<typeof input.adapter.observe>>;
  try {
    evidence = await input.adapter.observe({
      runId: input.runId,
      probeId: input.probeId,
    });
  } catch {
    await terminalizeRunWithoutPublish(input.deps.db, {
      runId: input.runId,
      storeId: input.map.storeId,
      state: "failed",
      publicationClass: "publish-nothing",
      failureCodes: ["unknown"],
      idempotencyKey: null,
      nowIso,
      lastRunOutcome: "failed",
    });
    return { enqueued: false, reason: "observe_failed" };
  }

  if (evidence.probeId !== null) {
    await terminalizeRunWithoutPublish(input.deps.db, {
      runId: input.runId,
      storeId: input.map.storeId,
      state: "failed",
      publicationClass: "publish-nothing",
      failureCodes: [],
      idempotencyKey: null,
      nowIso,
      lastRunOutcome: evidence.outcome,
    });
    return { enqueued: false, reason: "probe_non_publishing" };
  }

  const artifactId = randomId();
  const retentionHours = input.retentionHours ?? 72;
  const expiresAt = new Date(
    now().getTime() + retentionHours * 3600_000,
  ).toISOString();

  const retained = await retainPayload(input.deps, {
    artifactId,
    storeId: input.map.storeId,
    runId: input.runId,
    evidence,
    expiresAt,
  });

  const boundArtifact = await input.deps.db
    .prepare(
      `UPDATE ingestion_runs
       SET evidence_digest_sha256 = ?, payload_artifact_id = ?,
           map_version = ?, parser_version = ?, updated_at = ?
       WHERE run_id = ? AND store_id = ? AND state = 'discovering'
         AND payload_artifact_id IS NULL`,
    )
    .bind(
      retained.digestSha256,
      artifactId,
      evidence.mapVersion,
      evidence.parserVersion,
      nowIso,
      input.runId,
      input.map.storeId,
    )
    .run();
  if ((boundArtifact.meta.changes ?? 0) === 0) {
    await terminalizeRunWithoutPublish(input.deps.db, {
      runId: input.runId,
      storeId: input.map.storeId,
      state: "failed",
      publicationClass: "publish-nothing",
      failureCodes: ["unknown"],
      idempotencyKey: null,
      nowIso,
      lastRunOutcome: "failed",
    });
    return { enqueued: false, reason: "artifact_binding_failed" };
  }

  const envelope = buildPublishEnvelope({
    messageId: randomId(),
    idempotencyKey: `${input.map.storeId}:${input.runId}:publish`,
    storeId: input.map.storeId,
    runId: input.runId,
    storeGeneration: input.storeGeneration,
    supportGeneration: input.supportGeneration,
    projectionEpoch: input.projectionEpoch,
    recoveryEpoch: input.deps.recoveryEpochAuthority,
    payloadDigestSha256: retained.digestSha256,
    payloadArtifactId: artifactId,
    payloadExpiresAt: expiresAt,
    enqueuedAt: nowIso,
    probeId: null,
  });

  try {
    await input.queue.send(envelope);
  } catch {
    // The immutable artifact remains available for audit/recovery, while the
    // Run is made terminal instead of being stranded in `discovering`.
    await terminalizeRunWithoutPublish(input.deps.db, {
      runId: input.runId,
      storeId: input.map.storeId,
      state: "failed",
      publicationClass: "publish-nothing",
      failureCodes: ["unknown"],
      idempotencyKey: null,
      nowIso,
      lastRunOutcome: "failed",
    });
    return { enqueued: false, reason: "queue_send_failed" };
  }
  return { enqueued: true, reason: "enqueued_publish" };
}

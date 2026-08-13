/**
 * Queue consumer protocol for ingest Worker (lazy-loaded).
 *
 * Decode supported version → reject old recovery epoch/expired ref → claim inbox
 * → load retained payload → verify digest → stage/classify → guarded publish →
 * ACK only after committed inbox completion.
 */

import { decodeQueueEnvelope } from "../../contracts/queue-envelope";
import { StoreRunEvidenceAnySchema } from "../../contracts/store-run-evidence";
import type { StoreMap } from "../../contracts/store-map";
import {
  digestJson,
  publishRetainedEvidence,
  type CoordinatorDeps,
} from "../../application/ingestion-coordinator";

export type QueueHandlerResult =
  | { action: "ack" }
  | { action: "retry" }
  | { action: "dlq"; reason: string };

export async function handlePublishQueueMessage(input: {
  deps: CoordinatorDeps;
  rawBody: unknown;
  map: StoreMap;
  allowedHosts: readonly string[];
  apexToWww?: { apex: string; www: string };
}): Promise<QueueHandlerResult> {
  let envelope;
  try {
    envelope = decodeQueueEnvelope(input.rawBody);
  } catch {
    return { action: "dlq", reason: "unsupported_or_invalid_envelope" };
  }

  if (envelope.kind !== "ingest.publish") {
    return { action: "dlq", reason: "unexpected_envelope_kind" };
  }

  if (envelope.recoveryEpoch < input.deps.recoveryEpochAuthority) {
    return { action: "ack" }; // old epoch — idempotent no-op ACK
  }
  if (envelope.recoveryEpoch > input.deps.recoveryEpochAuthority) {
    // A newer deployment/config authority may not have reached this consumer
    // yet. Retrying preserves the delivery until the authority catches up.
    return { action: "retry" };
  }

  if (Date.parse(envelope.payloadExpiresAt) <= Date.now()) {
    return { action: "dlq", reason: "payload_expired" };
  }

  const artifact = await input.deps.db
    .prepare(
      `SELECT store_id, run_id, payload_json, digest_sha256, contract_version,
              map_version, parser_version, purged_at, expires_at
       FROM retained_payloads WHERE artifact_id = ?`,
    )
    .bind(envelope.payloadArtifactId)
    .first<{
      store_id: string;
      run_id: string;
      payload_json: string;
      digest_sha256: string;
      contract_version: number;
      map_version: number;
      parser_version: number;
      purged_at: string | null;
      expires_at: string;
    }>();

  if (!artifact || artifact.purged_at) {
    return { action: "dlq", reason: "payload_missing_or_purged" };
  }

  if (
    artifact.store_id !== envelope.storeId ||
    artifact.run_id !== envelope.runId
  ) {
    return { action: "dlq", reason: "artifact_identity_mismatch" };
  }

  if (
    artifact.expires_at !== envelope.payloadExpiresAt ||
    Date.parse(artifact.expires_at) <= Date.now()
  ) {
    return { action: "dlq", reason: "artifact_expiry_mismatch" };
  }

  if (artifact.digest_sha256 !== envelope.payloadDigestSha256) {
    return { action: "dlq", reason: "digest_mismatch" };
  }

  let evidenceJson: unknown;
  try {
    evidenceJson = JSON.parse(artifact.payload_json);
  } catch {
    return { action: "dlq", reason: "payload_json_invalid" };
  }

  const parsed = StoreRunEvidenceAnySchema.safeParse(evidenceJson);
  if (!parsed.success) {
    return { action: "dlq", reason: "evidence_schema_invalid" };
  }

  if (
    parsed.data.storeId !== envelope.storeId ||
    parsed.data.runId !== envelope.runId ||
    parsed.data.probeId !== envelope.probeId ||
    envelope.probeId !== null
  ) {
    return { action: "dlq", reason: "evidence_identity_mismatch" };
  }

  if (
    artifact.contract_version !== parsed.data.contractVersion ||
    artifact.map_version !== parsed.data.mapVersion ||
    artifact.parser_version !== parsed.data.parserVersion ||
    parsed.data.storeId !== input.map.storeId ||
    parsed.data.mapVersion !== input.map.mapVersion ||
    parsed.data.parserVersion !== input.map.parserVersion
  ) {
    return { action: "dlq", reason: "evidence_version_mismatch" };
  }

  if (envelope.storeGeneration === null) {
    return { action: "dlq", reason: "store_generation_missing" };
  }

  const digest = await digestJson(parsed.data);
  if (digest !== envelope.payloadDigestSha256) {
    return { action: "dlq", reason: "digest_tamper" };
  }

  const result = await publishRetainedEvidence(input.deps, {
    evidence: parsed.data,
    map: input.map,
    idempotencyKey: envelope.idempotencyKey,
    messageId: envelope.messageId,
    payloadArtifactId: envelope.payloadArtifactId,
    payloadDigestSha256: envelope.payloadDigestSha256,
    expectedStoreGeneration: envelope.storeGeneration,
    expectedSupportGeneration: envelope.supportGeneration,
    expectedProjectionEpoch: envelope.projectionEpoch,
    allowedHosts: input.allowedHosts,
    apexToWww: input.apexToWww,
  });

  if (
    result.outcome === "published" ||
    result.outcome === "idempotent_noop" ||
    result.outcome === "terminal_no_publish"
  ) {
    return { action: "ack" };
  }

  // fence_mismatch/activation_blocked are intercepted upstream and terminalize
  // the run (surfaced as "terminal_no_publish", already ack'd above) — the only
  // rejection that reaches here in practice is a transient D1 batch failure,
  // which the queue's own retry/DLQ policy should handle via natural redelivery.
  if (result.reason.startsWith("batch_failed")) {
    return { action: "retry" };
  }

  return { action: "dlq", reason: result.reason };
}

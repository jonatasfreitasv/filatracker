/**
 * Atomic set-based D1 publication (AD-8).
 *
 * One env.DB.batch([...]) acquires a fenced claim and conditions every mutation
 * on that claim. Zero-row CAS must make subsequent writes no-ops via claim join.
 * Verification of affected rows is diagnostic only — never the safety mechanism.
 */

import type { PublicationClass } from "../../contracts/ingestion-run";
import type { StagedOffer } from "../../contracts/offer";
import { canonicalizeUtcInstant } from "../../contracts/search-page";
import type {
  FailureCode,
  StoreRunOutcomeKind,
} from "../../contracts/store-run-evidence";
import { buildSearchDocument } from "../../domain/search-query";
import {
  sqlBumpSearchWriteGeneration,
  sqlDeleteStoreFtsDocs,
  sqlInsertStoreFtsDocs,
  selectActiveFtsSlot,
} from "./fts-writer";

export type PublishFences = {
  storeId: string;
  runId: string;
  claimId: string;
  expectedStoreGeneration: number;
  expectedSupportGeneration: number;
  expectedProjectionEpoch: number;
  expectedRecoveryEpoch: number;
  /** External non-secret RECOVERY_EPOCH from deployment/config. */
  recoveryEpochAuthority: number;
};

export type PublishBatchInput = {
  fences: PublishFences;
  publicationClass: PublicationClass;
  staged: readonly StagedOffer[];
  idempotencyKey: string;
  nowIso: string;
  /** When authoritative-complete, mark absent prior Offers unavailable. */
  markAbsentUnavailable: boolean;
  runOutcome: Extract<StoreRunOutcomeKind, "complete" | "partial">;
  failureCodes: readonly FailureCode[];
  observationCount: number;
};

export type PublishBatchResult =
  | {
      ok: true;
      newStoreGeneration: number;
      publishedCount: number;
      pricePointsAppended: number;
      absentMarked: number;
    }
  | {
      ok: false;
      code:
        | "fence_mismatch"
        | "claim_lost"
        | "publish_nothing"
        | "activation_blocked"
        | "batch_failed";
      detail: string;
    };

function boolInt(v: boolean): number {
  return v ? 1 : 0;
}

/**
 * Guarded publication protocol executed as one env.DB.batch([...]):
 * 1. INSERT claim conditioned on store_state fences + activation_gate
 * 2. UPSERT offers FROM staged JOIN open claim
 * 3. INSERT price_points FROM staged WHERE append_price_point=1 JOIN claim
 * 4. Optional absence UPDATE for authoritative-complete
 * 5. Advance store_generation / run terminal / inbox completion JOIN claim
 * 6. Mark claim committed
 */
export async function executePublicationBatch(
  db: D1Database,
  input: PublishBatchInput,
): Promise<PublishBatchResult> {
  if (input.publicationClass === "publish-nothing") {
    return {
      ok: false,
      code: "publish_nothing",
      detail: "publication_class_publish_nothing",
    };
  }

  if (
    input.fences.recoveryEpochAuthority !== input.fences.expectedRecoveryEpoch
  ) {
    return {
      ok: false,
      code: "fence_mismatch",
      detail: "recovery_epoch_authority",
    };
  }

  if (
    input.staged.some(
      (row) =>
        row.runId !== input.fences.runId ||
        row.storeId !== input.fences.storeId,
    )
  ) {
    return {
      ok: false,
      code: "fence_mismatch",
      detail: "staged_identity_mismatch",
    };
  }

  const nowIso = canonicalizeUtcInstant(input.nowIso);
  if (nowIso === null) {
    return { ok: false, code: "batch_failed", detail: "invalid_utc_instant" };
  }
  const canonicalStaged: StagedOffer[] = [];
  for (const row of input.staged) {
    const observedAt = canonicalizeUtcInstant(row.observedAt);
    if (observedAt === null) {
      return { ok: false, code: "batch_failed", detail: "invalid_utc_instant" };
    }
    canonicalStaged.push({ ...row, observedAt });
  }

  let selectedSlot: "a" | "b";
  try {
    selectedSlot = await selectActiveFtsSlot(db);
  } catch {
    return { ok: false, code: "batch_failed", detail: "active_slot_selector_failed" };
  }

  const f = input.fences;
  const nextGeneration = f.expectedStoreGeneration + 1;
  // Runtime defaults keep direct low-level callers deterministic; the
  // application interface remains required so production callers must supply
  // the evidence rather than silently claiming completeness.
  const runOutcome = input.runOutcome ??
    (input.publicationClass === "positive-only" ? "partial" : "complete");
  const failureCodes = input.failureCodes ?? [];
  const observationCount = input.observationCount ?? canonicalStaged.length;

  // Claim before staging. Besides the four fences, bind it to the exact
  // publishing Run and claimed Inbox (including retained-artifact identity).
  // A newer external recovery authority may advance a restored D1 snapshot,
  // but a lower authority can never regress it.
  const claim = db
    .prepare(
      `INSERT INTO publication_claims (
        claim_id, store_id, run_id,
        expected_store_generation, expected_support_generation,
        expected_projection_epoch, expected_recovery_epoch,
        status, created_at, completed_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, 'open', ?, NULL
      FROM store_state ss
      CROSS JOIN projection_meta pm
      INNER JOIN ingestion_runs r
        ON r.run_id = ? AND r.store_id = ss.store_id
       AND r.state = 'publishing'
       AND r.support_generation = ?
       AND r.projection_epoch = ?
       AND r.recovery_epoch = ?
      INNER JOIN ingestion_inbox i
       ON i.idempotency_key = ? AND i.store_id = ss.store_id
       AND i.run_id = r.run_id AND i.status = 'claimed'
       AND i.recovery_epoch = ?
       AND i.payload_artifact_id = r.payload_artifact_id
      WHERE ss.store_id = ?
        AND ss.store_generation = ?
        AND ss.support_generation = ?
        AND ss.support_state IN ('active', 'degraded')
        AND ss.recovery_epoch_snapshot <= ?
        AND ss.activation_gate = 'approved'
        AND pm.id = 1
        AND pm.projection_epoch = ?
        AND EXISTS (
          SELECT 1 FROM retained_payloads p
          WHERE p.artifact_id = i.payload_artifact_id
            AND p.store_id = i.store_id
            AND p.run_id = i.run_id
            AND p.digest_sha256 = r.evidence_digest_sha256
            AND p.map_version = r.map_version
            AND p.parser_version = r.parser_version
            AND p.purged_at IS NULL
            AND p.expires_at > ?
        )
        AND EXISTS (
          SELECT 1 FROM search_projection_meta sm
          WHERE sm.id = 1 AND sm.active_slot = ?
        )
        AND NOT EXISTS (
          SELECT 1 FROM publication_claims pc
          WHERE pc.store_id = ? AND pc.status = 'open'
        )`,
    )
    .bind(
      f.claimId,
      f.storeId,
      f.runId,
      f.expectedStoreGeneration,
      f.expectedSupportGeneration,
      f.expectedProjectionEpoch,
      f.expectedRecoveryEpoch,
      nowIso,
      f.runId,
      f.expectedSupportGeneration,
      f.expectedProjectionEpoch,
      f.recoveryEpochAuthority,
      input.idempotencyKey,
      f.recoveryEpochAuthority,
      f.storeId,
      f.expectedStoreGeneration,
      f.expectedSupportGeneration,
      f.recoveryEpochAuthority,
      f.expectedProjectionEpoch,
      nowIso,
      selectedSlot,
      f.storeId,
    );

  const clearStaged = db
    .prepare(
      `DELETE FROM staged_offers
       WHERE run_id = ?
         AND EXISTS (
           SELECT 1 FROM publication_claims
           WHERE claim_id = ? AND run_id = ? AND status = 'open'
         )`,
    )
    .bind(f.runId, f.claimId, f.runId);

  const insertStaged = canonicalStaged.map((s) =>
    db
      .prepare(
        `INSERT INTO staged_offers (
          run_id, offer_id, store_id, source_key, continuity_fingerprint,
          canonical_pdp_url, merchant_variant_id,
          brand, specific_type, material_family, color, diameter_mm, mass_grams,
          listing_price_centavos, original_price_centavos, is_promotion, availability,
          observed_at, map_version, parser_version, normalize_policy_version,
          standalone_only, append_price_point, listing_title, search_text
        )
        SELECT c.run_id, ?, c.store_id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        FROM publication_claims c
        WHERE c.claim_id = ? AND c.run_id = ? AND c.store_id = ? AND c.status = 'open'`,
      )
      .bind(
        s.offerId, s.sourceKey, s.continuityFingerprint,
        s.canonicalPdpUrl,
        s.merchantVariantId, s.brand, s.specificType, s.materialFamily, s.color,
        s.diameterMm === null ? null : String(s.diameterMm), s.massGrams,
        s.listingPriceCentavos, s.originalPriceCentavos, boolInt(s.isPromotion),
        s.availability, s.observedAt, s.mapVersion, s.parserVersion,
        s.normalizePolicyVersion, boolInt(s.standaloneOnly),
        boolInt(s.listingPriceCentavos !== null && s.listingPriceCentavos > 0),
        s.listingTitle,
        buildSearchDocument([s.brand, s.materialFamily, s.listingTitle]),
        f.claimId, f.runId, f.storeId,
      ),
  );

  // Upsert offers conditioned on open claim for this run.
  const upsertOffers = db
    .prepare(
      `INSERT INTO offers (
        offer_id, store_id, source_key, canonical_pdp_url, merchant_variant_id,
        continuity_fingerprint, store_generation, brand, specific_type, material_family,
        color, diameter_mm, mass_grams, listing_price_centavos, original_price_centavos,
        is_promotion, availability, observed_at, published_at, map_version, parser_version,
        normalize_policy_version, standalone_only, visible, tombstoned, stale_after,
        listing_title, search_text
      )
      SELECT
        s.offer_id, s.store_id, s.source_key, s.canonical_pdp_url, s.merchant_variant_id,
        s.continuity_fingerprint, ?, s.brand, s.specific_type, s.material_family,
        s.color, s.diameter_mm, s.mass_grams, s.listing_price_centavos, s.original_price_centavos,
        s.is_promotion, s.availability, s.observed_at, ?, s.map_version, s.parser_version,
        s.normalize_policy_version, s.standalone_only, 1, 0,
        strftime('%Y-%m-%dT%H:%M:%fZ', s.observed_at, '+48 hours'),
        s.listing_title, s.search_text
      FROM staged_offers s
      INNER JOIN publication_claims c
        ON c.claim_id = ? AND c.run_id = s.run_id AND c.status = 'open'
      WHERE s.run_id = ?
      ON CONFLICT(offer_id) DO UPDATE SET
        continuity_fingerprint = excluded.continuity_fingerprint,
        store_generation = excluded.store_generation,
        brand = excluded.brand,
        specific_type = excluded.specific_type,
        material_family = excluded.material_family,
        color = excluded.color,
        diameter_mm = excluded.diameter_mm,
        mass_grams = excluded.mass_grams,
        listing_price_centavos = excluded.listing_price_centavos,
        original_price_centavos = excluded.original_price_centavos,
        is_promotion = excluded.is_promotion,
        availability = excluded.availability,
        observed_at = excluded.observed_at,
        stale_after = excluded.stale_after,
        published_at = excluded.published_at,
        map_version = excluded.map_version,
        parser_version = excluded.parser_version,
        normalize_policy_version = excluded.normalize_policy_version,
        standalone_only = excluded.standalone_only,
        listing_title = excluded.listing_title,
        search_text = excluded.search_text,
        visible = 1,
        tombstoned = 0
      WHERE excluded.observed_at >= offers.observed_at
        AND EXISTS (
        SELECT 1 FROM publication_claims c2
        WHERE c2.claim_id = ? AND c2.status = 'open'
      )`,
    )
    .bind(nextGeneration, nowIso, f.claimId, f.runId, f.claimId);

  // Mark prior effective price points non-effective only when the newly staged
  // price/original tuple actually differs (evaluated against pre-batch state —
  // must run AFTER insertPricePoints' dedup check reads the same effective rows,
  // otherwise every publish would spuriously look like a price change).
  const supersedePricePoints = db
    .prepare(
      `UPDATE price_points
       SET effective = 0
       WHERE effective = 1
         AND EXISTS (
           SELECT 1 FROM staged_offers s
           INNER JOIN publication_claims c
             ON c.claim_id = ? AND c.status = 'open' AND c.run_id = s.run_id
           WHERE s.run_id = ? AND s.offer_id = price_points.offer_id
             AND s.append_price_point = 1
             AND s.listing_price_centavos IS NOT NULL
             AND s.observed_at >= price_points.observed_at
             AND NOT (
               price_points.listing_price_centavos IS s.listing_price_centavos
               AND price_points.original_price_centavos IS s.original_price_centavos
             )
         )
         AND EXISTS (
           SELECT 1 FROM publication_claims c2
           WHERE c2.claim_id = ? AND c2.status = 'open'
         )`,
    )
    .bind(f.claimId, f.runId, f.claimId);

  const insertPricePoints = db
    .prepare(
      `INSERT OR IGNORE INTO price_points (
        price_point_id, offer_id, store_id, run_id,
        listing_price_centavos, original_price_centavos,
        observed_at, recorded_at, corrects_price_point_id, effective
      )
      SELECT
        'pp_' || s.offer_id || '_' || s.run_id,
        s.offer_id, s.store_id, s.run_id,
        s.listing_price_centavos, s.original_price_centavos,
        s.observed_at, ?, NULL, 1
      FROM staged_offers s
      INNER JOIN publication_claims c
        ON c.claim_id = ? AND c.status = 'open' AND c.run_id = s.run_id
      WHERE s.run_id = ?
        AND s.append_price_point = 1
        AND s.listing_price_centavos IS NOT NULL
        AND s.observed_at >= (
          SELECT o.observed_at FROM offers o WHERE o.offer_id = s.offer_id
        )
        AND (
          NOT EXISTS (
            SELECT 1 FROM price_points pp
            WHERE pp.offer_id = s.offer_id AND pp.effective = 1
              AND pp.listing_price_centavos IS s.listing_price_centavos
              AND pp.original_price_centavos IS s.original_price_centavos
          )
        )`,
    )
    .bind(nowIso, f.claimId, f.runId);

  const statements: D1PreparedStatement[] = [
    claim,
    clearStaged,
    ...insertStaged,
    upsertOffers,
    insertPricePoints,
    supersedePricePoints,
  ];

  let absenceIdx: number | null = null;
  if (input.markAbsentUnavailable && input.publicationClass === "authoritative-complete") {
    absenceIdx = statements.length;
    statements.push(
      db
        .prepare(
          `UPDATE offers
           SET availability = 'unavailable', published_at = ?
           WHERE store_id = ?
             AND visible = 1
             AND tombstoned = 0
             AND offer_id NOT IN (
               SELECT offer_id FROM staged_offers WHERE run_id = ?
             )
             AND EXISTS (
               SELECT 1 FROM publication_claims c
               WHERE c.claim_id = ? AND c.status = 'open'
             )`,
        )
        .bind(nowIso, f.storeId, f.runId, f.claimId),
    );
  }

  // FTS visibility in the same generation-fenced batch (AD-8 / AD-9).
  statements.push(
    db
      .prepare(sqlDeleteStoreFtsDocs(selectedSlot))
      .bind(f.storeId, f.claimId),
    db
      .prepare(sqlInsertStoreFtsDocs(selectedSlot))
      .bind(f.storeId, f.claimId),
    db
      .prepare(sqlBumpSearchWriteGeneration())
      .bind(nowIso, f.claimId),
  );

  // Advance store generation + health only when claim is open.
  statements.push(
    db
      .prepare(
        `UPDATE store_state
         SET store_generation = ?,
             recovery_epoch_snapshot = ?,
             last_run_id = ?,
             last_run_outcome = ?,
             last_failure_codes_json = ?,
             observation_count = ?,
             published_offer_count = (
               SELECT COUNT(*) FROM offers
               WHERE store_id = ? AND visible = 1 AND tombstoned = 0
             ),
             freshness_observed_at = CASE
               WHEN freshness_observed_at IS NULL THEN ?
               WHEN ? > freshness_observed_at THEN ?
               ELSE freshness_observed_at
             END,
             updated_at = ?
         WHERE store_id = ?
           AND store_generation = ?
           AND EXISTS (
             SELECT 1 FROM publication_claims c
             WHERE c.claim_id = ? AND c.status = 'open'
           )`,
      )
      .bind(
        nextGeneration,
        f.recoveryEpochAuthority,
        f.runId,
        runOutcome,
        JSON.stringify(failureCodes),
        observationCount,
        f.storeId,
        canonicalStaged.reduce<string | null>(
          (latest, row) => latest === null || row.observedAt > latest ? row.observedAt : latest,
          null,
        ),
        canonicalStaged.reduce<string | null>(
          (latest, row) => latest === null || row.observedAt > latest ? row.observedAt : latest,
          null,
        ),
        canonicalStaged.reduce<string | null>(
          (latest, row) => latest === null || row.observedAt > latest ? row.observedAt : latest,
          null,
        ),
        nowIso,
        f.storeId,
        f.expectedStoreGeneration,
        f.claimId,
      ),
  );

  statements.push(
    db
      .prepare(
        `UPDATE ingestion_runs
         SET state = 'published',
             store_generation = ?,
             publication_class = ?,
             updated_at = ?,
             terminal_at = ?
         WHERE run_id = ?
           AND state = 'publishing'
           AND EXISTS (
             SELECT 1 FROM publication_claims c
             WHERE c.claim_id = ? AND c.status = 'open'
           )`,
      )
      .bind(
        nextGeneration,
        input.publicationClass,
        nowIso,
        nowIso,
        f.runId,
        f.claimId,
      ),
  );

  statements.push(
    db
      .prepare(
        `UPDATE ingestion_inbox
         SET status = 'completed', completed_at = ?
         WHERE idempotency_key = ?
           AND status = 'claimed'
           AND EXISTS (
             SELECT 1 FROM publication_claims c
             WHERE c.claim_id = ? AND c.status = 'open'
           )`,
      )
      .bind(nowIso, input.idempotencyKey, f.claimId),
  );

  statements.push(
    db
      .prepare(
        `UPDATE publication_claims
         SET status = 'committed', completed_at = ?
         WHERE claim_id = ? AND status = 'open'`,
      )
      .bind(nowIso, f.claimId),
  );

  // Clear staging after success path (still claim-guarded via committed check).
  statements.push(
    db
      .prepare(
        `DELETE FROM staged_offers
         WHERE run_id = ?
           AND EXISTS (
             SELECT 1 FROM publication_claims c
             WHERE c.claim_id = ? AND c.status = 'committed'
           )`,
      )
      .bind(f.runId, f.claimId),
  );

  try {
    const results = await db.batch(statements);
    // Diagnostic only; safety comes from every write joining the open claim.
    const claimIdx = 0;
    const claimMeta = results[claimIdx] as D1Result | undefined;
    const claimChanges = claimMeta?.meta?.changes ?? 0;
    if (claimChanges === 0) {
      return {
        ok: false,
        code: "fence_mismatch",
        detail: "claim_insert_zero_rows",
      };
    }

    const upsertOffersIdx = 2 + insertStaged.length;
    const insertPricePointsIdx = upsertOffersIdx + 1;
    const publishedCount =
      (results[upsertOffersIdx] as D1Result | undefined)?.meta?.changes ??
      canonicalStaged.length;
    const pricePointsAppended =
      (results[insertPricePointsIdx] as D1Result | undefined)?.meta
        ?.changes ?? 0;
    const absentMarked =
      absenceIdx !== null
        ? ((results[absenceIdx] as D1Result | undefined)?.meta?.changes ?? 0)
        : 0;

    return {
      ok: true,
      newStoreGeneration: nextGeneration,
      publishedCount,
      pricePointsAppended,
      absentMarked,
    };
  } catch (error) {
    return {
      ok: false,
      code: "batch_failed",
      detail: error instanceof Error ? error.message : "unknown",
    };
  }
}

/**
 * Terminalize a run without publication (failed/quarantined/superseded/oversized).
 * Retains prior store generation. Still claims inbox completion for ACK safety.
 */
export async function terminalizeRunWithoutPublish(
  db: D1Database,
  input: {
    runId: string;
    storeId: string;
    state: "failed" | "quarantined" | "superseded";
    publicationClass: "publish-nothing";
    failureCodes: string[];
    idempotencyKey: string | null;
    nowIso: string;
    lastRunOutcome?: string;
  },
): Promise<void> {
  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE ingestion_runs
         SET state = ?,
             publication_class = ?,
             failure_codes_json = ?,
             updated_at = ?,
             terminal_at = ?
         WHERE run_id = ?
           AND state NOT IN ('published', 'failed', 'quarantined', 'superseded')`,
      )
      .bind(
        input.state,
        input.publicationClass,
        JSON.stringify(input.failureCodes),
        input.nowIso,
        input.nowIso,
        input.runId,
      ),
    db
      .prepare(
        `UPDATE store_state
         SET last_run_id = ?,
             last_run_outcome = ?,
             last_failure_codes_json = ?,
             updated_at = ?
         WHERE store_id = ?
           AND EXISTS (
             SELECT 1 FROM ingestion_runs
             WHERE run_id = ? AND state = ? AND updated_at = ?
           )
           AND NOT EXISTS (
             SELECT 1
             FROM ingestion_runs newer
             INNER JOIN ingestion_runs current_run ON current_run.run_id = ?
             WHERE newer.run_id = store_state.last_run_id
               AND newer.created_at > current_run.created_at
           )`,
      )
      .bind(
        input.runId,
        input.lastRunOutcome ?? input.state,
        JSON.stringify(input.failureCodes),
        input.nowIso,
        input.storeId,
        input.runId,
        input.state,
        input.nowIso,
        input.runId,
      ),
  ];
  if (input.idempotencyKey) {
    stmts.push(
      db
        .prepare(
          `UPDATE ingestion_inbox
           SET status = 'completed', completed_at = ?
           WHERE idempotency_key = ? AND store_id = ? AND run_id = ?
             AND status = 'claimed'`,
        )
        .bind(input.nowIso, input.idempotencyKey, input.storeId, input.runId),
    );
  }
  await db.batch(stmts);
}

/**
 * Append an operator-reviewed PricePoint correction without rewriting the
 * corrected fact. D1 triggers enforce same-Offer immutable lineage and the
 * partial unique index enforces a single effective successor.
 */
export async function appendPricePointCorrection(
  db: D1Database,
  input: {
    pricePointId: string;
    offerId: string;
    storeId: string;
    runId: string;
    listingPriceCentavos: number;
    originalPriceCentavos: number | null;
    observedAt: string;
    recordedAt: string;
    correctsPricePointId: string;
  },
): Promise<{ ok: true } | { ok: false; code: "correction_rejected" }> {
  const observedAt = canonicalizeUtcInstant(input.observedAt);
  const recordedAt = canonicalizeUtcInstant(input.recordedAt);
  if (observedAt === null || recordedAt === null) {
    return { ok: false, code: "correction_rejected" };
  }
  try {
    const [insert] = await db.batch([
      db
        .prepare(
          `INSERT INTO price_points (
             price_point_id, offer_id, store_id, run_id,
             listing_price_centavos, original_price_centavos,
             observed_at, recorded_at, corrects_price_point_id, effective
           )
           SELECT ?, corrected.offer_id, corrected.store_id, ?, ?, ?, ?, ?,
                  corrected.price_point_id, 1
           FROM price_points corrected
           WHERE corrected.price_point_id = ?
             AND corrected.offer_id = ?
             AND corrected.store_id = ?
             AND NOT EXISTS (
               SELECT 1 FROM price_points successor
               WHERE successor.corrects_price_point_id = corrected.price_point_id
                 AND successor.effective = 1
             )`,
        )
        .bind(
          input.pricePointId,
          input.runId,
          input.listingPriceCentavos,
          input.originalPriceCentavos,
          observedAt,
          recordedAt,
          input.correctsPricePointId,
          input.offerId,
          input.storeId,
        ),
      db
        .prepare(
          `UPDATE price_points
           SET effective = 0
           WHERE price_point_id = ?
             AND offer_id = ?
             AND EXISTS (
               SELECT 1 FROM price_points correction
               WHERE correction.price_point_id = ?
                 AND correction.corrects_price_point_id = price_points.price_point_id
                 AND correction.effective = 1
             )`,
        )
        .bind(input.correctsPricePointId, input.offerId, input.pricePointId),
    ]);
    return (insert?.meta?.changes ?? 0) === 1
      ? { ok: true }
      : { ok: false, code: "correction_rejected" };
  } catch {
    return { ok: false, code: "correction_rejected" };
  }
}

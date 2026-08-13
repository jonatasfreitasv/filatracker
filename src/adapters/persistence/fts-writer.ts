/** Explicit, set-based FTS5 ownership helpers. No triggers. */

import { canonicalizeUtcInstant } from "../../contracts/search-page";
import { NORMALIZE_POLICY_VERSION } from "../../domain/policy/normalize";

export type FtsSlot = "a" | "b";

export function ftsTable(slot: FtsSlot): string {
  return slot === "a" ? "search_fts_a" : "search_fts_b";
}

export function otherSlot(slot: FtsSlot): FtsSlot {
  return slot === "a" ? "b" : "a";
}

/** Bounded plan selector only; callers must revalidate the slot inside their batch. */
export async function selectActiveFtsSlot(db: D1Database): Promise<FtsSlot> {
  const row = await db.prepare(
    `SELECT active_slot FROM search_projection_meta WHERE id = 1 LIMIT 1`,
  ).first<{ active_slot: unknown }>();
  if (row?.active_slot !== "a" && row?.active_slot !== "b") {
    throw new Error("active_slot_unavailable");
  }
  return row.active_slot;
}

export const FTS_ELIGIBLE_OFFERS_SQL = `
  SELECT o.offer_id AS offer_id, o.search_text AS search_text
  FROM offers o
  INNER JOIN store_state ss ON ss.store_id = o.store_id
  WHERE o.visible = 1
    AND o.tombstoned = 0
    AND ss.support_state IN ('active', 'degraded')
`;

const TAXONOMY_REBUILD_READY_SQL = `
  SELECT COUNT(*) AS legacy_count
  FROM offers o
  INNER JOIN store_state ss ON ss.store_id = o.store_id
  WHERE o.visible = 1
    AND o.tombstoned = 0
    AND ss.support_state IN ('active', 'degraded')
    AND (
      o.normalize_policy_version < ${NORMALIZE_POLICY_VERSION}
      OR o.search_text IS NULL
      OR trim(o.search_text) = ''
    )
`;

/** Publication writes are selected by metadata inside the atomic batch. */
export function sqlDeleteStoreFtsDocs(slot: FtsSlot): string {
  return `
    DELETE FROM ${ftsTable(slot)}
    WHERE offer_id IN (SELECT offer_id FROM offers WHERE store_id = ?)
      AND EXISTS (
        SELECT 1 FROM publication_claims c
        INNER JOIN search_projection_meta sm ON sm.id = 1
        WHERE c.claim_id = ? AND c.status = 'open' AND sm.active_slot = '${slot}'
      )
  `;
}

export function sqlInsertStoreFtsDocs(slot: FtsSlot): string {
  return `
    INSERT INTO ${ftsTable(slot)} (offer_id, search_text)
    SELECT e.offer_id, e.search_text
    FROM (${FTS_ELIGIBLE_OFFERS_SQL}) e
    INNER JOIN offers o ON o.offer_id = e.offer_id
    WHERE o.store_id = ?
      AND EXISTS (
        SELECT 1 FROM publication_claims c
        INNER JOIN search_projection_meta sm ON sm.id = 1
        WHERE c.claim_id = ? AND c.status = 'open' AND sm.active_slot = '${slot}'
      )
  `;
}

export function sqlBumpSearchWriteGeneration(): string {
  return `
    UPDATE search_projection_meta
    SET search_write_generation = search_write_generation + 1,
        projection_epoch = (SELECT projection_epoch FROM projection_meta WHERE id = 1),
        updated_at = ?
    WHERE id = 1
      AND EXISTS (
        SELECT 1 FROM publication_claims c
        WHERE c.claim_id = ? AND c.status = 'open'
      )
  `;
}

/** Support transition writes require the exact successful transition token. */
export function sqlDeleteStoreFtsDocsForTransition(slot: FtsSlot): string {
  return `
    DELETE FROM ${ftsTable(slot)}
    WHERE offer_id IN (SELECT offer_id FROM offers WHERE store_id = ?)
      AND EXISTS (
        SELECT 1 FROM store_state ss
        INNER JOIN search_projection_meta sm ON sm.id = 1
        WHERE ss.store_id = ? AND ss.search_transition_token = ?
          AND sm.active_slot = '${slot}'
      )
  `;
}

export function sqlInsertStoreFtsDocsForTransition(slot: FtsSlot): string {
  return `
    INSERT INTO ${ftsTable(slot)} (offer_id, search_text)
    SELECT e.offer_id, e.search_text
    FROM (${FTS_ELIGIBLE_OFFERS_SQL}) e
    INNER JOIN offers o ON o.offer_id = e.offer_id
    WHERE o.store_id = ?
      AND EXISTS (
        SELECT 1 FROM store_state ss
        INNER JOIN search_projection_meta sm ON sm.id = 1
        WHERE ss.store_id = ? AND ss.search_transition_token = ?
          AND sm.active_slot = '${slot}'
      )
  `;
}

export function sqlClearFtsSlot(slot: FtsSlot): string {
  return `DELETE FROM ${ftsTable(slot)}`;
}

export function sqlRebuildFtsSlot(slot: FtsSlot): string {
  return `
    INSERT INTO ${ftsTable(slot)} (offer_id, search_text)
    SELECT offer_id, search_text FROM (${FTS_ELIGIBLE_OFFERS_SQL})
  `;
}

export type SearchProjectionMetaRow = {
  active_slot: FtsSlot;
  index_version: number;
  parser_version: number;
  projection_epoch: number;
  search_write_generation: number;
  rebuild_owner: string | null;
  rebuild_lease_expires_at: string | null;
};

export async function readSearchProjectionMeta(
  db: D1Database,
): Promise<SearchProjectionMetaRow | null> {
  return db.prepare(
    `SELECT active_slot, index_version, parser_version, projection_epoch,
            search_write_generation, rebuild_owner, rebuild_lease_expires_at
     FROM search_projection_meta WHERE id = 1`,
  ).first<SearchProjectionMetaRow>();
}

type RebuildFailureCode =
  | "meta_missing"
  | "stale_cas"
  | "validation_failed"
  | "batch_failed"
  | "mixed_taxonomy";

async function releaseOwnedShadow(
  db: D1Database,
  slot: FtsSlot,
  owner: string,
  nowIso: string,
): Promise<void> {
  try {
    await db.batch([
      db.prepare(
        `DELETE FROM ${ftsTable(slot)}
         WHERE EXISTS (
           SELECT 1 FROM search_projection_meta
           WHERE id = 1 AND active_slot <> ? AND rebuild_owner = ?
         )`,
      ).bind(slot, owner),
      db.prepare(
        `UPDATE search_projection_meta
         SET rebuild_owner = NULL, rebuild_lease_expires_at = NULL, updated_at = ?
         WHERE id = 1 AND rebuild_owner = ? AND active_slot <> ?`,
      ).bind(nowIso, owner, slot),
    ]);
  } catch {
    // Recovery can safely reclaim this owner; never clear an unowned/active slot.
  }
}

/** Claim, build, validate and activate one inactive slot. */
export async function rebuildSearchFtsShadow(
  db: D1Database,
  nowIso: string,
): Promise<
  | { ok: true; activatedSlot: FtsSlot; documentCount: number }
  | { ok: false; code: RebuildFailureCode; detail: string }
> {
  const canonicalNow = canonicalizeUtcInstant(nowIso);
  if (canonicalNow === null) {
    return { ok: false, code: "batch_failed", detail: "invalid_rebuild_time" };
  }

  let meta: SearchProjectionMetaRow | null;
  try {
    meta = await readSearchProjectionMeta(db);
  } catch {
    return { ok: false, code: "batch_failed", detail: "metadata_read_failed" };
  }
  if (!meta) return { ok: false, code: "meta_missing", detail: "meta_missing" };

  let owner: string;
  try {
    owner = crypto.randomUUID();
  } catch {
    return { ok: false, code: "batch_failed", detail: "uuid_generation_failed" };
  }
  const shadow = otherSlot(meta.active_slot);
  const nowMs = Date.parse(canonicalNow);
  const leaseExpiresAt = new Date(nowMs + 5 * 60_000).toISOString();
  let claimed: D1Result;
  try {
    claimed = await db.prepare(
      `UPDATE search_projection_meta
       SET rebuild_owner = ?, rebuild_lease_expires_at = ?, updated_at = ?
       WHERE id = 1
         AND (rebuild_owner IS NULL OR rebuild_lease_expires_at IS NULL OR rebuild_lease_expires_at <= ?)
         AND active_slot = ? AND index_version = ? AND parser_version = ?
         AND projection_epoch = ? AND search_write_generation = ?`,
    ).bind(
      owner,
      leaseExpiresAt,
      canonicalNow,
      canonicalNow,
      meta.active_slot,
      meta.index_version,
      meta.parser_version,
      meta.projection_epoch,
      meta.search_write_generation,
    ).run();
  } catch {
    return { ok: false, code: "batch_failed", detail: "ownership_claim_failed" };
  }
  if ((claimed.meta?.changes ?? 0) !== 1) {
    return { ok: false, code: "stale_cas", detail: "ownership_unavailable" };
  }

  try {
    await db.batch([
      db.prepare(
        `DELETE FROM ${ftsTable(shadow)}
         WHERE EXISTS (SELECT 1 FROM search_projection_meta WHERE id = 1 AND rebuild_owner = ? AND active_slot <> ?)`,
      ).bind(owner, shadow),
      db.prepare(
        `INSERT INTO ${ftsTable(shadow)} (offer_id, search_text)
         SELECT offer_id, search_text FROM (${FTS_ELIGIBLE_OFFERS_SQL})
         WHERE EXISTS (SELECT 1 FROM search_projection_meta WHERE id = 1 AND rebuild_owner = ? AND active_slot <> ?)`,
      ).bind(owner, shadow),
    ]);

    const validation = await db.prepare(
      `SELECT
        (SELECT COUNT(*) FROM (${FTS_ELIGIBLE_OFFERS_SQL})) AS expected_count,
        (SELECT COUNT(*) FROM ${ftsTable(shadow)}) AS built_count,
        (SELECT COUNT(*) FROM (${FTS_ELIGIBLE_OFFERS_SQL}) expected
          WHERE NOT EXISTS (
            SELECT 1 FROM ${ftsTable(shadow)} built
            WHERE built.offer_id = expected.offer_id
          )) AS expected_only_count,
        (SELECT COUNT(*) FROM ${ftsTable(shadow)} built
          WHERE NOT EXISTS (
            SELECT 1 FROM (${FTS_ELIGIBLE_OFFERS_SQL}) expected
            WHERE expected.offer_id = built.offer_id
          )) AS built_only_count`,
    ).first<{
      expected_count: number;
      built_count: number;
      expected_only_count: number;
      built_only_count: number;
    }>();
    if (
      !validation || validation.expected_count !== validation.built_count ||
      validation.expected_only_count !== 0 || validation.built_only_count !== 0
    ) {
      await releaseOwnedShadow(db, shadow, owner, canonicalNow);
      return { ok: false, code: "validation_failed", detail: "identity_set_mismatch" };
    }

    const cas = await db.prepare(
      `UPDATE search_projection_meta
       SET active_slot = ?, rebuild_owner = NULL,
           rebuild_lease_expires_at = NULL, updated_at = ?
       WHERE id = 1 AND rebuild_owner = ? AND active_slot = ?
         AND rebuild_lease_expires_at = ?
         AND index_version = ? AND parser_version = ?
         AND projection_epoch = ? AND search_write_generation = ?`,
    ).bind(
      shadow,
      canonicalNow,
      owner,
      meta.active_slot,
      leaseExpiresAt,
      meta.index_version,
      meta.parser_version,
      meta.projection_epoch,
      meta.search_write_generation,
    ).run();
    if ((cas.meta?.changes ?? 0) !== 1) {
      await releaseOwnedShadow(db, shadow, owner, canonicalNow);
      return { ok: false, code: "stale_cas", detail: "concurrent_change" };
    }

    // The former active slot may be cleared only while it is still inactive
    // and no subsequent rebuild owns it.
    await db.prepare(
      `DELETE FROM ${ftsTable(meta.active_slot)}
       WHERE EXISTS (
         SELECT 1 FROM search_projection_meta
         WHERE id = 1 AND active_slot = ? AND rebuild_owner IS NULL
       )`,
    ).bind(shadow).run().catch(() => undefined);

    return {
      ok: true,
      activatedSlot: shadow,
      documentCount: validation.expected_count,
    };
  } catch {
    await releaseOwnedShadow(db, shadow, owner, canonicalNow);
    return { ok: false, code: "batch_failed", detail: "rebuild_failed" };
  }
}

/**
 * Taxonomy + FTS shadow cutover. Reuses the FTS lease/CAS coordinator.
 * Mixed taxonomy_version or a stale projection epoch cannot become public.
 * Existing eligible offers must already carry current-policy taxonomy/search data;
 * this rebuild never guesses or mutates live rows before the final CAS.
 */
export async function rebuildTaxonomyAndFtsShadow(
  db: D1Database,
  nowIso: string,
  input: {
    expectedTaxonomyVersion: number;
    targetTaxonomyVersion: number;
  },
): Promise<
  | { ok: true; activatedSlot: FtsSlot; documentCount: number; taxonomyVersion: number }
  | { ok: false; code: RebuildFailureCode; detail: string }
> {
  if (
    !Number.isSafeInteger(input.expectedTaxonomyVersion) ||
    !Number.isSafeInteger(input.targetTaxonomyVersion) ||
    input.targetTaxonomyVersion < 1 ||
    input.targetTaxonomyVersion < input.expectedTaxonomyVersion
  ) {
    return { ok: false, code: "mixed_taxonomy", detail: "invalid_taxonomy_target" };
  }

  const canonicalNow = canonicalizeUtcInstant(nowIso);
  if (canonicalNow === null) {
    return { ok: false, code: "batch_failed", detail: "invalid_rebuild_time" };
  }

  let meta: SearchProjectionMetaRow | null;
  try {
    meta = await readSearchProjectionMeta(db);
  } catch {
    return { ok: false, code: "batch_failed", detail: "metadata_read_failed" };
  }
  if (!meta) return { ok: false, code: "meta_missing", detail: "meta_missing" };

  const projection = await db.prepare(
    `SELECT projection_epoch, taxonomy_version FROM projection_meta WHERE id = 1`,
  ).first<{ projection_epoch: number; taxonomy_version: number }>();
  if (!projection) return { ok: false, code: "meta_missing", detail: "meta_missing" };
  if (
    projection.taxonomy_version !== input.expectedTaxonomyVersion ||
    projection.projection_epoch !== meta.projection_epoch
  ) {
    return { ok: false, code: "mixed_taxonomy", detail: "taxonomy_version_mismatch" };
  }

  let owner: string;
  try {
    owner = crypto.randomUUID();
  } catch {
    return { ok: false, code: "batch_failed", detail: "uuid_generation_failed" };
  }
  const shadow = otherSlot(meta.active_slot);
  const leaseExpiresAt = new Date(Date.parse(canonicalNow) + 5 * 60_000).toISOString();
  let claimed: D1Result;
  try {
    claimed = await db.prepare(
      `UPDATE search_projection_meta
       SET rebuild_owner = ?, rebuild_lease_expires_at = ?, updated_at = ?
       WHERE id = 1
         AND (rebuild_owner IS NULL OR rebuild_lease_expires_at IS NULL OR rebuild_lease_expires_at <= ?)
         AND active_slot = ? AND index_version = ? AND parser_version = ?
         AND projection_epoch = ? AND search_write_generation = ?`,
    ).bind(
      owner, leaseExpiresAt, canonicalNow, canonicalNow,
      meta.active_slot, meta.index_version, meta.parser_version,
      meta.projection_epoch, meta.search_write_generation,
    ).run();
  } catch {
    return { ok: false, code: "batch_failed", detail: "ownership_claim_failed" };
  }
  if ((claimed.meta?.changes ?? 0) !== 1) {
    return { ok: false, code: "stale_cas", detail: "ownership_unavailable" };
  }

  try {
    const legacy = await db.prepare(TAXONOMY_REBUILD_READY_SQL).first<{ legacy_count: number }>();
    if ((legacy?.legacy_count ?? 0) !== 0) {
      await releaseOwnedShadow(db, shadow, owner, canonicalNow);
      return {
        ok: false,
        code: "validation_failed",
        detail: "legacy_offer_requires_republish",
      };
    }

    await db.batch([
      db.prepare(
        `DELETE FROM ${ftsTable(shadow)}
         WHERE EXISTS (SELECT 1 FROM search_projection_meta WHERE id = 1 AND rebuild_owner = ? AND active_slot <> ?)`,
      ).bind(owner, shadow),
      db.prepare(
        `INSERT INTO ${ftsTable(shadow)} (offer_id, search_text)
         SELECT offer_id, search_text FROM (${FTS_ELIGIBLE_OFFERS_SQL})
         WHERE EXISTS (SELECT 1 FROM search_projection_meta WHERE id = 1 AND rebuild_owner = ? AND active_slot <> ?)`,
      ).bind(owner, shadow),
    ]);

    const validation = await db.prepare(
      `SELECT
        (SELECT COUNT(*) FROM (${FTS_ELIGIBLE_OFFERS_SQL})) AS expected_count,
        (SELECT COUNT(*) FROM ${ftsTable(shadow)}) AS built_count,
        (SELECT COUNT(*) FROM (${FTS_ELIGIBLE_OFFERS_SQL}) expected
          WHERE NOT EXISTS (
            SELECT 1 FROM ${ftsTable(shadow)} built
            WHERE built.offer_id = expected.offer_id
          )) AS expected_only_count,
        (SELECT COUNT(*) FROM ${ftsTable(shadow)} built
          WHERE NOT EXISTS (
            SELECT 1 FROM (${FTS_ELIGIBLE_OFFERS_SQL}) expected
            WHERE expected.offer_id = built.offer_id
          )) AS built_only_count`,
    ).first<{
      expected_count: number;
      built_count: number;
      expected_only_count: number;
      built_only_count: number;
    }>();
    if (
      !validation || validation.expected_count !== validation.built_count ||
      validation.expected_only_count !== 0 || validation.built_only_count !== 0
    ) {
      await releaseOwnedShadow(db, shadow, owner, canonicalNow);
      return { ok: false, code: "validation_failed", detail: "identity_set_mismatch" };
    }

    const cas = await db.batch([
      db.prepare(
        `UPDATE projection_meta
         SET taxonomy_version = ?, projection_epoch = projection_epoch + 1, updated_at = ?
         WHERE id = 1 AND taxonomy_version = ? AND projection_epoch = ?`,
      ).bind(
        input.targetTaxonomyVersion, canonicalNow,
        input.expectedTaxonomyVersion, projection.projection_epoch,
      ),
      db.prepare(
        `UPDATE search_projection_meta
         SET active_slot = ?, rebuild_owner = NULL, rebuild_lease_expires_at = NULL,
             projection_epoch = (SELECT projection_epoch FROM projection_meta WHERE id = 1),
             search_write_generation = search_write_generation + 1, updated_at = ?
         WHERE id = 1 AND rebuild_owner = ? AND active_slot = ?
           AND rebuild_lease_expires_at = ?
           AND index_version = ? AND parser_version = ?
           AND projection_epoch = ? AND search_write_generation = ?
           AND EXISTS (
             SELECT 1 FROM projection_meta
             WHERE id = 1 AND taxonomy_version = ? AND projection_epoch = ? + 1
           )`,
      ).bind(
        shadow, canonicalNow, owner, meta.active_slot, leaseExpiresAt,
        meta.index_version, meta.parser_version,
        meta.projection_epoch, meta.search_write_generation,
        input.targetTaxonomyVersion, projection.projection_epoch,
      ),
    ]);
    if ((cas[0]?.meta?.changes ?? 0) !== 1 || (cas[1]?.meta?.changes ?? 0) !== 1) {
      await db.prepare(
        `UPDATE projection_meta
         SET taxonomy_version = ?, projection_epoch = ?, updated_at = ?
         WHERE id = 1 AND taxonomy_version = ? AND projection_epoch = ?`,
      ).bind(
        input.expectedTaxonomyVersion,
        projection.projection_epoch,
        canonicalNow,
        input.targetTaxonomyVersion,
        projection.projection_epoch + 1,
      ).run().catch(() => undefined);
      await releaseOwnedShadow(db, shadow, owner, canonicalNow);
      return { ok: false, code: "mixed_taxonomy", detail: "taxonomy_cas_rejected" };
    }

    await db.prepare(
      `DELETE FROM ${ftsTable(meta.active_slot)}
       WHERE EXISTS (
         SELECT 1 FROM search_projection_meta
         WHERE id = 1 AND active_slot = ? AND rebuild_owner IS NULL
       )`,
    ).bind(shadow).run().catch(() => undefined);

    return {
      ok: true,
      activatedSlot: shadow,
      documentCount: validation.expected_count,
      taxonomyVersion: input.targetTaxonomyVersion,
    };
  } catch {
    await releaseOwnedShadow(db, shadow, owner, canonicalNow);
    return { ok: false, code: "batch_failed", detail: "rebuild_failed" };
  }
}

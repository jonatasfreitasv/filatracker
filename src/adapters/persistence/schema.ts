import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Persistence schema (AD-10 / AD-22).
 * Drizzle types stay inside this adapter — ports expose domain/contract types only.
 * FTS5 writer is Story 1.4 — relational Offer facts only here.
 */

/** Singleton projection/support epoch bookkeeping (Story 1.1). */
export const projectionMeta = sqliteTable("projection_meta", {
  id: integer("id").primaryKey().notNull(),
  projectionEpoch: integer("projection_epoch").notNull(),
  supportEpoch: integer("support_epoch").notNull(),
  updatedAt: text("updated_at").notNull(),
  taxonomyVersion: integer("taxonomy_version").notNull().default(1),
});

/** Reviewed Material Family records (Story 1.6). */
export const materialFamilies = sqliteTable("material_families", {
  familyId: text("family_id").primaryKey().notNull(),
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
  taxonomyVersion: integer("taxonomy_version").notNull(),
  provenance: text("provenance").notNull(),
});

/** Formulation Specific Types — not product-kind filament|kit (Story 1.6). */
export const specificTypes = sqliteTable("specific_types", {
  specificTypeId: text("specific_type_id").primaryKey().notNull(),
  familyId: text("family_id").notNull(),
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
  taxonomyVersion: integer("taxonomy_version").notNull(),
  provenance: text("provenance").notNull(),
});

/** Filament Brand records — not Store ids (Story 1.6). */
export const brands = sqliteTable("brands", {
  brandId: text("brand_id").primaryKey().notNull(),
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
  taxonomyVersion: integer("taxonomy_version").notNull(),
  provenance: text("provenance").notNull(),
});

/** Reviewed alternate/old slugs. Canonical slugs are never self-aliased. */
export const taxonomyAliases = sqliteTable("taxonomy_aliases", {
  aliasSlug: text("alias_slug").primaryKey().notNull(),
  kind: text("kind").notNull(),
  targetId: text("target_id").notNull(),
  reviewed: integer("reviewed").notNull(),
});

/** Split/retired public slugs → HTTP 410. */
export const taxonomyGone = sqliteTable("taxonomy_gone", {
  goneSlug: text("gone_slug").notNull(),
  kind: text("kind").notNull(),
  taxonomyVersion: integer("taxonomy_version").notNull(),
  reason: text("reason").notNull(),
});

/**
 * Search FTS projection metadata (Story 1.4).
 * Active slot + search-write generation; FTS virtual tables are not modeled in Drizzle.
 */
export const searchProjectionMeta = sqliteTable("search_projection_meta", {
  id: integer("id").primaryKey().notNull(),
  activeSlot: text("active_slot").notNull(),
  indexVersion: integer("index_version").notNull(),
  parserVersion: integer("parser_version").notNull(),
  projectionEpoch: integer("projection_epoch").notNull(),
  searchWriteGeneration: integer("search_write_generation").notNull(),
  rebuildOwner: text("rebuild_owner"),
  rebuildLeaseExpiresAt: text("rebuild_lease_expires_at"),
  updatedAt: text("updated_at").notNull(),
});

/** Per-Store support/generation + activation gate. */
export const storeState = sqliteTable("store_state", {
  storeId: text("store_id").primaryKey().notNull(),
  supportState: text("support_state").notNull(),
  supportGeneration: integer("support_generation").notNull(),
  storeGeneration: integer("store_generation").notNull(),
  activationGate: text("activation_gate").notNull(),
  recoveryEpochSnapshot: integer("recovery_epoch_snapshot").notNull(),
  lastRunId: text("last_run_id"),
  lastRunOutcome: text("last_run_outcome"),
  lastFailureCodesJson: text("last_failure_codes_json").notNull(),
  observationCount: integer("observation_count"),
  publishedOfferCount: integer("published_offer_count"),
  freshnessObservedAt: text("freshness_observed_at"),
  updatedAt: text("updated_at").notNull(),
  displayName: text("display_name"),
});

/** Audited Store lifecycle transitions. */
export const storeLifecycleAudit = sqliteTable("store_lifecycle_audit", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  storeId: text("store_id").notNull(),
  fromState: text("from_state"),
  toState: text("to_state").notNull(),
  actor: text("actor").notNull(),
  reason: text("reason").notNull(),
  at: text("at").notNull(),
});

/** Ingestion runs — sole coordinator writer. */
export const ingestionRuns = sqliteTable(
  "ingestion_runs",
  {
    runId: text("run_id").primaryKey().notNull(),
    storeId: text("store_id").notNull(),
    state: text("state").notNull(),
    probeId: text("probe_id"),
    storeGeneration: integer("store_generation"),
    supportGeneration: integer("support_generation").notNull(),
    projectionEpoch: integer("projection_epoch").notNull(),
    recoveryEpoch: integer("recovery_epoch").notNull(),
    publicationClass: text("publication_class"),
    failureCodesJson: text("failure_codes_json").notNull(),
    evidenceDigestSha256: text("evidence_digest_sha256"),
    payloadArtifactId: text("payload_artifact_id"),
    mapVersion: integer("map_version"),
    parserVersion: integer("parser_version"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    terminalAt: text("terminal_at"),
  },
  (t) => [uniqueIndex("ingestion_runs_store_run_idx").on(t.storeId, t.runId)],
);

/**
 * Inbox idempotency — outlives retry/DLQ/replay/recovery horizons.
 * Unique on idempotency_key.
 */
export const ingestionInbox = sqliteTable(
  "ingestion_inbox",
  {
    idempotencyKey: text("idempotency_key").primaryKey().notNull(),
    storeId: text("store_id").notNull(),
    runId: text("run_id").notNull(),
    messageId: text("message_id").notNull(),
    status: text("status").notNull(), // claimed | completed | quarantined
    recoveryEpoch: integer("recovery_epoch").notNull(),
    payloadArtifactId: text("payload_artifact_id"),
    claimedAt: text("claimed_at").notNull(),
    completedAt: text("completed_at"),
  },
  (t) => [
    uniqueIndex("ingestion_inbox_message_idx").on(t.messageId),
  ],
);

/** Immutable retained structured payloads (not Queue bodies / HTML / R2 / KV). */
export const retainedPayloads = sqliteTable("retained_payloads", {
  artifactId: text("artifact_id").primaryKey().notNull(),
  storeId: text("store_id").notNull(),
  runId: text("run_id").notNull(),
  digestSha256: text("digest_sha256").notNull(),
  contractVersion: integer("contract_version").notNull(),
  mapVersion: integer("map_version").notNull(),
  parserVersion: integer("parser_version").notNull(),
  payloadJson: text("payload_json").notNull(),
  byteLength: integer("byte_length").notNull(),
  expiresAt: text("expires_at").notNull(),
  purgedAt: text("purged_at"),
  createdAt: text("created_at").notNull(),
});

/** Durable Offer identity + current published facts. */
export const offers = sqliteTable(
  "offers",
  {
    offerId: text("offer_id").primaryKey().notNull(),
    storeId: text("store_id").notNull(),
    sourceKey: text("source_key").notNull(),
    canonicalPdpUrl: text("canonical_pdp_url").notNull(),
    merchantVariantId: text("merchant_variant_id"),
    continuityFingerprint: text("continuity_fingerprint").notNull(),
    storeGeneration: integer("store_generation").notNull(),
    brand: text("brand"),
    specificType: text("specific_type"),
    materialFamily: text("material_family"),
    color: text("color"),
    diameterMm: text("diameter_mm"),
    massGrams: integer("mass_grams"),
    listingPriceCentavos: integer("listing_price_centavos"),
    originalPriceCentavos: integer("original_price_centavos"),
    isPromotion: integer("is_promotion").notNull(),
    availability: text("availability").notNull(),
    observedAt: text("observed_at").notNull(),
    staleAfter: text("stale_after").notNull(),
    publishedAt: text("published_at").notNull(),
    mapVersion: integer("map_version").notNull(),
    parserVersion: integer("parser_version").notNull(),
    normalizePolicyVersion: integer("normalize_policy_version").notNull(),
    standaloneOnly: integer("standalone_only").notNull(),
    visible: integer("visible").notNull(),
    tombstoned: integer("tombstoned").notNull(),
    listingTitle: text("listing_title"),
    searchText: text("search_text").notNull(),
    brandId: text("brand_id"),
    materialFamilyId: text("material_family_id"),
    formulationSpecificTypeId: text("formulation_specific_type_id"),
  },
  (t) => [
    uniqueIndex("offers_source_key_uidx").on(t.sourceKey),
  ],
);

/** Alias / tombstone / reviewed lineage tuples. */
export const offerIdentityLineage = sqliteTable("offer_identity_lineage", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  offerId: text("offer_id").notNull(),
  sourceKey: text("source_key").notNull(),
  kind: text("kind").notNull(), // alias | tombstone | reviewed_split | quarantine
  detail: text("detail"),
  createdAt: text("created_at").notNull(),
});

/** Run-scoped staging table for set-based publication. */
export const stagedOffers = sqliteTable(
  "staged_offers",
  {
    runId: text("run_id").notNull(),
    offerId: text("offer_id").notNull(),
    storeId: text("store_id").notNull(),
    sourceKey: text("source_key").notNull(),
    continuityFingerprint: text("continuity_fingerprint").notNull(),
    canonicalPdpUrl: text("canonical_pdp_url").notNull(),
    merchantVariantId: text("merchant_variant_id"),
    brand: text("brand"),
    specificType: text("specific_type"),
    materialFamily: text("material_family"),
    color: text("color"),
    diameterMm: text("diameter_mm"),
    massGrams: integer("mass_grams"),
    listingPriceCentavos: integer("listing_price_centavos"),
    originalPriceCentavos: integer("original_price_centavos"),
    isPromotion: integer("is_promotion").notNull(),
    availability: text("availability").notNull(),
    observedAt: text("observed_at").notNull(),
    mapVersion: integer("map_version").notNull(),
    parserVersion: integer("parser_version").notNull(),
    normalizePolicyVersion: integer("normalize_policy_version").notNull(),
    standaloneOnly: integer("standalone_only").notNull(),
    appendPricePoint: integer("append_price_point").notNull(),
    listingTitle: text("listing_title"),
    searchText: text("search_text").notNull(),
    brandId: text("brand_id"),
    materialFamilyId: text("material_family_id"),
    formulationSpecificTypeId: text("formulation_specific_type_id"),
  },
  (t) => [
    uniqueIndex("staged_offers_run_offer_uidx").on(t.runId, t.offerId),
  ],
);

/** Append-only PricePoints — (offerId, runId) unique. */
export const pricePoints = sqliteTable(
  "price_points",
  {
    pricePointId: text("price_point_id").primaryKey().notNull(),
    offerId: text("offer_id").notNull(),
    storeId: text("store_id").notNull(),
    runId: text("run_id").notNull(),
    listingPriceCentavos: integer("listing_price_centavos").notNull(),
    originalPriceCentavos: integer("original_price_centavos"),
    observedAt: text("observed_at").notNull(),
    recordedAt: text("recorded_at").notNull(),
    correctsPricePointId: text("corrects_price_point_id"),
    effective: integer("effective").notNull(),
  },
  (t) => [
    uniqueIndex("price_points_offer_run_uidx").on(t.offerId, t.runId),
    uniqueIndex("price_points_effective_correction_uidx")
      .on(t.correctsPricePointId)
      .where(sql`${t.correctsPricePointId} IS NOT NULL AND ${t.effective} = 1`),
  ],
);

/** Publication claim / CAS bookkeeping token. */
export const publicationClaims = sqliteTable("publication_claims", {
  claimId: text("claim_id").primaryKey().notNull(),
  storeId: text("store_id").notNull(),
  runId: text("run_id").notNull(),
  expectedStoreGeneration: integer("expected_store_generation").notNull(),
  expectedSupportGeneration: integer("expected_support_generation").notNull(),
  expectedProjectionEpoch: integer("expected_projection_epoch").notNull(),
  expectedRecoveryEpoch: integer("expected_recovery_epoch").notNull(),
  status: text("status").notNull(), // open | committed | aborted
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
});

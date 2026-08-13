/**
 * Durable Offer identity allocation + continuity (AD-16).
 * Source tuple → Offer ID. Compatible aliases preserve ID.
 * Incompatible source-tuple reuse → quarantine for reviewed lineage.
 */

import {
  assertCompatibleTupleReuse,
  deriveSourceTuple,
} from "./source-identity";

export const OFFER_IDENTITY_POLICY_VERSION = 1 as const;

export type OfferIdentityRecord = {
  offerId: string;
  sourceKey: string;
  storeId: string;
  canonicalPdpUrl: string;
  merchantVariantId: string | null;
  continuityFingerprint: string;
  tombstoned: boolean;
};

export type OfferContinuityEvidence = {
  brandEvidence: string | null;
  materialEvidence: string | null;
  massGrams: number | null;
  titleEvidence?: string | null;
};

export type OfferIdentityLineageKind =
  | "alias"
  | "tombstone"
  | "reviewed_split"
  | "quarantine";

/** Persistence-neutral read model for reviewed identity lineage. */
export type OfferIdentityLineageRecord = {
  sourceKey: string;
  offerId: string;
  kind: OfferIdentityLineageKind;
  continuityFingerprint?: string | null;
};

export type IdentityAllocation =
  | {
      ok: true;
      kind: "existing" | "new" | "alias";
      record: OfferIdentityRecord;
    }
  | {
      ok: false;
      code: "incompatible_reuse" | "tombstoned" | "invalid_tuple";
      detail: string;
    };

function canonicalSemantic(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ");
  return normalized || null;
}

/**
 * Semantic continuity proof, deliberately independent of URL/sourceKey.
 * A merchant can reuse the same URL/SKU; brand/material/mass changes reveal it.
 */
export function continuityFingerprint(
  evidence: OfferContinuityEvidence,
): string {
  const brand = canonicalSemantic(evidence.brandEvidence) ?? "-";
  const material = canonicalSemantic(evidence.materialEvidence) ?? "-";
  const mass =
    evidence.massGrams !== null && Number.isSafeInteger(evidence.massGrams)
      ? String(evidence.massGrams)
      : "-";
  return `semantic-v1|brand=${brand}|material=${material}|mass=${mass}`;
}

function semanticParts(fingerprint: string): Map<string, string> | null {
  if (!fingerprint.startsWith("semantic-v1|")) return null;
  return new Map(
    fingerprint
      .split("|")
      .slice(1)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), part.slice(index + 1)];
      }),
  );
}

function semanticFingerprintsCompatible(
  previous: string,
  current: string,
): boolean {
  const prior = semanticParts(previous);
  const next = semanticParts(current);
  // Legacy source-derived fingerprints contain no independent semantic proof.
  if (!prior || !next) return true;
  for (const key of ["brand", "material", "mass"]) {
    const left = prior.get(key);
    const right = next.get(key);
    if (left && right && left !== "-" && right !== "-" && left !== right) {
      return false;
    }
  }
  return true;
}

export function allocateOfferId(sourceKey: string): string {
  // Deterministic durable ID from source key — not random.
  // Workers crypto is available at runtime; tests use Web Crypto.
  return `off_${simpleHash(sourceKey)}`;
}

function simpleHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c;
    h2 = Math.imul(h2, 0x811c9dc5);
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0")
  );
}

/**
 * Allocate or resolve Offer identity from a source tuple against known records.
 * Incompatible reuse of an existing sourceKey mapping quarantines.
 */
export function resolveOfferIdentity(input: {
  storeId: string;
  pdpUrl: string;
  merchantVariantId: string | null;
  allowedHosts: readonly string[];
  apexToWww?: { apex: string; www: string };
  /** Existing records keyed by sourceKey. */
  bySourceKey: ReadonlyMap<string, OfferIdentityRecord>;
  /** Alias sourceKeys that map to an existing Offer. */
  aliases?: ReadonlyMap<string, string>;
  /** Explicit tombstoned source keys, including lineage-only old tuples. */
  tombstones?: ReadonlySet<string>;
  /** Reviewed aliases, tombstones, splits, and quarantined reuse decisions. */
  lineage?: ReadonlyMap<string, OfferIdentityLineageRecord>;
  continuityEvidence: OfferContinuityEvidence;
}): IdentityAllocation {
  const derived = deriveSourceTuple({
    storeId: input.storeId,
    pdpUrl: input.pdpUrl,
    merchantVariantId: input.merchantVariantId,
    allowedHosts: input.allowedHosts,
    apexToWww: input.apexToWww,
  });
  if (!derived.ok) {
    return { ok: false, code: "invalid_tuple", detail: derived.error.code };
  }
  const tuple = derived.tuple;
  const currentFingerprint = continuityFingerprint(input.continuityEvidence);

  if (input.tombstones?.has(tuple.sourceKey)) {
    return { ok: false, code: "tombstoned", detail: tuple.sourceKey };
  }

  const lineage = input.lineage?.get(tuple.sourceKey);
  if (lineage?.kind === "tombstone") {
    return { ok: false, code: "tombstoned", detail: lineage.offerId };
  }
  if (lineage?.kind === "quarantine") {
    return { ok: false, code: "incompatible_reuse", detail: tuple.sourceKey };
  }

  const aliasTarget =
    lineage?.kind === "alias" || lineage?.kind === "reviewed_split"
      ? lineage.offerId
      : input.aliases?.get(tuple.sourceKey);
  if (aliasTarget) {
    const existing = [...input.bySourceKey.values()].find(
      (r) => r.offerId === aliasTarget,
    );
    if (existing) {
      if (existing.tombstoned) {
        return { ok: false, code: "tombstoned", detail: existing.offerId };
      }
      const reviewedSplit = lineage?.kind === "reviewed_split";
      if (
        !reviewedSplit &&
        !semanticFingerprintsCompatible(
          lineage?.continuityFingerprint ?? existing.continuityFingerprint,
          currentFingerprint,
        )
      ) {
        return {
          ok: false,
          code: "incompatible_reuse",
          detail: tuple.sourceKey,
        };
      }
      return {
        ok: true,
        kind: "alias",
        record: {
          ...existing,
          sourceKey: tuple.sourceKey,
          canonicalPdpUrl: tuple.canonicalPdpUrl,
          merchantVariantId: tuple.merchantVariantId,
          continuityFingerprint: currentFingerprint,
        },
      };
    }
  }

  const existing = input.bySourceKey.get(tuple.sourceKey);
  if (existing) {
    if (existing.tombstoned) {
      return { ok: false, code: "tombstoned", detail: existing.offerId };
    }
    const compatibility = assertCompatibleTupleReuse(
      {
        policyVersion: 1,
        storeId: existing.storeId,
        canonicalPdpUrl: existing.canonicalPdpUrl,
        merchantVariantId: existing.merchantVariantId,
        sourceKey: existing.sourceKey,
      },
      tuple,
    );
    if (!compatibility.ok) {
      return {
        ok: false,
        code: "incompatible_reuse",
        detail: existing.sourceKey,
      };
    }
    if (
      !semanticFingerprintsCompatible(
        existing.continuityFingerprint,
        currentFingerprint,
      )
    ) {
      return {
        ok: false,
        code: "incompatible_reuse",
        detail: existing.sourceKey,
      };
    }
    return {
      ok: true,
      kind: "existing",
      record: {
        ...existing,
        // Upgrade legacy source-derived fingerprints on the next safe publish.
        continuityFingerprint: semanticParts(existing.continuityFingerprint)
          ? existing.continuityFingerprint
          : currentFingerprint,
      },
    };
  }

  const offerId = allocateOfferId(tuple.sourceKey);
  const record: OfferIdentityRecord = {
    offerId,
    sourceKey: tuple.sourceKey,
    storeId: tuple.storeId,
    canonicalPdpUrl: tuple.canonicalPdpUrl,
    merchantVariantId: tuple.merchantVariantId,
    continuityFingerprint: currentFingerprint,
    tombstoned: false,
  };
  return { ok: true, kind: "new", record };
}

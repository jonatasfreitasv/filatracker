import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createVoolt3dStoreAdapter } from "../../src/adapters/stores/voolt3d/adapter";
import {
  buildFixtureBodyMap,
  loadFixturePair,
} from "../helpers/fixture-runner";
import {
  extractJsonLdBlocks,
  extractVoolt3dPdp,
} from "../../src/adapters/stores/voolt3d/hooks";
import { RawOfferObservationAnySchema } from "../../src/contracts";
import { assessPromotion } from "../../src/domain/policy/promotion";
import { classifyFilamentEligibility } from "../../src/domain/policy/filament-eligibility";
import { loadVoolt3dMap } from "../../src/adapters/stores/voolt3d/map";

const dir = resolve("src/adapters/stores/voolt3d/fixtures");
const robotsBody = readFileSync(
  resolve("src/adapters/stores/voolt3d/robots-evidence/robots.txt"),
  "utf8",
);
const robotsUrl = "https://voolt3d.com.br/robots.txt";
const sitemapUrl = "https://voolt3d.com.br/sitemap.xml";

describe("Voolt3D homologation fixtures", () => {
  it("validates declarative map schema", () => {
    const map = loadVoolt3dMap();
    expect(map.storeId).toBe("voolt3d");
    expect(map.displayName).toBe("Voolt3D");
    expect(map.completeness.catalogWorkLimit).toBe(256);
    expect(map.pathAllowPrefixes).not.toContain("/");
  });

  it("extracts bounded observation from real PLA PDP excerpt (page-matched JSON-LD + LS.variants)", () => {
    const { html, meta } = loadFixturePair(dir, "pdp-pla-branco-dental");
    const candidate = extractVoolt3dPdp(html, meta.sourceUrl);
    expect(candidate.availability).toBe("available");
    expect(candidate.listingPriceCentavos).toBe(9558);
    expect(candidate.originalPriceCentavos).toBe(12499);
    expect(candidate.massGrams).toBe(1000);
    expect(candidate.merchantVariantId).toBe("PL-BR-DT-1");
    expect(candidate.materialEvidence).toMatch(/PLA/i);
    expect(candidate.brandEvidence).toMatch(/Voolt3D/i);

    // Related-product JSON-LD present but must not win over page match.
    expect(html).toMatch(/filamento-pla-azul-premium/);
    expect(html).toMatch(/window\.__evil/);
    const blocks = extractJsonLdBlocks(html);
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(
      classifyFilamentEligibility({
        titleEvidence: candidate.titleEvidence,
        materialEvidence: candidate.materialEvidence,
      }).eligible,
    ).toBe(true);
  });

  it("captures OOS as unavailable from real PLA excerpt", () => {
    const { html, meta } = loadFixturePair(dir, "pdp-pla-preto-oos");
    const candidate = extractVoolt3dPdp(html, meta.sourceUrl);
    expect(candidate.availability).toBe("unavailable");
    expect(candidate.listingPriceCentavos).toBe(12499);
  });

  it("keeps ambiguous kit mass null and retains eligibility", () => {
    const { html, meta } = loadFixturePair(dir, "pdp-kit-ambiguous-mass");
    const candidate = extractVoolt3dPdp(html, meta.sourceUrl);
    expect(candidate.massGrams).toBeNull();
    expect(
      classifyFilamentEligibility({
        titleEvidence: candidate.titleEvidence,
        materialEvidence: candidate.materialEvidence,
        descriptionEvidence: candidate.descriptionEvidence,
      }).eligible,
    ).toBe(true);
  });

  it("rejects non-filament printer via shared eligibility", () => {
    const { html, meta } = loadFixturePair(dir, "pdp-non-filament-printer");
    const candidate = extractVoolt3dPdp(html, meta.sourceUrl);
    expect(candidate.listingPriceCentavos).toBeNull();
    expect(
      classifyFilamentEligibility({
        titleEvidence: candidate.titleEvidence,
        materialEvidence: candidate.materialEvidence,
        descriptionEvidence: candidate.descriptionEvidence,
      }).eligible,
    ).toBe(false);
  });

  it("maps zero/invalid price to null centavos and unknown availability when missing", () => {
    const malformed = loadFixturePair(dir, "pdp-malformed-price");
    const bad = extractVoolt3dPdp(malformed.html, malformed.meta.sourceUrl);
    expect(bad.listingPriceCentavos).toBeNull();
    expect(bad.listingPriceRaw).toBeTruthy();

    const unk = loadFixturePair(dir, "pdp-availability-unknown");
    const u = extractVoolt3dPdp(unk.html, unk.meta.sourceUrl);
    expect(u.availability).toBe("unknown");
  });

  it("separates promotion extraction from shared promotion policy", () => {
    const valid = loadFixturePair(dir, "pdp-promotion-valid");
    const v = extractVoolt3dPdp(valid.html, valid.meta.sourceUrl);
    expect(
      assessPromotion({
        listingPriceCentavos: v.listingPriceCentavos,
        originalPriceCentavos: v.originalPriceCentavos,
      }).isPromotion,
    ).toBe(true);

    const invalid = loadFixturePair(dir, "pdp-promotion-invalid");
    const inv = extractVoolt3dPdp(invalid.html, invalid.meta.sourceUrl);
    expect(
      assessPromotion({
        listingPriceCentavos: inv.listingPriceCentavos,
        originalPriceCentavos: inv.originalPriceCentavos,
      }).isPromotion,
    ).toBe(false);
  });

  it("preserves compare-price evidence when LS.variants lacks compare_at_price", () => {
    const sourceUrl = "https://voolt3d.com.br/produtos/filamento-pla-branco-premium/";
    const candidate = extractVoolt3dPdp(
      `
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Filamento PLA Branco Premium 1kg",
        "sku": "PLA-BR-1",
        "brand": { "name": "Voolt3D" },
        "offers": {
          "@type": "Offer",
          "price": "95.58",
          "availability": "https://schema.org/InStock",
          "url": "${sourceUrl}"
        }
      }
      </script>
      <script>LS.variants = [{"price_short":"R$ 95,58"}];</script>
      <span class="js-compare-price-display">R$ 124,99</span>
      `,
      sourceUrl,
    );

    expect(candidate.listingPriceCentavos).toBe(9558);
    expect(candidate.originalPriceCentavos).toBe(12499);
    expect(
      assessPromotion({
        listingPriceCentavos: candidate.listingPriceCentavos,
        originalPriceCentavos: candidate.originalPriceCentavos,
      }).isPromotion,
    ).toBe(true);
  });

  it("fixture runner emits schema-valid observations and never empty-success on robots deny", async () => {
    const adapter = createVoolt3dStoreAdapter();
    const bodies = buildFixtureBodyMap(
      dir,
      [
        "pdp-pla-branco-dental",
        "pdp-non-filament-printer",
        "pdp-kit-ambiguous-mass",
      ],
      new Map([[robotsUrl, robotsBody]]),
    );

    const result = await adapter.observe({
      runId: "fixture-run-1",
      probeId: "fixtures",
      fixtureBodies: bodies,
    });

    expect(result.outcome).toBe("complete");
    expect(result.observations.length).toBeGreaterThanOrEqual(2);
    for (const obs of result.observations) {
      expect(RawOfferObservationAnySchema.parse(obs).storeId).toBe("voolt3d");
      expect(obs.contractVersion).toBe(2);
      expect("titleEvidence" in obs).toBe(true);
    }
    expect(result.omissions.some((o) => o.code === "non_filament")).toBe(true);
    expect(
      result.omissions.some((o) => o.code === "ambiguous_mass_retained"),
    ).toBe(true);

    const deniedBodies = new Map(bodies);
    deniedBodies.set(
      robotsUrl,
      readFileSync(
        resolve(
          "src/adapters/stores/voolt3d/robots-evidence/fixtures/deny-products.txt",
        ),
        "utf8",
      ),
    );
    const denied = await adapter.observe({
      runId: "fixture-run-deny",
      probeId: "fixtures",
      fixtureBodies: deniedBodies,
    });
    expect(denied.outcome).toBe("failed");
    expect(denied.observations).toEqual([]);
    expect(denied.failureCodes).toContain("robots_disallow");
  });

  it("records duplicate_source_tuple when apex and www candidate URLs canonicalize to the same identity", async () => {
    const adapter = createVoolt3dStoreAdapter();
    const { html } = loadFixturePair(dir, "pdp-pla-branco-dental");
    const wwwUrl =
      "https://www.voolt3d.com.br/produtos/filamento-pla-branco-dental-premium/";
    const apexUrl =
      "https://voolt3d.com.br/produtos/filamento-pla-branco-dental-premium/";

    const bodies = new Map<string, string>([
      [robotsUrl, robotsBody],
      [wwwUrl, html],
      [apexUrl, html],
    ]);

    const result = await adapter.observe({
      runId: "fixture-run-duplicate",
      probeId: "fixtures",
      fixtureBodies: bodies,
    });

    expect(result.observations.length).toBe(1);
    expect(
      result.omissions.some((o) => o.code === "duplicate_source_tuple"),
    ).toBe(true);
  });

  it("returns partial when a later candidate hits a terminal destination failure", async () => {
    const adapter = createVoolt3dStoreAdapter();
    const good = loadFixturePair(dir, "pdp-pla-branco-dental");
    const badUrl = "https://evil.example.com/produtos/fora-da-allowlist/";
    const bodies = new Map<string, string>([
      [robotsUrl, robotsBody],
      [good.meta.sourceUrl, good.html],
      [badUrl, good.html],
    ]);

    const result = await adapter.observe({
      runId: "fixture-run-partial-after-success",
      probeId: "fixtures",
      fixtureBodies: bodies,
    });

    expect(result.outcome).toBe("partial");
    if (result.outcome !== "partial") return;
    expect(result.observations).toHaveLength(1);
    expect(result.failureCodes).toContain("destination_rejected");
  });

  it("classifies sitemap bot walls as quarantined instead of generic failure", async () => {
    const adapter = createVoolt3dStoreAdapter();

    const result = await adapter.observe({
      runId: "fixture-run-sitemap-botwall",
      fetchImpl: async (url) => {
        if (url === robotsUrl) {
          return new Response(robotsBody, { status: 200 });
        }
        if (url === sitemapUrl) {
          return new Response("captcha", { status: 403 });
        }
        throw new Error(`unexpected_url:${url}`);
      },
    });

    expect(result.outcome).toBe("quarantined");
    if (result.outcome !== "quarantined") return;
    expect(result.failureCodes).toContain("captcha_or_auth_wall");
  });
});

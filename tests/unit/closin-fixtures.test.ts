import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createClosinStoreAdapter } from "../../src/adapters/stores/closin/adapter";
import {
  buildFixtureBodyMap,
  loadFixturePair,
} from "../helpers/fixture-runner";
import { extractClosinPdp, extractJsonLdBlocks } from "../../src/adapters/stores/closin/hooks";
import { RawOfferObservationSchema } from "../../src/contracts";
import { assessPromotion } from "../../src/domain/policy/promotion";
import { classifyFilamentEligibility } from "../../src/domain/policy/filament-eligibility";

const dir = resolve("src/adapters/stores/closin/fixtures");
const robotsBody = readFileSync(
  resolve("src/adapters/stores/closin/robots-evidence/robots.txt"),
  "utf8",
);
const robotsUrl = "https://www.closin.com.br/robots.txt";

describe("Closin homologation fixtures", () => {
  it("extracts bounded observation from real PLA PDP excerpt", () => {
    const { html, meta } = loadFixturePair(dir, "pdp-pla-branco");
    const candidate = extractClosinPdp(html, meta.sourceUrl);
    expect(candidate.availability).toBe("available");
    expect(candidate.listingPriceCentavos).toBe(8030);
    expect(candidate.massGrams).toBe(1000);
    expect(candidate.merchantVariantId).toBe("CLO-PLA-01BRA");
    expect(candidate.materialEvidence).toMatch(/PLA/i);

    // Executable scripts present but JSON-LD parsed as inert text only.
    expect(html).toMatch(/window\.__evil/);
    const blocks = extractJsonLdBlocks(html);
    expect(blocks.length).toBe(1);
    expect(classifyFilamentEligibility({
      titleEvidence: candidate.titleEvidence,
      materialEvidence: candidate.materialEvidence,
    }).eligible).toBe(true);
  });

  it("captures OOS as unavailable from real PETG excerpt", () => {
    const { html, meta } = loadFixturePair(dir, "pdp-petg-laranja-oos");
    const candidate = extractClosinPdp(html, meta.sourceUrl);
    expect(candidate.availability).toBe("unavailable");
    expect(candidate.listingPriceCentavos).toBe(6670);
  });

  it("keeps ambiguous kit mass null and retains eligibility", () => {
    const { html, meta } = loadFixturePair(dir, "pdp-kit-ambiguous-mass");
    const candidate = extractClosinPdp(html, meta.sourceUrl);
    expect(candidate.massGrams).toBeNull();
    expect(
      classifyFilamentEligibility({
        titleEvidence: candidate.titleEvidence,
        materialEvidence: candidate.materialEvidence,
        descriptionEvidence: candidate.descriptionEvidence,
      }).eligible,
    ).toBe(true);
  });

  it("rejects non-filament via shared eligibility (not silent drop in hooks)", () => {
    const { html, meta } = loadFixturePair(dir, "pdp-non-filament-nozzle");
    const candidate = extractClosinPdp(html, meta.sourceUrl);
    expect(
      classifyFilamentEligibility({
        titleEvidence: candidate.titleEvidence,
        materialEvidence: candidate.materialEvidence,
        descriptionEvidence: candidate.descriptionEvidence,
      }).eligible,
    ).toBe(false);
  });

  it("keeps a genuine filament product eligible when its description mentions printer compatibility", () => {
    expect(
      classifyFilamentEligibility({
        titleEvidence: "PLA - Branco - 1kg",
        materialEvidence: "PLA",
        descriptionEvidence:
          "Filamento PLA compatível com qualquer impressora 3D FDM.",
      }).eligible,
    ).toBe(true);
  });

  it("maps zero/invalid price to null centavos and unknown availability when missing", () => {
    const malformed = loadFixturePair(dir, "pdp-malformed-price");
    const bad = extractClosinPdp(malformed.html, malformed.meta.sourceUrl);
    expect(bad.listingPriceCentavos).toBeNull();
    expect(bad.listingPriceRaw).toBeTruthy();

    const unk = loadFixturePair(dir, "pdp-availability-unknown");
    const u = extractClosinPdp(unk.html, unk.meta.sourceUrl);
    expect(u.availability).toBe("unknown");
  });

  it("separates promotion extraction from shared promotion policy", () => {
    const valid = extractClosinPdp(
      ...(() => {
        const f = loadFixturePair(dir, "pdp-promotion-valid");
        return [f.html, f.meta.sourceUrl] as const;
      })(),
    );
    expect(
      assessPromotion({
        listingPriceCentavos: valid.listingPriceCentavos,
        originalPriceCentavos: valid.originalPriceCentavos,
      }).isPromotion,
    ).toBe(true);

    const invalid = extractClosinPdp(
      ...(() => {
        const f = loadFixturePair(dir, "pdp-promotion-invalid");
        return [f.html, f.meta.sourceUrl] as const;
      })(),
    );
    expect(
      assessPromotion({
        listingPriceCentavos: invalid.listingPriceCentavos,
        originalPriceCentavos: invalid.originalPriceCentavos,
      }).isPromotion,
    ).toBe(false);
  });

  it("fixture runner emits schema-valid observations and never empty-success on robots deny", async () => {
    const adapter = createClosinStoreAdapter();
    const bodies = buildFixtureBodyMap(
      dir,
      ["pdp-pla-branco", "pdp-non-filament-nozzle", "pdp-kit-ambiguous-mass"],
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
      expect(RawOfferObservationSchema.parse(obs).storeId).toBe("closin");
    }
    expect(result.omissions.some((o) => o.code === "non_filament")).toBe(true);
    expect(
      result.observations.some(
        (o) => o.massGrams === null && /kit/i.test(o.weightEvidence ?? o.sourceUrl),
      ) ||
        result.omissions.some((o) => o.code === "ambiguous_mass_retained"),
    ).toBe(true);

    const deniedBodies = new Map(bodies);
    deniedBodies.set(
      robotsUrl,
      readFileSync(
        resolve(
          "src/adapters/stores/closin/robots-evidence/fixtures/deny-products.txt",
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
    const adapter = createClosinStoreAdapter();
    const { html } = loadFixturePair(dir, "pdp-pla-branco");
    const wwwUrl = "https://www.closin.com.br/product-page/pla-branco-1kg";
    const apexUrl = "https://closin.com.br/product-page/pla-branco-1kg";

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
    expect(result.omissions.some((o) => o.code === "duplicate_source_tuple")).toBe(
      true,
    );
  });
});

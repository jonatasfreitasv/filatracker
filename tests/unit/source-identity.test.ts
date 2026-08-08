import { describe, expect, it } from "vitest";

import {
  assertCompatibleTupleReuse,
  canonicalizeReviewedPdpUrl,
  deriveSourceTuple,
} from "../../src/domain/identity/source-identity";

const hosts = ["closin.com.br", "www.closin.com.br"] as const;
const apexToWww = { apex: "closin.com.br", www: "www.closin.com.br" };

describe("source identity policy", () => {
  it("rewrites apex→www and strips tracking queries", () => {
    const result = deriveSourceTuple({
      storeId: "closin",
      pdpUrl:
        "https://closin.com.br/product-page/pla-branco-1kg?utm_source=x&fbclid=1",
      merchantVariantId: "CLO-PLA-01BRA",
      allowedHosts: hosts,
      apexToWww,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tuple.canonicalPdpUrl).toBe(
      "https://www.closin.com.br/product-page/pla-branco-1kg",
    );
    expect(result.tuple.sourceKey).toContain("CLO-PLA-01BRA");
  });

  it("rejects credentials, fragments, and non-443 ports", () => {
    expect(
      canonicalizeReviewedPdpUrl("https://user:pass@www.closin.com.br/x", {
        allowedHosts: hosts,
      }).ok,
    ).toBe(false);
    expect(
      canonicalizeReviewedPdpUrl("https://www.closin.com.br/x#frag", {
        allowedHosts: hosts,
      }).ok,
    ).toBe(false);
    expect(
      canonicalizeReviewedPdpUrl("https://www.closin.com.br:8443/x", {
        allowedHosts: hosts,
      }).ok,
    ).toBe(false);
  });

  it("keeps variant stability and detects incompatible reuse", () => {
    const a = deriveSourceTuple({
      storeId: "closin",
      pdpUrl: "https://www.closin.com.br/product-page/pla-branco-1kg",
      merchantVariantId: "SKU-A",
      allowedHosts: hosts,
      apexToWww,
    });
    const b = deriveSourceTuple({
      storeId: "closin",
      pdpUrl: "https://www.closin.com.br/product-page/pla-branco-1kg",
      merchantVariantId: "SKU-B",
      allowedHosts: hosts,
      apexToWww,
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.tuple.sourceKey).not.toBe(b.tuple.sourceKey);

    const clash = assertCompatibleTupleReuse(a.tuple, {
      ...a.tuple,
      merchantVariantId: "OTHER",
    });
    expect(clash.ok).toBe(false);
  });
});

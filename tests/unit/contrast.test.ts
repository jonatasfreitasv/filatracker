import { describe, expect, it } from "vitest";

import { contrastPairs } from "../../app/design-system/tokens";
import { contrastRatio, meetsContrast } from "../../app/design-system/contrast";

describe("design-system contrast (WCAG 2.1 AA)", () => {
  it("meets minimum contrast for every declared pair", () => {
    for (const pair of contrastPairs) {
      const ratio = contrastRatio(pair.foreground, pair.background);
      expect(
        meetsContrast(pair.foreground, pair.background, pair.minRatio),
        `${pair.name}: ${ratio.toFixed(2)} < ${pair.minRatio}`,
      ).toBe(true);
    }
  });

  it("keeps brand accent as non-text-only (not required as text on white)", () => {
    // Document intentional: #0EA5E9 on white fails AA for text; interactive uses #0369A1.
    const accentOnWhite = contrastRatio("#0EA5E9", "#FFFFFF");
    expect(accentOnWhite).toBeLessThan(4.5);
    const interactiveOnWhite = contrastRatio("#0369A1", "#FFFFFF");
    expect(interactiveOnWhite).toBeGreaterThanOrEqual(4.5);
  });
});

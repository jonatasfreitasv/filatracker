import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  evaluateRobotsPath,
  isRobotsEvidenceFresh,
  parseRobotsTxt,
  ROBOTS_FRESHNESS_MAX_AGE_MS,
} from "../../src/application/robots-policy";

const fixtures = resolve(
  "src/adapters/stores/closin/robots-evidence/fixtures",
);

describe("robots fail-closed", () => {
  it("allows catalog paths for live homologation robots", () => {
    const body = readFileSync(
      resolve("src/adapters/stores/closin/robots-evidence/robots.txt"),
      "utf8",
    );
    const groups = parseRobotsTxt(body);
    expect(
      evaluateRobotsPath(groups, "/product-page/pla-branco-1kg").decision,
    ).toBe("allow");
    expect(
      evaluateRobotsPath(groups, "/product-page/x?lightbox=1").decision,
    ).toBe("disallow");
  });

  it("denies when product paths are disallowed", () => {
    const groups = parseRobotsTxt(
      readFileSync(resolve(fixtures, "deny-products.txt"), "utf8"),
    );
    expect(
      evaluateRobotsPath(groups, "/product-page/pla-branco-1kg").decision,
    ).toBe("disallow");
  });

  it("treats an empty Disallow value as allow-all", () => {
    const groups = parseRobotsTxt(
      readFileSync(resolve(fixtures, "empty-disallow-ok.txt"), "utf8"),
    );
    expect(
      evaluateRobotsPath(groups, "/product-page/pla-branco-1kg").decision,
    ).toBe("allow");
  });

  it("flags equal-length allow/disallow as ambiguous", () => {
    const groups = parseRobotsTxt(
      readFileSync(resolve(fixtures, "ambiguous.txt"), "utf8"),
    );
    expect(evaluateRobotsPath(groups, "/product").decision).toBe("ambiguous");
  });

  it("treats stored evidence as non-authorizing when stale", () => {
    const capturedAt = "2026-08-01T00:00:00.000Z";
    const now = Date.parse("2026-08-08T00:00:00.000Z");
    expect(isRobotsEvidenceFresh(capturedAt, now, ROBOTS_FRESHNESS_MAX_AGE_MS)).toBe(
      false,
    );
    expect(
      isRobotsEvidenceFresh(
        "2026-08-08T00:00:00.000Z",
        Date.parse("2026-08-08T01:00:00.000Z"),
      ),
    ).toBe(true);
  });
});

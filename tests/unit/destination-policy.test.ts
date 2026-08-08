import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertPublicDnsEvidence,
  validateDestinationUrl,
  resolveRedirectLocation,
  WORKERS_DNS_PINNING_LIMITATION,
} from "../../src/application/destination-policy";
import { closinMap } from "../../src/adapters/stores/closin/map";
import { CLOSIN_BUDGETS } from "../../src/adapters/stores/closin/budgets";

const config = {
  allowedHosts: closinMap.reviewedDestinations.map((d) => d.host),
  pathAllowPrefixes: closinMap.pathAllowPrefixes,
  queryAllowKeys: closinMap.queryAllowKeys,
  maxRedirectHops: CLOSIN_BUDGETS.maxRedirectHops,
};

describe("destination policy AD-20", () => {
  it("documents Workers DNS pinning limitation", () => {
    expect(WORKERS_DNS_PINNING_LIMITATION).toMatch(/cannot pin/i);
  });

  it("allows reviewed https hosts on 443 with allowlisted paths", () => {
    const ok = validateDestinationUrl(
      "https://www.closin.com.br/product-page/pla-branco-1kg",
      config,
    );
    expect(ok.ok).toBe(true);
  });

  it("rejects credentials, fragments, IP literals, localhost, private DNS, non-443, IDN, trailing-dot, bad query", () => {
    expect(
      validateDestinationUrl("http://www.closin.com.br/product-page/x", config)
        .ok,
    ).toBe(false);
    expect(
      validateDestinationUrl(
        "https://user:pass@www.closin.com.br/product-page/x",
        config,
      ).ok,
    ).toBe(false);
    expect(
      validateDestinationUrl(
        "https://www.closin.com.br/product-page/x#y",
        config,
      ).ok,
    ).toBe(false);
    expect(
      validateDestinationUrl("https://127.0.0.1/product-page/x", config).ok,
    ).toBe(false);
    expect(
      validateDestinationUrl("https://localhost/product-page/x", config).ok,
    ).toBe(false);
    expect(
      validateDestinationUrl(
        "https://www.closin.com.br:8443/product-page/x",
        config,
      ).ok,
    ).toBe(false);
    expect(
      validateDestinationUrl(
        "https://www.closin.com.br./product-page/x",
        config,
      ).ok,
    ).toBe(false);
    expect(
      validateDestinationUrl(
        "https://www.closin.com.br/product-page/x?utm_source=1",
        config,
      ).ok,
    ).toBe(false);
    expect(
      validateDestinationUrl(
        "https://static.wixstatic.com/media/x.png",
        config,
      ).ok,
    ).toBe(false);
    expect(
      assertPublicDnsEvidence({
        hostname: "www.closin.com.br",
        resolvedAddresses: ["10.0.0.1"],
      }).ok,
    ).toBe(false);
  });

  it("validates redirects every hop and detects loops/missing location", () => {
    const visited = new Set<string>([
      "https://www.closin.com.br/robots.txt",
    ]);
    const loop = resolveRedirectLocation(
      "https://www.closin.com.br/robots.txt",
      "https://www.closin.com.br/robots.txt",
      config,
      visited,
      1,
    );
    expect(loop.ok).toBe(false);
    if (!loop.ok) expect(loop.code).toBe("redirect_loop");

    const missing = resolveRedirectLocation(
      "https://www.closin.com.br/robots.txt",
      null,
      config,
      new Set(),
      0,
    );
    expect(missing.ok).toBe(false);

    const ok = resolveRedirectLocation(
      "https://closin.com.br/robots.txt",
      "https://www.closin.com.br/robots.txt",
      config,
      new Set(),
      0,
    );
    expect(ok.ok).toBe(true);
  });

  it("records reviewed redirect chain in map", () => {
    expect(closinMap.reviewedRedirectChain).toEqual([
      "closin.com.br:443",
      "www.closin.com.br:443",
    ]);
    const evidence = JSON.parse(
      readFileSync(
        resolve(
          "src/adapters/stores/closin/robots-evidence/homologation-evidence.json",
        ),
        "utf8",
      ),
    );
    expect(evidence.decision).toBe("allow");
  });
});

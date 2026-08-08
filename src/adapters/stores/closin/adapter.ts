import type { StoreObservationPort } from "../../../application/ports";
import {
  validateDestinationUrl,
  type DestinationPolicyConfig,
} from "../../../application/destination-policy";
import {
  buildRobotsEvidence,
  evaluateRobotsPath,
  parseRobotsTxt,
  ROBOTS_USER_AGENT_TOKEN,
  type RobotsDecisionCode,
} from "../../../application/robots-policy";
import { safeFetchText } from "../../../application/safe-fetch";
import type {
  FailureCode,
  StoreRunEvidence,
} from "../../../contracts/store-run-evidence";
import { classifyFilamentEligibility } from "../../../domain/policy/filament-eligibility";
import { deriveSourceTuple } from "../../../domain/identity/source-identity";
import { CLOSIN_BUDGETS } from "./budgets";
import {
  discoverProductUrlsFromSitemap,
  extractClosinPdp,
  toRawObservation,
} from "./hooks";
import { closinMap, CLOSIN_STORE_ID, loadClosinMap } from "./map";

function destinationConfig(): DestinationPolicyConfig {
  return {
    allowedHosts: closinMap.reviewedDestinations.map((d) => d.host),
    pathAllowPrefixes: closinMap.pathAllowPrefixes,
    queryAllowKeys: closinMap.queryAllowKeys,
    maxRedirectHops: CLOSIN_BUDGETS.maxRedirectHops,
  };
}

function emptyBudget() {
  return {
    fetchCount: 0,
    redirectHops: 0,
    encodedBytes: 0,
    decompressedBytes: 0,
    observationCount: 0,
    candidateCount: 0,
    subrequests: 0,
    durationMs: 0,
    stagedByteEstimate: 0,
    logEventBytes: 0,
  };
}

function failRun(input: {
  runId: string;
  probeId: string | null;
  startedAt: string;
  finishedAt: string;
  outcome: "failed" | "quarantined" | "oversized";
  failureCodes: FailureCode[];
  catalogWork: { expected: number; completed: number };
  budgetUsage: ReturnType<typeof emptyBudget>;
  omissions?: StoreRunEvidence extends { omissions: infer O } ? O : never;
}): StoreRunEvidence {
  return {
    contractVersion: 1,
    storeId: CLOSIN_STORE_ID,
    runId: input.runId,
    probeId: input.probeId,
    mapVersion: closinMap.mapVersion,
    parserVersion: closinMap.parserVersion,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    budgetUsage: input.budgetUsage,
    catalogWork: input.catalogWork,
    outcome: input.outcome,
    observations: [],
    omissions: input.omissions ?? [],
    failureCodes: input.failureCodes,
  };
}

export function createClosinStoreAdapter(): StoreObservationPort {
  loadClosinMap();

  return {
    storeId: CLOSIN_STORE_ID,
    async observe(input) {
      const startedAt = new Date().toISOString();
      const startedMs = Date.now();
      const probeId = input.probeId ?? null;
      const budget = emptyBudget();
      const config = destinationConfig();
      const map = loadClosinMap();
      // Adapter fetches sequentially (no parallel fetch calls), which trivially
      // satisfies CLOSIN_BUDGETS.maxConcurrency without a runtime counter.
      const wallClockBudgetMs =
        probeId !== null
          ? CLOSIN_BUDGETS.maxProbeDurationMs
          : CLOSIN_BUDGETS.maxWallClockMs;

      const robotsUrl = new URL("/robots.txt", map.canonicalOrigin).href;
      let robotsBody: string;

      if (input.fixtureBodies?.has(robotsUrl)) {
        robotsBody = input.fixtureBodies.get(robotsUrl)!;
        budget.fetchCount += 1;
      } else if (input.fixtureBodies && input.fixtureBodies.size > 0) {
        // Offline fixture runs may supply a robots key without live fetch.
        const fixtureRobots = [...input.fixtureBodies.entries()].find(([k]) =>
          k.includes("robots.txt"),
        );
        if (fixtureRobots) {
          robotsBody = fixtureRobots[1];
          budget.fetchCount += 1;
        } else {
          return failRun({
            runId: input.runId,
            probeId,
            startedAt,
            finishedAt: new Date().toISOString(),
            outcome: "failed",
            failureCodes: ["robots_fetch_failed"],
            catalogWork: { expected: 0, completed: 0 },
            budgetUsage: { ...budget, durationMs: Date.now() - startedMs },
          });
        }
      } else {
        const robotsFetch = await safeFetchText({
          url: robotsUrl,
          config,
          budgets: {
            maxEncodedBytes: CLOSIN_BUDGETS.maxRobotsBodyBytes,
            maxRedirectHops: CLOSIN_BUDGETS.maxRedirectHops,
            maxDurationMs: wallClockBudgetMs,
          },
          fetchImpl: input.fetchImpl,
          headers: { "user-agent": ROBOTS_USER_AGENT_TOKEN },
        });
        budget.fetchCount += 1;
        budget.subrequests += 1;
        if (!robotsFetch.ok) {
          const isBotWall =
            robotsFetch.code === "captcha_or_auth_wall" ||
            robotsFetch.code === "anti_bot_block";
          const code: FailureCode =
            robotsFetch.code === "captcha_or_auth_wall"
              ? "captcha_or_auth_wall"
              : robotsFetch.code === "anti_bot_block"
                ? "anti_bot_block"
                : "robots_fetch_failed";
          return failRun({
            runId: input.runId,
            probeId,
            startedAt,
            finishedAt: new Date().toISOString(),
            outcome: isBotWall ? "quarantined" : "failed",
            failureCodes: [code],
            catalogWork: { expected: 0, completed: 0 },
            budgetUsage: {
              ...budget,
              redirectHops: 0,
              durationMs: Date.now() - startedMs,
            },
          });
        }
        robotsBody = robotsFetch.body;
        budget.encodedBytes += robotsFetch.encodedBytes;
        budget.decompressedBytes += robotsFetch.encodedBytes;
        budget.redirectHops += robotsFetch.redirectHops;
      }

      if (robotsBody.length > CLOSIN_BUDGETS.maxRobotsBodyBytes) {
        return failRun({
          runId: input.runId,
          probeId,
          startedAt,
          finishedAt: new Date().toISOString(),
          outcome: "oversized",
          failureCodes: ["budget_overflow"],
          catalogWork: { expected: 0, completed: 0 },
          budgetUsage: { ...budget, durationMs: Date.now() - startedMs },
        });
      }

      const groups = parseRobotsTxt(robotsBody);
      const pathsToCheck = ["/store-products-sitemap.xml", "/robots.txt"];
      let robotsDecision: RobotsDecisionCode = "allow";
      let matchedRule: string | null = null;
      for (const path of pathsToCheck) {
        const ev = evaluateRobotsPath(groups, path, ROBOTS_USER_AGENT_TOKEN);
        if (ev.decision === "disallow") {
          robotsDecision = "disallow";
          matchedRule = ev.matchedRule;
          break;
        }
        if (ev.decision === "ambiguous") {
          robotsDecision = "ambiguous";
          matchedRule = ev.matchedRule;
          break;
        }
      }

      await buildRobotsEvidence({
        requestedUrl: robotsUrl,
        finalUrl: robotsUrl,
        redirects: [],
        body: robotsBody,
        capturedAt: startedAt,
        evaluatedPaths: pathsToCheck,
        decision: robotsDecision,
        matchedRule,
      });

      if (robotsDecision === "disallow") {
        return failRun({
          runId: input.runId,
          probeId,
          startedAt,
          finishedAt: new Date().toISOString(),
          outcome: "failed",
          failureCodes: ["robots_disallow"],
          catalogWork: { expected: 0, completed: 0 },
          budgetUsage: { ...budget, durationMs: Date.now() - startedMs },
        });
      }
      if (robotsDecision === "ambiguous") {
        return failRun({
          runId: input.runId,
          probeId,
          startedAt,
          finishedAt: new Date().toISOString(),
          outcome: "failed",
          failureCodes: ["robots_ambiguous"],
          catalogWork: { expected: 0, completed: 0 },
          budgetUsage: { ...budget, durationMs: Date.now() - startedMs },
        });
      }

      // Discover product URLs
      const sitemapUrl = new URL(
        "/store-products-sitemap.xml",
        map.canonicalOrigin,
      ).href;
      let productUrls: string[] = [];

      const fixtureSitemap = input.fixtureBodies?.get(sitemapUrl);
      // Discover one past the candidate budget so overflow is an explicit oversized
      // outcome rather than silent truncation that looks like success.
      const discoverLimit = CLOSIN_BUDGETS.maxCandidatesPerRun + 1;

      if (fixtureSitemap !== undefined) {
        productUrls = discoverProductUrlsFromSitemap(
          fixtureSitemap,
          discoverLimit,
        );
        budget.fetchCount += 1;
        budget.candidateCount = productUrls.length;
      } else if (input.fixtureBodies && input.fixtureBodies.size > 0) {
        // Fixture-only PDP run: treat fixture product-page keys as the catalog work.
        productUrls = [...input.fixtureBodies.keys()].filter((u) =>
          u.includes("/product-page/"),
        );
        budget.candidateCount = productUrls.length;
      } else {
        const sitemapFetch = await safeFetchText({
          url: sitemapUrl,
          config,
          budgets: {
            maxEncodedBytes: CLOSIN_BUDGETS.maxEncodedBytesPerFetch,
            maxRedirectHops: CLOSIN_BUDGETS.maxRedirectHops,
            maxDurationMs: wallClockBudgetMs,
          },
          fetchImpl: input.fetchImpl,
          headers: { "user-agent": ROBOTS_USER_AGENT_TOKEN },
        });
        budget.fetchCount += 1;
        budget.subrequests += 1;
        if (!sitemapFetch.ok) {
          return failRun({
            runId: input.runId,
            probeId,
            startedAt,
            finishedAt: new Date().toISOString(),
            outcome: "failed",
            failureCodes: [
              sitemapFetch.code === "host_not_allowlisted" ||
              sitemapFetch.code === "path_not_allowed" ||
              sitemapFetch.code === "scheme" ||
              sitemapFetch.code === "port"
                ? "destination_rejected"
                : "fetch_failed",
            ],
            catalogWork: { expected: 0, completed: 0 },
            budgetUsage: { ...budget, durationMs: Date.now() - startedMs },
          });
        }
        budget.encodedBytes += sitemapFetch.encodedBytes;
        productUrls = discoverProductUrlsFromSitemap(
          sitemapFetch.body,
          discoverLimit,
        );
        budget.candidateCount = productUrls.length;
      }

      if (productUrls.length > CLOSIN_BUDGETS.maxCandidatesPerRun) {
        return failRun({
          runId: input.runId,
          probeId,
          startedAt,
          finishedAt: new Date().toISOString(),
          outcome: "oversized",
          failureCodes: ["budget_overflow"],
          catalogWork: { expected: productUrls.length, completed: 0 },
          budgetUsage: { ...budget, durationMs: Date.now() - startedMs },
        });
      }

      const maxPages =
        probeId !== null
          ? Math.min(CLOSIN_BUDGETS.maxProbePages, productUrls.length)
          : Math.min(CLOSIN_BUDGETS.maxObservationsPerRun, productUrls.length);

      const selected = productUrls.slice(0, maxPages);
      const observations = [];
      const omissions: {
        code: string;
        detail: string | null;
        sourceUrl: string | null;
      }[] = [];
      const seenKeys = new Set<string>();

      if (selected.length < productUrls.length) {
        omissions.push({
          code: "catalog_truncated",
          detail: String(productUrls.length - selected.length),
          sourceUrl: null,
        });
      }

      for (const sourceUrl of selected) {
        if (Date.now() - startedMs > wallClockBudgetMs) {
          return failRun({
            runId: input.runId,
            probeId,
            startedAt,
            finishedAt: new Date().toISOString(),
            outcome: "failed",
            failureCodes: ["timeout"],
            catalogWork: {
              expected: productUrls.length,
              completed: observations.length,
            },
            budgetUsage: { ...budget, durationMs: Date.now() - startedMs },
            omissions,
          });
        }

        if (sourceUrl.length > CLOSIN_BUDGETS.maxUrlLength) {
          omissions.push({
            code: "fetch_failed",
            detail: "url_too_long",
            sourceUrl: null,
          });
          continue;
        }

        if (budget.subrequests >= CLOSIN_BUDGETS.maxSubrequestsPerRun) {
          return failRun({
            runId: input.runId,
            probeId,
            startedAt,
            finishedAt: new Date().toISOString(),
            outcome: "oversized",
            failureCodes: ["budget_overflow"],
            catalogWork: {
              expected: productUrls.length,
              completed: observations.length,
            },
            budgetUsage: { ...budget, durationMs: Date.now() - startedMs },
            omissions,
          });
        }

        const dest = validateDestinationUrl(sourceUrl, config);
        if (!dest.ok) {
          return failRun({
            runId: input.runId,
            probeId,
            startedAt,
            finishedAt: new Date().toISOString(),
            outcome: "failed",
            failureCodes: ["destination_rejected"],
            catalogWork: {
              expected: productUrls.length,
              completed: observations.length,
            },
            budgetUsage: { ...budget, durationMs: Date.now() - startedMs },
            omissions,
          });
        }

        const robotsPathEval = evaluateRobotsPath(
          groups,
          new URL(dest.normalizedHref).pathname,
          ROBOTS_USER_AGENT_TOKEN,
        );
        if (
          robotsPathEval.decision === "disallow" ||
          robotsPathEval.decision === "ambiguous"
        ) {
          // A real catalog path being disallowed/ambiguous fails the whole run
          // closed rather than silently skipping it as a bounded omission —
          // robots evidence applies to the Store's path namespace, not just
          // the individually fetched item.
          return failRun({
            runId: input.runId,
            probeId,
            startedAt,
            finishedAt: new Date().toISOString(),
            outcome: "failed",
            failureCodes: [
              robotsPathEval.decision === "disallow"
                ? "robots_disallow"
                : "robots_ambiguous",
            ],
            catalogWork: {
              expected: productUrls.length,
              completed: observations.length,
            },
            budgetUsage: { ...budget, durationMs: Date.now() - startedMs },
            omissions,
          });
        }

        let html: string;
        const fixtureHtml = input.fixtureBodies?.get(sourceUrl);
        if (fixtureHtml !== undefined) {
          html = fixtureHtml;
          budget.fetchCount += 1;
        } else {
          const page = await safeFetchText({
            url: sourceUrl,
            config,
            budgets: {
              maxEncodedBytes: CLOSIN_BUDGETS.maxEncodedBytesPerFetch,
              maxRedirectHops: CLOSIN_BUDGETS.maxRedirectHops,
              maxDurationMs: wallClockBudgetMs,
            },
            fetchImpl: input.fetchImpl,
            headers: { "user-agent": ROBOTS_USER_AGENT_TOKEN },
          });
          budget.fetchCount += 1;
          budget.subrequests += 1;
          if (!page.ok) {
            if (
              page.code === "oversized" ||
              page.code === "timeout" ||
              page.code === "captcha_or_auth_wall" ||
              page.code === "anti_bot_block"
            ) {
              const mapped: FailureCode =
                page.code === "oversized"
                  ? "budget_overflow"
                  : page.code === "timeout"
                    ? "timeout"
                    : page.code;
              const isBotWall =
                page.code === "captcha_or_auth_wall" ||
                page.code === "anti_bot_block";
              return failRun({
                runId: input.runId,
                probeId,
                startedAt,
                finishedAt: new Date().toISOString(),
                outcome: isBotWall
                  ? "quarantined"
                  : page.code === "oversized"
                    ? "oversized"
                    : "failed",
                failureCodes: [mapped],
                catalogWork: {
                  expected: productUrls.length,
                  completed: observations.length,
                },
                budgetUsage: { ...budget, durationMs: Date.now() - startedMs },
                omissions,
              });
            }
            omissions.push({
              code: "fetch_failed",
              detail: page.code,
              sourceUrl,
            });
            continue;
          }
          html = page.body;
          budget.encodedBytes += page.encodedBytes;
          budget.decompressedBytes += page.encodedBytes;
          budget.redirectHops += page.redirectHops;
        }

        if (html.length > CLOSIN_BUDGETS.maxDecompressedBytesPerFetch) {
          return failRun({
            runId: input.runId,
            probeId,
            startedAt,
            finishedAt: new Date().toISOString(),
            outcome: "oversized",
            failureCodes: ["budget_overflow"],
            catalogWork: {
              expected: productUrls.length,
              completed: observations.length,
            },
            budgetUsage: { ...budget, durationMs: Date.now() - startedMs },
            omissions,
          });
        }

        const candidate = extractClosinPdp(html, dest.normalizedHref);
        budget.candidateCount += 1;

        const eligibility = classifyFilamentEligibility({
          titleEvidence: candidate.titleEvidence,
          materialEvidence: candidate.materialEvidence,
          descriptionEvidence: candidate.descriptionEvidence,
        });
        if (!eligibility.eligible) {
          omissions.push({
            code: "non_filament",
            detail: eligibility.reason,
            sourceUrl: dest.normalizedHref,
          });
          continue;
        }

        const identity = deriveSourceTuple({
          storeId: CLOSIN_STORE_ID,
          pdpUrl: dest.normalizedHref,
          merchantVariantId: candidate.merchantVariantId,
          allowedHosts: map.reviewedDestinations.map((d) => d.host),
          apexToWww: { apex: "closin.com.br", www: "www.closin.com.br" },
        });
        if (!identity.ok) {
          omissions.push({
            code: "source_identity_rejected",
            detail: identity.error.code,
            sourceUrl: dest.normalizedHref,
          });
          continue;
        }
        if (seenKeys.has(identity.tuple.sourceKey)) {
          omissions.push({
            code: "duplicate_source_tuple",
            detail: identity.tuple.sourceKey,
            sourceUrl: dest.normalizedHref,
          });
          continue;
        }
        seenKeys.add(identity.tuple.sourceKey);

        if (
          candidate.massGrams === null &&
          /\bkit\b/i.test(
            `${candidate.titleEvidence ?? ""} ${candidate.descriptionEvidence ?? ""}`,
          )
        ) {
          omissions.push({
            code: "ambiguous_mass_retained",
            detail: "massGrams:null",
            sourceUrl: dest.normalizedHref,
          });
        }

        const observation = toRawObservation({
          candidate: {
            ...candidate,
            sourceUrl: identity.tuple.canonicalPdpUrl,
            merchantVariantId: identity.tuple.merchantVariantId,
          },
          runId: input.runId,
          probeId,
          observedAt: new Date().toISOString(),
        });

        observations.push(observation);
        if (observations.length > CLOSIN_BUDGETS.maxObservationsPerRun) {
          return failRun({
            runId: input.runId,
            probeId,
            startedAt,
            finishedAt: new Date().toISOString(),
            outcome: "oversized",
            failureCodes: ["budget_overflow"],
            catalogWork: {
              expected: productUrls.length,
              completed: observations.length,
            },
            budgetUsage: { ...budget, durationMs: Date.now() - startedMs },
            omissions,
          });
        }
      }

      budget.observationCount = observations.length;
      budget.stagedByteEstimate = observations.length * 2048;
      budget.durationMs = Date.now() - startedMs;
      const finishedAt = new Date().toISOString();

      if (budget.stagedByteEstimate > CLOSIN_BUDGETS.maxStagedBytesEstimate) {
        return failRun({
          runId: input.runId,
          probeId,
          startedAt,
          finishedAt,
          outcome: "oversized",
          failureCodes: ["budget_overflow"],
          catalogWork: {
            expected: productUrls.length,
            completed: observations.length,
          },
          budgetUsage: budget,
          omissions,
        });
      }

      const hasFetchFailures = omissions.some((o) => o.code === "fetch_failed");
      const hasTruncation = omissions.some(
        (o) => o.code === "catalog_truncated",
      );
      if (hasFetchFailures || hasTruncation) {
        return {
          contractVersion: 1,
          storeId: CLOSIN_STORE_ID,
          runId: input.runId,
          probeId,
          mapVersion: map.mapVersion,
          parserVersion: map.parserVersion,
          startedAt,
          finishedAt,
          budgetUsage: budget,
          catalogWork: {
            expected: productUrls.length,
            completed: observations.length,
          },
          outcome: "partial",
          observations,
          omissions,
          failureCodes: hasFetchFailures
            ? ["fetch_failed"]
            : ["budget_overflow"],
        };
      }

      return {
        contractVersion: 1,
        storeId: CLOSIN_STORE_ID,
        runId: input.runId,
        probeId,
        mapVersion: map.mapVersion,
        parserVersion: map.parserVersion,
        startedAt,
        finishedAt,
        budgetUsage: budget,
        catalogWork: {
          expected: productUrls.length,
          completed: observations.length,
        },
        outcome: "complete",
        observations,
        omissions,
      };
    },
  };
}

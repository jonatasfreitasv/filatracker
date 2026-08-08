/**
 * Robots retrieval + evaluation (AD-13 / NFR5).
 * Same code path for homologation and every future production run.
 * Stored evidence is audit input only — never authorization by itself.
 */

export const ROBOTS_POLICY_VERSION = 1 as const;
export const ROBOTS_USER_AGENT_TOKEN = "FilaTrackerBot";
export const ROBOTS_MAX_BODY_BYTES = 64_000;
export const ROBOTS_FRESHNESS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type RobotsDecisionCode =
  | "allow"
  | "disallow"
  | "ambiguous"
  | "fetch_failed"
  | "host_not_allowlisted"
  | "redirect_policy_failed"
  | "oversized"
  | "stale_evidence_not_authorization";

export type RobotsEvidence = {
  policyVersion: typeof ROBOTS_POLICY_VERSION;
  requestedUrl: string;
  finalUrl: string;
  redirects: string[];
  userAgentToken: typeof ROBOTS_USER_AGENT_TOKEN;
  bodyDigestSha256: string;
  capturedAt: string;
  evaluatedPaths: string[];
  parsedRules: RobotsGroup[];
  decision: RobotsDecisionCode;
  matchedRule: string | null;
};

export type RobotsGroup = {
  userAgents: string[];
  allows: string[];
  disallows: string[];
};

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function digestRobotsBody(body: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(body),
  );
  return toHex(digest);
}

export function parseRobotsTxt(body: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let expectingAgents = true;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === "user-agent") {
      if (!current || !expectingAgents) {
        current = { userAgents: [], allows: [], disallows: [] };
        groups.push(current);
        expectingAgents = true;
      }
      current.userAgents.push(value.toLowerCase());
      continue;
    }

    if (!current) continue;
    expectingAgents = false;
    if (key === "allow") current.allows.push(value);
    if (key === "disallow") current.disallows.push(value);
  }

  return groups;
}

function matchingGroups(groups: RobotsGroup[], ua: string): RobotsGroup[] {
  const specific = groups.filter((g) =>
    g.userAgents.some((a) => a === ua.toLowerCase()),
  );
  if (specific.length > 0) return specific;
  return groups.filter((g) => g.userAgents.some((a) => a === "*"));
}

/**
 * Longest-match Allow/Disallow per robots convention for a single UA.
 * Ambiguous when multiple groups apply with conflicting equal-length rules.
 */
export function evaluateRobotsPath(
  groups: RobotsGroup[],
  pathWithQuery: string,
  userAgentToken: string = ROBOTS_USER_AGENT_TOKEN,
): { decision: "allow" | "disallow" | "ambiguous"; matchedRule: string | null } {
  const matched = matchingGroups(groups, userAgentToken);
  if (matched.length === 0) {
    if (groups.length > 0) {
      return { decision: "ambiguous", matchedRule: null };
    }
    return { decision: "allow", matchedRule: null };
  }

  type Cand = { type: "allow" | "disallow"; pattern: string };
  const candidates: Cand[] = [];
  for (const g of matched) {
    for (const pattern of g.allows) {
      if (pattern === "") continue;
      if (pathMatchesRobots(pathWithQuery, pattern)) {
        candidates.push({ type: "allow", pattern });
      }
    }
    for (const pattern of g.disallows) {
      if (pattern === "") continue;
      if (pathMatchesRobots(pathWithQuery, pattern)) {
        candidates.push({ type: "disallow", pattern });
      }
    }
  }

  if (candidates.length === 0) {
    return { decision: "allow", matchedRule: null };
  }

  candidates.sort((a, b) => b.pattern.length - a.pattern.length);
  const bestLen = candidates[0]!.pattern.length;
  const best = candidates.filter((c) => c.pattern.length === bestLen);
  const types = new Set(best.map((c) => c.type));
  if (types.size > 1) {
    return { decision: "ambiguous", matchedRule: best[0]!.pattern };
  }
  const winner = best[0]!;
  return {
    decision: winner.type,
    matchedRule: `${winner.type}:${winner.pattern}`,
  };
}

/**
 * Minimal robots pattern match supporting `*` wildcard and trailing `$`.
 */
export function pathMatchesRobots(path: string, pattern: string): boolean {
  let pat = pattern;
  let anchorEnd = false;
  if (pat.endsWith("$")) {
    anchorEnd = true;
    pat = pat.slice(0, -1);
  }
  const parts = pat.split("*").map(escapeRegex);
  let re = "^" + parts.join(".*");
  re += anchorEnd ? "$" : "";
  return new RegExp(re).test(path);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isRobotsEvidenceFresh(
  capturedAtIso: string,
  nowMs: number,
  maxAgeMs: number = ROBOTS_FRESHNESS_MAX_AGE_MS,
): boolean {
  const captured = Date.parse(capturedAtIso);
  if (!Number.isFinite(captured)) return false;
  return nowMs - captured <= maxAgeMs;
}

export async function buildRobotsEvidence(input: {
  requestedUrl: string;
  finalUrl: string;
  redirects: string[];
  body: string;
  capturedAt: string;
  evaluatedPaths: string[];
  decision: RobotsDecisionCode;
  matchedRule: string | null;
}): Promise<RobotsEvidence> {
  const parsedRules = parseRobotsTxt(input.body);
  return {
    policyVersion: ROBOTS_POLICY_VERSION,
    requestedUrl: input.requestedUrl,
    finalUrl: input.finalUrl,
    redirects: input.redirects,
    userAgentToken: ROBOTS_USER_AGENT_TOKEN,
    bodyDigestSha256: await digestRobotsBody(input.body),
    capturedAt: input.capturedAt,
    evaluatedPaths: input.evaluatedPaths,
    parsedRules,
    decision: input.decision,
    matchedRule: input.matchedRule,
  };
}

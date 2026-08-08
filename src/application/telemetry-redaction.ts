/**
 * Telemetry allowlist + redaction for Store homologation/probe.
 * Never log raw query/referrer/destination URL, IP, full User-Agent, secrets,
 * or merchant payload.
 */

export const TELEMETRY_POLICY_VERSION = 1 as const;

const ALLOWED_KEYS = new Set([
  "event",
  "storeId",
  "runId",
  "probeId",
  "outcome",
  "failureCodes",
  "observationCount",
  "candidateCount",
  "omissionCount",
  "budgetUsage",
  "mapVersion",
  "parserVersion",
  "durationMs",
  "fixtureId",
  "contentDigestSha256",
]);

const REDACTED = "[REDACTED]";

/** Bounded log/event size (matches CLOSIN_BUDGETS.maxLogEventBytes; shared, not Store-specific). */
export const MAX_TELEMETRY_EVENT_BYTES = 8_192;

export type TelemetryEvent = Record<string, unknown>;

export function redactTelemetry(input: TelemetryEvent): TelemetryEvent {
  const out: TelemetryEvent = {
    telemetryPolicyVersion: TELEMETRY_POLICY_VERSION,
  };
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (
      key.toLowerCase().includes("url") ||
      key.toLowerCase().includes("secret") ||
      key.toLowerCase().includes("ip")
    ) {
      out[key] = REDACTED;
      continue;
    }
    out[key] = value;
  }
  if (
    new TextEncoder().encode(JSON.stringify(out)).length >
    MAX_TELEMETRY_EVENT_BYTES
  ) {
    return {
      telemetryPolicyVersion: TELEMETRY_POLICY_VERSION,
      event: typeof out.event === "string" ? out.event : "unknown",
      outcome: "budget_overflow",
    };
  }
  return out;
}

/** Sink disabled for Story 1.2 — events are returned for tests only. */
export function emitStoreTelemetry(event: TelemetryEvent): TelemetryEvent {
  return redactTelemetry(event);
}

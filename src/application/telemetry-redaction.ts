/**
 * Telemetry allowlist + redaction for Store homologation/probe/publication health.
 * Never log raw query/referrer/destination URL, IP, full User-Agent, secrets,
 * merchant payloads, or unrelated identifiers. Content digests are not emitted
 * to general telemetry.
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
  "publicationClass",
  "supportState",
  "supportGeneration",
  "storeGeneration",
  "projectionEpoch",
  "recoveryEpoch",
  "activationGate",
  "publishedOfferCount",
  "messageId",
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
      key.toLowerCase().includes("ip") ||
      key.toLowerCase().includes("digest")
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

/**
 * Health sink — enabled only with retention/purge rules for audited recovery horizon.
 * Operational run/message IDs must be bounded and purpose-limited.
 */
export type TelemetrySinkOptions = {
  enabled: boolean;
  /** Max retained events in-process (tests / local). */
  maxRetainedEvents?: number;
};

const retained: TelemetryEvent[] = [];

export function emitStoreTelemetry(
  event: TelemetryEvent,
  options: TelemetrySinkOptions = { enabled: false },
): TelemetryEvent {
  const redacted = redactTelemetry(event);
  if (options.enabled) {
    retained.push(redacted);
    const max = options.maxRetainedEvents ?? 100;
    while (retained.length > max) retained.shift();
  }
  return redacted;
}

export function drainTelemetrySink(): TelemetryEvent[] {
  return retained.splice(0, retained.length);
}

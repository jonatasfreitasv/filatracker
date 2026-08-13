import { z } from "zod";

import { UtcInstantSchema } from "./search-page";

/**
 * Queue envelope v1 — no predecessor.
 * Carries fencing + digest-bound payload reference only — never full merchant
 * HTML or the retained structured observation payload.
 */
export const QUEUE_ENVELOPE_CONTRACT_VERSION = 1 as const;
export const QUEUE_ENVELOPE_CONTRACT_NO_PREDECESSOR = true as const;

const BoundedId = z.string().min(1).max(128);

export const QueueEnvelopeKindSchema = z.enum([
  "ingest.discover",
  "ingest.publish",
  "ingest.replay",
]);

export type QueueEnvelopeKind = z.infer<typeof QueueEnvelopeKindSchema>;

export const QueueEnvelopeSchema = z.strictObject({
  contractVersion: z.literal(QUEUE_ENVELOPE_CONTRACT_VERSION),
  kind: QueueEnvelopeKindSchema,
  messageId: BoundedId,
  idempotencyKey: BoundedId,
  storeId: BoundedId,
  runId: BoundedId,
  storeGeneration: z.number().int().nonnegative().nullable(),
  supportGeneration: z.number().int().nonnegative(),
  projectionEpoch: z.number().int().nonnegative(),
  recoveryEpoch: z.number().int().nonnegative(),
  /** Digest of the retained D1 payload artifact — not the payload itself. */
  payloadDigestSha256: z.string().min(1).max(128),
  payloadArtifactId: BoundedId,
  payloadExpiresAt: UtcInstantSchema,
  enqueuedAt: UtcInstantSchema,
  probeId: BoundedId.nullable(),
});

export type QueueEnvelope = z.infer<typeof QueueEnvelopeSchema>;

export const QueueEnvelopeDecoders = {
  1: QueueEnvelopeSchema,
} as const;

/** Reject unknown / N-2 versions fail-closed. */
export function decodeQueueEnvelope(input: unknown): QueueEnvelope {
  const version =
    input !== null &&
    typeof input === "object" &&
    "contractVersion" in input &&
    typeof (input as { contractVersion: unknown }).contractVersion === "number"
      ? (input as { contractVersion: number }).contractVersion
      : null;
  if (version === null || !(version in QueueEnvelopeDecoders)) {
    throw new Error(`unsupported_queue_envelope_version:${String(version)}`);
  }
  return QueueEnvelopeDecoders[
    version as keyof typeof QueueEnvelopeDecoders
  ].parse(input);
}

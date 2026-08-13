import {
  BROWSE_PAGE_CONTRACT_VERSION,
  CorrelationIdSchema,
  DEFAULT_RETRY_AFTER_SECONDS,
  type BrowsePageRpcOutcome,
} from "../contracts";
import type {
  BrowseCatalogPort,
  BrowsePageSnapshot,
  GetBrowsePageInput,
} from "./ports";

function newCorrelationId(): string {
  return crypto.randomUUID();
}

function logAllowlisted(code: string, correlationId: string): void {
  console.error("get_browse_page", { code, correlationId });
}

export async function getBrowsePage(
  catalog: BrowseCatalogPort,
  input: GetBrowsePageInput,
): Promise<BrowsePageRpcOutcome> {
  const suppliedCorrelationId = CorrelationIdSchema.safeParse(input.correlationId);
  const correlationId = suppliedCorrelationId.success
    ? suppliedCorrelationId.data
    : newCorrelationId();
  const evaluatedAt = new Date();

  if (input.hasInvalidParameters) {
    return {
      outcome: "invalid",
      contractVersion: BROWSE_PAGE_CONTRACT_VERSION,
      projectionEpoch: 0,
      supportEpoch: 0,
      correlationId,
      errors: ["Parâmetros de navegação inválidos."],
    };
  }

  let snapshot: BrowsePageSnapshot;
  try {
    snapshot = await catalog.getBrowsePageSnapshot({
      kind: input.kind,
      slug: input.slug,
      cursor: input.cursor,
      limit: input.limit,
      type: input.type,
      correlationId,
      evaluatedAt,
    });
  } catch (error) {
    const overloaded =
      error instanceof Error &&
      (error.name === "OverloadedError" ||
        /overloaded|capacity|429/i.test(error.message));
    logAllowlisted(
      overloaded ? "catalog_overloaded" : "catalog_unavailable",
      correlationId,
    );
    return {
      outcome: overloaded ? "overloaded" : "unavailable",
      contractVersion: BROWSE_PAGE_CONTRACT_VERSION,
      projectionEpoch: 0,
      supportEpoch: 0,
      correlationId,
      retryAfterSeconds: DEFAULT_RETRY_AFTER_SECONDS,
    };
  }

  const meta = {
    contractVersion: BROWSE_PAGE_CONTRACT_VERSION,
    projectionEpoch: snapshot.projectionEpoch,
    supportEpoch: snapshot.supportEpoch,
    correlationId,
  } as const;

  switch (snapshot.outcome) {
    case "invalid":
      return { ...meta, outcome: "invalid", errors: snapshot.errors };
    case "notFound":
      return { ...meta, outcome: "notFound" };
    case "gone":
      return { ...meta, outcome: "gone" };
    case "overloaded":
    case "unavailable":
      return {
        ...meta,
        outcome: snapshot.outcome,
        retryAfterSeconds: DEFAULT_RETRY_AFTER_SECONDS,
      };
    case "redirect":
      return {
        ...meta,
        outcome: "redirect",
        canonicalSlug: snapshot.canonicalSlug,
        kind: snapshot.kind,
      };
    case "degraded":
      return {
        ...meta,
        outcome: "degraded",
        data: snapshot.page,
        qualification:
          snapshot.qualification ??
          "Navegação em modo degradado — alguns dados podem estar indisponíveis.",
      };
    case "ok":
      return { ...meta, outcome: "ok", data: snapshot.page };
  }
}

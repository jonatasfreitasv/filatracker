export function buildSearchRetryPath(
  query: string | null | undefined,
  cursor: string | null | undefined,
  type?: string | null | undefined,
): string {
  const retryParams = new URLSearchParams();
  if (typeof query === "string" && query.length > 0) retryParams.set("q", query);
  if (typeof type === "string" && type.length > 0) retryParams.set("type", type);
  if (typeof cursor === "string" && cursor.length > 0) retryParams.set("cursor", cursor);
  return retryParams.size > 0 ? `/search?${retryParams}` : "/search";
}

export function buildSearchHref(input: {
  q?: string | null;
  type?: string | null;
  cursor?: string | null;
}): string {
  return buildSearchRetryPath(input.q, input.cursor, input.type);
}

export function buildBrowseRetryPath(
  kind: "material" | "brand",
  slug: string,
  type: string | null | undefined,
  cursor: string | null | undefined,
): string {
  const params = new URLSearchParams();
  if (typeof type === "string" && type.length > 0) params.set("type", type);
  if (typeof cursor === "string" && cursor.length > 0) params.set("cursor", cursor);
  const base = kind === "material" ? `/materials/${slug}` : `/brands/${slug}`;
  return params.size > 0 ? `${base}?${params}` : base;
}

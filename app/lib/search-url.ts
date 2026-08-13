export function buildSearchRetryPath(
  query: string | null | undefined,
  cursor: string | null | undefined,
): string {
  const retryParams = new URLSearchParams();
  if (typeof query === "string" && query.length > 0) retryParams.set("q", query);
  if (typeof cursor === "string" && cursor.length > 0) retryParams.set("cursor", cursor);
  return retryParams.size > 0 ? `/search?${retryParams}` : "/search";
}

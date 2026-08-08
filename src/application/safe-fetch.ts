/**
 * Fail-closed fetch helper with redirect: "manual" and per-hop destination policy.
 */

import {
  assertPublicDnsEvidence,
  resolveRedirectLocation,
  validateDestinationUrl,
  type DestinationPolicyConfig,
  type DestinationRejectionCode,
} from "./destination-policy";

export type SafeFetchBudgets = {
  maxEncodedBytes: number;
  maxRedirectHops: number;
  maxDurationMs: number;
};

export type SafeFetchSuccess = {
  ok: true;
  url: string;
  status: number;
  body: string;
  encodedBytes: number;
  redirectHops: number;
  hops: string[];
};

export type SafeFetchFailure = {
  ok: false;
  code:
    | DestinationRejectionCode
    | "fetch_failed"
    | "http_error"
    | "timeout"
    | "oversized"
    | "captcha_or_auth_wall"
    | "anti_bot_block";
  detail: string;
  hops: string[];
};

export type SafeFetchResult = SafeFetchSuccess | SafeFetchFailure;

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

function detectBotWall(status: number, bodySnippet: string): SafeFetchFailure["code"] | null {
  if (status === 401 || status === 403) {
    if (/captcha|cf-challenge|attention required|verify you are human/i.test(bodySnippet)) {
      return "captcha_or_auth_wall";
    }
    return "anti_bot_block";
  }
  if (/captcha|verify you are human|cf-browser-verification/i.test(bodySnippet)) {
    return "captcha_or_auth_wall";
  }
  return null;
}

export async function safeFetchText(input: {
  url: string;
  config: DestinationPolicyConfig;
  budgets: SafeFetchBudgets;
  fetchImpl?: FetchLike;
  headers?: Record<string, string>;
  resolvedAddresses?: readonly string[] | null;
}): Promise<SafeFetchResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const hops: string[] = [];
  const visited = new Set<string>();
  let current = validateDestinationUrl(input.url, {
    ...input.config,
    maxRedirectHops: input.budgets.maxRedirectHops,
  });
  if (!current.ok) {
    return { ok: false, code: current.code, detail: current.detail, hops };
  }

  const dns = assertPublicDnsEvidence({
    hostname: current.url.hostname,
    resolvedAddresses: input.resolvedAddresses,
  });
  if (!dns.ok) {
    return { ok: false, code: dns.code, detail: dns.detail, hops };
  }

  const started = Date.now();
  let redirectHops = 0;

  while (true) {
    if (Date.now() - started > input.budgets.maxDurationMs) {
      return { ok: false, code: "timeout", detail: "duration", hops };
    }

    hops.push(current.normalizedHref);
    visited.add(current.normalizedHref);

    let response: Response;
    try {
      response = await fetchImpl(current.normalizedHref, {
        method: "GET",
        redirect: "manual",
        headers: input.headers,
      });
    } catch (error) {
      return {
        ok: false,
        code: "fetch_failed",
        detail: error instanceof Error ? error.message : "fetch",
        hops,
      };
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = resolveRedirectLocation(
        current.normalizedHref,
        response.headers.get("location"),
        { ...input.config, maxRedirectHops: input.budgets.maxRedirectHops },
        visited,
        redirectHops + 1,
      );
      if (!next.ok) {
        return { ok: false, code: next.code, detail: next.detail, hops };
      }
      const nextDns = assertPublicDnsEvidence({
        hostname: next.url.hostname,
        resolvedAddresses: input.resolvedAddresses,
      });
      if (!nextDns.ok) {
        return { ok: false, code: nextDns.code, detail: nextDns.detail, hops };
      }
      redirectHops += 1;
      current = next;
      continue;
    }

    const contentLength = response.headers.get("content-length");
    if (
      contentLength &&
      Number(contentLength) > input.budgets.maxEncodedBytes
    ) {
      return { ok: false, code: "oversized", detail: contentLength, hops };
    }

    const buf = await readBoundedBody(response, input.budgets.maxEncodedBytes);
    if (!buf.ok) {
      return { ok: false, code: "oversized", detail: buf.detail, hops };
    }

    const body = new TextDecoder("utf-8", { fatal: false }).decode(buf.bytes);
    const wall = detectBotWall(response.status, body);
    if (wall) {
      return { ok: false, code: wall, detail: `status:${response.status}`, hops };
    }

    if (response.status < 200 || response.status >= 300) {
      return {
        ok: false,
        code: "http_error",
        detail: `status:${response.status}`,
        hops,
      };
    }

    return {
      ok: true,
      url: current.normalizedHref,
      status: response.status,
      body,
      encodedBytes: buf.bytes.byteLength,
      redirectHops,
      hops,
    };
  }
}

/**
 * Read a response body incrementally, aborting as soon as the byte budget is
 * exceeded so an oversized/decompression-bomb response is never fully
 * buffered in memory before the size check runs.
 */
async function readBoundedBody(
  response: Response,
  maxBytes: number,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; detail: string }> {
  const reader = response.body?.getReader();
  if (!reader) {
    const buf = new Uint8Array(await response.arrayBuffer());
    if (buf.byteLength > maxBytes) {
      return { ok: false, detail: String(buf.byteLength) };
    }
    return { ok: true, bytes: buf };
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      return { ok: false, detail: String(received) };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

// Sprint 69 — Shared rate-limited HTTP client for external paper /
// grant / social-source ingestors.
//
// Wraps `fetch` with three concerns the ingestors otherwise duplicate:
//
//   1. Rate-limit gate — at most one in-flight request per (host)
//      bucket, with a configurable min-interval between successive
//      requests. arXiv asks for 1req/sec; OpenAlex's polite pool
//      tolerates more. The bucket key is the URL hostname.
//   2. Retries with exponential backoff on transient failure
//      (network error, 5xx). Up to 4 attempts, 0.5s/1s/2s/4s.
//   3. A polite `User-Agent` header carrying our contact email so
//      upstream operators can reach us if we misbehave.
//
// Fetch is overridable so tests can inject a mock without going
// through the network. Production callers use the default `fetch`.

const DEFAULT_USER_AGENT =
  "Axiomic/1.0 (mailto=research@axiomic.app) (open-source learning platform)";

interface HostBucket {
  // Promise the next request awaits before starting; resolves once
  // `minIntervalMs` has elapsed since the previous request started.
  next: Promise<void>;
}

const HOST_BUCKETS = new Map<string, HostBucket>();

// Test-friendly fetch shape: just the call signature, not Bun's full
// `typeof fetch` (which includes static properties like `preconnect`).
export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface FetchLikeInit extends RequestInit {
  // Per-host minimum interval between successive requests. Defaults
  // are tuned for the ingestors that need them.
  minIntervalMs?: number;
  // Maximum attempts including the first. Default 4.
  maxAttempts?: number;
  // Override the global fetch — used by tests.
  fetchImpl?: FetchLike;
  // Initial backoff in ms. Default 500.
  backoffStartMs?: number;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "unknown";
  }
}

async function gate(host: string, minIntervalMs: number): Promise<void> {
  const existing = HOST_BUCKETS.get(host);
  const wait = existing
    ? existing.next.then(() => new Promise<void>((r) => setTimeout(r, minIntervalMs)))
    : Promise.resolve();
  HOST_BUCKETS.set(host, { next: wait });
  await wait;
}

function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

export async function rateLimitedFetch(
  url: string,
  init: FetchLikeInit = {},
): Promise<Response> {
  const {
    minIntervalMs = 0,
    maxAttempts = 4,
    fetchImpl = fetch,
    backoffStartMs = 500,
    headers,
    ...rest
  } = init;

  const host = hostOf(url);
  const mergedHeaders = {
    "User-Agent": DEFAULT_USER_AGENT,
    Accept: "application/json",
    ...(headers as Record<string, string> | undefined),
  };

  let lastError: unknown = null;
  let lastResponse: Response | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (minIntervalMs > 0) {
      await gate(host, minIntervalMs);
    }
    try {
      const res = await fetchImpl(url, { ...rest, headers: mergedHeaders });
      if (res.ok) return res;
      lastResponse = res;
      if (!isRetryable(res.status)) return res;
    } catch (err) {
      lastError = err;
    }
    if (attempt < maxAttempts) {
      const delay = backoffStartMs * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  if (lastResponse) return lastResponse;
  throw lastError ?? new Error(`Request to ${url} failed after ${maxAttempts} attempts`);
}

// Test-only — drop the rate-limit buckets so unit tests don't carry
// state across describe blocks.
export function _resetHostBucketsForTests(): void {
  HOST_BUCKETS.clear();
}

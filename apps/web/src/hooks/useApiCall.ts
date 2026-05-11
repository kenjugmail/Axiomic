// S108 — Standard API-call hook with loading / error / retry state.
//
// Pages that previously open-coded the `setLoading(true)` → `fetch`
// → `setError(...)` pattern should adopt this hook to get consistent
// error states (including the HTTP status code, which ErrorState
// keys off to render "sign in" vs "forbidden" vs generic).
//
//   const { data, loading, error, status, retry } = useApiCall(
//     () => api.feed.list(),
//     [pageId],
//   );

import { useCallback, useEffect, useState } from "react";

export interface UseApiCallResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  status: number | undefined;
  retry: () => void;
}

interface ApiError {
  status?: number;
  message: string;
}

function extractApiError(e: unknown): ApiError {
  if (e instanceof Response) {
    return { status: e.status, message: `Request failed (HTTP ${e.status})` };
  }
  if (typeof e === "object" && e !== null) {
    const anyE = e as { status?: number; message?: string };
    return {
      status: typeof anyE.status === "number" ? anyE.status : undefined,
      message: anyE.message ?? "Request failed",
    };
  }
  return { message: typeof e === "string" ? e : "Request failed" };
}

// `deps` mirrors useEffect's dep array — the call re-fires when any
// of them change. Pass `[]` for fetch-once-on-mount.
export function useApiCall<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown>,
): UseApiCallResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | undefined>(undefined);
  // Bump this on retry to re-run the effect without changing `deps`.
  const [retryNonce, setRetryNonce] = useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableFetcher = useCallback(fetcher, deps);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setStatus(undefined);
    stableFetcher()
      .then((v) => {
        if (cancelled) return;
        setData(v);
      })
      .catch((e) => {
        if (cancelled) return;
        const apiError = extractApiError(e);
        setError(apiError.message);
        setStatus(apiError.status);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stableFetcher, retryNonce]);

  const retry = useCallback(() => setRetryNonce((n) => n + 1), []);

  return { data, loading, error, status, retry };
}

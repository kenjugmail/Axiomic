// Sprint 53 — Admin error stats. Reads /admin/error-stats and renders
// per-kind counters + the most recent N entries from the in-memory
// ring buffer. Memory-only; resets on server restart.

import { useEffect, useState } from "react";
import { AlertOctagon, RefreshCw } from "lucide-react";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";

interface ErrorEntry {
  kind: string;
  msg: string;
  ts: string;
  fields?: Record<string, unknown>;
}

interface ErrorStats {
  counters: Record<string, number>;
  recent: ErrorEntry[];
}

export function AdminErrorStatsPage() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<ErrorStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const r = await fetch("/api/v1/admin/error-stats", {
        credentials: "include",
      });
      if (!r.ok) {
        if (r.status === 403) {
          setError("Admin access required.");
          return;
        }
        throw new Error(`Failed (${r.status})`);
      }
      const body = (await r.json()) as ErrorStats;
      setData(body);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (user && user.role !== "admin") {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Admin access required.
        </div>
      </div>
    );
  }

  const sortedKinds = data
    ? Object.entries(data.counters).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <header className="flex items-baseline justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
            <AlertOctagon className="w-6 h-6 text-rose-500" strokeWidth={2} />
            Error stats
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            In-memory ring buffer + per-kind counters since last server restart.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </header>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive mb-4">
          {error}
        </div>
      )}

      {data === null && !error && <Skeleton className="h-32" />}

      {data && (
        <>
          <section className="mb-6">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-2">
              Counters by kind
            </h2>
            {sortedKinds.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No errors recorded since restart.
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {sortedKinds.map(([kind, count]) => (
                  <li
                    key={kind}
                    className="rounded-md border border-border p-3 flex items-center justify-between"
                  >
                    <span className="text-sm font-mono text-foreground/80">
                      {kind}
                    </span>
                    <span className="text-sm font-semibold">{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-2">
              Recent (newest first)
            </h2>
            {data.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No errors in the buffer.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.recent.map((e, i) => (
                  <li
                    key={`${e.ts}-${i}`}
                    className="rounded-md border border-border p-3"
                  >
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <span className="text-xs font-mono text-rose-700 dark:text-rose-400">
                        {e.kind}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(e.ts).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm mt-1">{e.msg}</p>
                    {e.fields && Object.keys(e.fields).length > 1 && (
                      <details className="mt-1 text-xs text-muted-foreground">
                        <summary className="cursor-pointer">Fields</summary>
                        <pre className="mt-1 rounded bg-muted/40 p-2 overflow-x-auto">
                          {JSON.stringify(e.fields, null, 2)}
                        </pre>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

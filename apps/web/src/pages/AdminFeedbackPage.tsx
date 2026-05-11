// S109 — Admin feedback inbox.
//
// Reads /feedback/admin (admin-gated) and lists the most recent 200
// reports. Click a row to see the full message + browser UA in a
// drawer. Uses the Phase A primitives (EmptyState, ErrorState,
// useApiCall) so the loading/error/empty branches stay consistent
// with the rest of the app.

import { useState } from "react";
import { Inbox, X as XIcon } from "lucide-react";
import { useAuthStore } from "../stores/auth";
import { api } from "../lib/api";
import { useApiCall } from "../hooks/useApiCall";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";

interface Report {
  id: string;
  userId: string | null;
  kind: string;
  message: string;
  currentUrl: string | null;
  browserUa: string | null;
  createdAt: string;
}

function kindBadgeClass(kind: string): string {
  if (kind === "bug") return "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40";
  if (kind === "idea") return "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/40";
  if (kind === "praise") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40";
  return "bg-muted text-muted-foreground border-border";
}

export function AdminFeedbackPage() {
  const user = useAuthStore((s) => s.user);
  const { data, loading, error, status, retry } = useApiCall(
    () => api.feedback.listAdmin(),
    [],
  );
  const [active, setActive] = useState<Report | null>(null);

  if (user && user.role !== "admin") {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <ErrorState error="Admin access required." status={403} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="font-display text-2xl font-semibold tracking-tight inline-flex items-center gap-2">
        <Inbox className="h-6 w-6 text-primary" />
        Feedback inbox
      </h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Bug reports, ideas, and praise submitted via the floating feedback widget.
      </p>

      {loading && (
        <div className="text-sm text-muted-foreground">Loading reports…</div>
      )}
      {error && !loading && (
        <ErrorState error={error} status={status} onRetry={retry} />
      )}
      {data && data.reports.length === 0 && (
        <EmptyState
          title="No feedback yet"
          description="Reports submitted via the floating widget will appear here."
        />
      )}
      {data && data.reports.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Message</th>
                <th className="px-3 py-2 font-medium">URL</th>
                <th className="px-3 py-2 font-medium">User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.reports.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setActive(r)}
                  className="cursor-pointer hover:bg-accent/30"
                >
                  <td className="px-3 py-2 align-top whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span
                      className={`inline-block text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${kindBadgeClass(r.kind)}`}
                    >
                      {r.kind}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top text-xs max-w-md truncate">
                    {r.message.replace(/\s+/g, " ").slice(0, 160)}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-muted-foreground max-w-xs truncate">
                    {r.currentUrl ?? "—"}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                    {r.userId ? r.userId.slice(0, 8) : "anonymous"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {active && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
          onClick={() => setActive(null)}
          role="presentation"
          onKeyDown={(e) => {
            if (e.key === "Escape") setActive(null);
          }}
        >
          <div
            className="w-full max-w-lg h-full bg-background border-l border-border overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Feedback report detail"
          >
            <div className="p-4 border-b border-border flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Report · {active.kind}
                </div>
                <h2 className="font-display font-semibold text-base mt-1">
                  {new Date(active.createdAt).toLocaleString()}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setActive(null)}
                aria-label="Close"
                className="p-1 rounded hover:bg-accent/40"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Message</div>
                <pre className="whitespace-pre-wrap font-sans text-sm">
                  {active.message}
                </pre>
              </div>
              {active.currentUrl && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">URL</div>
                  <code className="text-xs break-all">{active.currentUrl}</code>
                </div>
              )}
              {active.browserUa && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Browser</div>
                  <code className="text-xs break-all">{active.browserUa}</code>
                </div>
              )}
              <div>
                <div className="text-xs text-muted-foreground mb-1">User</div>
                <code className="text-xs">
                  {active.userId ?? "(anonymous)"}
                </code>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

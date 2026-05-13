// Phase 16C — Admin-only moderation queue for the misconception
// marketplace. Lists open submissions FIFO with approve / reject
// buttons. Force-approve mints a catalog entry immediately, bypassing
// the auto-promote vote threshold; reject flips the row to "rejected"
// without writing to the catalog. Both record decidedBy + decidedAt
// for audit.

import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Check, ShieldAlert, X } from "lucide-react";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { EmptyState, Skeleton } from "../components/ui";

type QueueRow = Awaited<
  ReturnType<typeof api.misconceptions.moderateQueue>
>["submissions"][number];

export function MisconceptionsModerationPage() {
  const user = useAuthStore((s) => s.user);
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    let cancelled = false;
    api.misconceptions
      .moderateQueue()
      .then((r) => {
        if (!cancelled) setRows(r.submissions);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
          setRows([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role !== "admin") {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Moderator role required.
        </p>
      </div>
    );
  }

  const decide = async (id: string, action: "approve" | "reject") => {
    setBusy(id);
    setError("");
    try {
      await api.misconceptions.moderate(id, action);
      setRows((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-primary" strokeWidth={2} />
          Misconception moderation queue
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-prose">
          Approve to force-merge ahead of the community vote threshold,
          or reject to close the proposal. Decisions are logged with
          your admin id and timestamp.
        </p>
      </header>

      {error && (
        <p className="text-sm text-rose-600 dark:text-rose-400 mb-3">
          {error}
        </p>
      )}

      {rows === null && (
        <div className="space-y-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      )}

      {rows && rows.length === 0 && (
        <EmptyState
          icon={Check}
          title="Queue is clear"
          description="No open proposals waiting on moderator action."
        />
      )}

      {rows && rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li
              key={r.id}
              data-testid="queue-row"
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold leading-snug">
                    {r.label}
                  </h2>
                  <div className="text-[11px] text-muted-foreground mt-1 inline-flex items-center gap-1.5 flex-wrap">
                    <Link
                      to={`/wiki/${r.conceptSlug}`}
                      className="hover:text-foreground"
                    >
                      <code className="px-1 py-0.5 rounded bg-muted">
                        {r.conceptSlug}
                      </code>
                    </Link>
                    <span>·</span>
                    <code className="px-1 py-0.5 rounded bg-muted">
                      {r.key}
                    </code>
                    <span>·</span>
                    <span>@{r.proposerUsername}</span>
                    <span>·</span>
                    <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                    <span>·</span>
                    <span className="font-mono">+{r.voteScore}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 leading-relaxed whitespace-pre-wrap line-clamp-6">
                    {r.description}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => decide(r.id, "approve")}
                    className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-500 inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => decide(r.id, "reject")}
                    className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    Reject
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

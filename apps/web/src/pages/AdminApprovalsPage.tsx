// Sprint 52 — Admin approval queue.
//
// Visible to users with role='admin'. Lists pending content proposals
// (lesson_publish / news_publish / news_edit / wiki_edit) and lets the
// admin approve or reject with an optional note.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, XCircle, Clock, Filter } from "lucide-react";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";

type ProposalKind =
  | "lesson_publish"
  | "news_publish"
  | "news_edit"
  | "wiki_edit";

interface ProposalRow {
  id: string;
  kind: ProposalKind;
  targetId: string | null;
  targetLabel: string | null;
  proposerId: string;
  proposerUsername: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

interface ProposalDetail {
  id: string;
  kind: ProposalKind;
  targetId: string | null;
  proposerId: string;
  proposerUsername: string | null;
  reviewerId: string | null;
  reviewerUsername: string | null;
  reviewNote: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  decidedAt: string | null;
  payload: unknown;
  priorSnapshot: unknown;
}

const KIND_LABEL: Record<ProposalKind, string> = {
  lesson_publish: "Lesson",
  news_publish: "News (new)",
  news_edit: "News (edit)",
  wiki_edit: "Wiki edit",
};

export function AdminApprovalsPage() {
  const user = useAuthStore((s) => s.user);
  const [items, setItems] = useState<ProposalRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"" | ProposalKind>("");
  const [selected, setSelected] = useState<ProposalDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = async () => {
    setError(null);
    try {
      const qs = filter ? `?kind=${filter}` : "";
      const r = await fetch(`/api/v1/admin/proposals${qs}`, {
        credentials: "include",
      });
      if (!r.ok) {
        if (r.status === 403) {
          setError("Admin access required.");
          setItems([]);
          return;
        }
        throw new Error(`Failed (${r.status})`);
      }
      const data = (await r.json()) as { proposals: ProposalRow[] };
      setItems(data.proposals);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load proposals");
    }
  };

  useEffect(() => {
    load();
  }, [filter]);

  async function openDetail(id: string) {
    setSelected(null);
    setNote("");
    try {
      const r = await fetch(`/api/v1/admin/proposals/${id}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(`Failed (${r.status})`);
      const data = (await r.json()) as { proposal: ProposalDetail };
      setSelected(data.proposal);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load proposal");
    }
  }

  async function decide(action: "approve" | "reject") {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/v1/admin/proposals/${selected.id}/${action}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: note || undefined }),
        },
      );
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data?.error ?? `Failed (${r.status})`);
      }
      setSelected(null);
      setNote("");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Decision failed");
    } finally {
      setBusy(false);
    }
  }

  if (user && user.role !== "admin") {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Admin access required.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <header className="flex items-baseline justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Approvals queue
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review pending content proposals.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as "" | ProposalKind)}
            className="rounded-md border border-border bg-background px-2 py-1"
          >
            <option value="">All kinds</option>
            <option value="lesson_publish">Lessons</option>
            <option value="news_publish">News (new)</option>
            <option value="news_edit">News (edit)</option>
            <option value="wiki_edit">Wiki edits</option>
          </select>
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive mb-4">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-[280px_1fr] gap-4">
        <div className="space-y-1">
          {items === null && !error ? (
            <Skeleton className="h-32" />
          ) : items && items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending proposals.</p>
          ) : (
            items?.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => openDetail(p.id)}
                className={`w-full text-left rounded-md border p-3 transition-colors ${
                  selected?.id === p.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-accent/30"
                }`}
              >
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {KIND_LABEL[p.kind]}
                </div>
                <div className="text-sm font-medium mt-1 line-clamp-2">
                  {p.targetLabel ?? p.targetId ?? "(new)"}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  by @{p.proposerUsername ?? "unknown"} · {new Date(p.createdAt).toLocaleDateString()}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4 min-h-[200px]">
          {!selected ? (
            <p className="text-sm text-muted-foreground">
              Pick a proposal to review.
            </p>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {KIND_LABEL[selected.kind]}
                </div>
                <h2 className="font-display text-xl font-semibold tracking-tight mt-1">
                  {selected.targetId ? (
                    selected.kind === "lesson_publish" ? (
                      <Link
                        to={`/paths`}
                        className="hover:underline"
                      >
                        Lesson · node {selected.targetId.slice(0, 8)}…
                      </Link>
                    ) : selected.kind.startsWith("news") ? (
                      <span>News · {selected.targetId.slice(0, 8)}…</span>
                    ) : (
                      <span>Wiki · {selected.targetId.slice(0, 8)}…</span>
                    )
                  ) : (
                    <span>New {selected.kind}</span>
                  )}
                </h2>
                <div className="text-xs text-muted-foreground mt-1">
                  Proposed by @{selected.proposerUsername} on{" "}
                  {new Date(selected.createdAt).toLocaleString()}
                </div>
              </div>

              <details open className="text-sm">
                <summary className="cursor-pointer font-medium">Payload</summary>
                <pre className="mt-2 rounded bg-muted/40 p-3 text-xs overflow-x-auto max-h-72">
                  {JSON.stringify(selected.payload, null, 2)}
                </pre>
              </details>

              {selected.priorSnapshot != null && (
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium">
                    Prior snapshot (revert target)
                  </summary>
                  <pre className="mt-2 rounded bg-muted/40 p-3 text-xs overflow-x-auto max-h-72">
                    {JSON.stringify(selected.priorSnapshot, null, 2)}
                  </pre>
                </details>
              )}

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground" htmlFor="note">
                  Optional review note
                </label>
                <textarea
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => decide("approve")}
                  disabled={busy || selected.status !== "pending"}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-600/90 disabled:opacity-60"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => decide("reject")}
                  disabled={busy || selected.status !== "pending"}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-destructive/40 text-destructive text-sm font-medium hover:bg-destructive/10 disabled:opacity-60"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Reject
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

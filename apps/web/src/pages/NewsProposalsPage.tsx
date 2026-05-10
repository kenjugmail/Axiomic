import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { NewsEditProposal } from "@axiomic/types";
import { useAuthStore } from "../stores/auth";
import { relativeTime as timeAgo } from "../lib/dates";

// Compact word-level diff. Splits on whitespace and renders inserted
// words green, removed words red. Cheap visual cue — not a full diff.
function diffWords(before: string, after: string): JSX.Element {
  const a = before.split(/(\s+)/);
  const b = after.split(/(\s+)/);
  const setA = new Set(a);
  const setB = new Set(b);
  return (
    <span>
      {b.map((w, i) =>
        setA.has(w) ? (
          <span key={`b${i}`}>{w}</span>
        ) : (
          <span
            key={`b${i}`}
            className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 rounded px-0.5"
          >
            {w}
          </span>
        ),
      )}
      {a.some((w) => !setB.has(w) && w.trim()) && (
        <>
          {" "}
          <span className="text-muted-foreground text-xs">— removed:</span>{" "}
          {a
            .filter((w) => !setB.has(w) && w.trim())
            .map((w, i) => (
              <span
                key={`a${i}`}
                className="bg-rose-500/20 text-rose-700 dark:text-rose-300 line-through rounded px-0.5"
              >
                {w}
              </span>
            ))
            .reduce<JSX.Element[]>((acc, el, idx) => {
              if (idx > 0) acc.push(<span key={`s${idx}`}> </span>);
              acc.push(el);
              return acc;
            }, [])}
        </>
      )}
    </span>
  );
}

const STATUS_STYLES: Record<NewsEditProposal["status"], string> = {
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  approved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  rejected: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
};

export function NewsProposalsPage() {
  const { slug } = useParams<{ slug: string }>();
  const user = useAuthStore((s) => s.user);
  const [proposals, setProposals] = useState<NewsEditProposal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reviewMessage, setReviewMessage] = useState<Record<string, string>>({});
  // Snapshot the article body so we can render diffs without re-fetching
  // it on every action.
  const [originalBody, setOriginalBody] = useState("");
  const [originalTitle, setOriginalTitle] = useState("");

  const refresh = () => {
    if (!slug) return;
    Promise.all([
      api.news.proposals(slug),
      api.news.get(slug),
    ])
      .then(([pp, art]) => {
        setProposals(pp.proposals);
        setOriginalBody(art.article.body);
        setOriginalTitle(art.article.title);
      })
      .catch((e) => setError(e?.message ?? "Failed to load proposals"));
  };

  useEffect(refresh, [slug]);

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground mb-4">Sign in to view proposals.</p>
        <Link to="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-3">
        <p className="text-destructive">{error}</p>
        <Link to={`/news/${slug}`} className="text-primary hover:underline">
          Back to article
        </Link>
      </div>
    );
  }

  if (proposals === null) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="animate-pulse h-32 bg-muted rounded-lg" />
      </div>
    );
  }

  const handleReview = async (
    proposalId: string,
    action: "approve" | "reject",
  ) => {
    if (!slug || pendingId) return;
    setPendingId(proposalId);
    try {
      const data = { reviewMessage: reviewMessage[proposalId]?.trim() || undefined };
      if (action === "approve") {
        await api.news.approve(slug, proposalId, data);
      } else {
        await api.news.reject(slug, proposalId, data);
      }
      refresh();
    } catch (e: any) {
      alert(e?.message ?? "Review failed");
    } finally {
      setPendingId(null);
    }
  };

  const pending = proposals.filter((p) => p.status === "pending");
  const closed = proposals.filter((p) => p.status !== "pending");

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link
        to={`/news/${slug}`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; Article
      </Link>
      <h1 className="text-2xl font-bold mt-2">Proposed edits</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Approve to apply the change to the article. Reject to leave it as is.
      </p>

      {pending.length === 0 ? (
        <div className="mt-6 py-12 text-center text-muted-foreground border border-dashed border-border rounded-xl">
          No pending proposals.
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {pending.map((p) => (
            <li key={p.id} className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="text-sm">
                  <Link
                    to={`/profile/${p.proposerUsername}`}
                    className="font-medium hover:underline"
                  >
                    @{p.proposerUsername}
                  </Link>
                  <span className="text-muted-foreground"> · {timeAgo(p.createdAt)}</span>
                </div>
                <span
                  className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${STATUS_STYLES[p.status]}`}
                >
                  {p.status}
                </span>
              </div>
              {p.message && (
                <div className="px-4 py-3 text-sm border-b border-border bg-muted/30">
                  <span className="text-muted-foreground">Note: </span>
                  {p.message}
                </div>
              )}
              <div className="px-4 py-3 space-y-3">
                {p.proposedTitle !== originalTitle && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Title</div>
                    <div className="text-sm leading-relaxed">
                      {diffWords(originalTitle, p.proposedTitle)}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Body diff</div>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap break-words max-h-64 overflow-y-auto p-3 rounded-md bg-muted/30">
                    {diffWords(originalBody, p.proposedBody)}
                  </div>
                </div>
                <div>
                  <textarea
                    value={reviewMessage[p.id] || ""}
                    onChange={(e) =>
                      setReviewMessage({ ...reviewMessage, [p.id]: e.target.value })
                    }
                    placeholder="Optional message to the proposer…"
                    rows={2}
                    className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleReview(p.id, "approve")}
                    disabled={pendingId === p.id}
                    className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleReview(p.id, "reject")}
                    disabled={pendingId === p.id}
                    className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent/40 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {closed.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Past reviews
          </h2>
          <ul className="space-y-2">
            {closed.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 px-4 py-2 rounded-md border border-border text-sm"
              >
                <div>
                  <span className="font-medium">@{p.proposerUsername}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {p.proposedTitle}
                  </span>
                </div>
                <span
                  className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${STATUS_STYLES[p.status]}`}
                >
                  {p.status}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

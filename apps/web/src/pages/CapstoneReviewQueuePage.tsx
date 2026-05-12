// Sprint 39 — Capstone peer-review queue.
//
// Lists completed capstone artifacts ranked review-deficit-first.
// Anyone signed in can drop into one to submit a peer review.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, Users } from "lucide-react";
import type { CapstoneReviewQueueItem } from "@axiomic/types";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";

export function CapstoneReviewQueuePage() {
  const user = useAuthStore((s) => s.user);
  const [items, setItems] = useState<CapstoneReviewQueueItem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.capstones
      .reviewQueue(30)
      .then((r) => {
        if (cancelled) return;
        setItems(r.artifacts);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message ?? "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" strokeWidth={2} />
          Peer review queue
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-prose">
          Capstones that have passed AI grading but still want human eyes.
          Under-reviewed work surfaces first; signed-in viewers can leave a
          review on the artifact page.
        </p>
      </div>

      {error && <ErrorState error={error} />}
      {items === null && !error && (
        <EmptyState title="Loading…" description="Fetching the review queue." />
      )}
      {items && items.length === 0 && (
        <EmptyState
          title="No completed artifacts yet"
          description="Reviews show up once teammates complete their capstone work."
        />
      )}

      {items && items.length > 0 && (
        <ol className="space-y-2">
          {items.map((item) => (
            <li key={item.artifactPageSlug}>
              <Link
                to={`/capstones/c/${item.artifactPageSlug}#peer-review`}
                className="block rounded-md border border-border p-3 hover:bg-accent/30 transition-colors"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-lg shrink-0">{item.coverEmoji}</span>
                    <span className="font-medium text-sm truncate">
                      {item.capstoneTitle}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 inline-flex items-center gap-1">
                    <Eye className="w-3 h-3" strokeWidth={2} />
                    {item.peerReviewCount} review
                    {item.peerReviewCount === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  by{" "}
                  <span className="text-foreground/80">
                    {item.learnerDisplayName || `@${item.learnerUsername}`}
                  </span>{" "}
                  · completed{" "}
                  {new Date(item.completedAt).toLocaleDateString()}
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}

      {!user && items && items.length > 0 && (
        <p className="text-xs text-muted-foreground mt-6">
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>{" "}
          to leave a peer review.
        </p>
      )}
    </div>
  );
}

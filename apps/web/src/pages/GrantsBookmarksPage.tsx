// Sprint 71 — Saved grants list (mirror of NewsBookmarksPage).

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookmarkCheck, CalendarClock } from "lucide-react";
import type { GrantSummary } from "@axiomic/types";
import { api } from "../lib/api";
import { Skeleton } from "../components/ui";

function formatDeadline(iso: string | null): string {
  if (!iso) return "Ongoing";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const days = Math.ceil((t - Date.now()) / 86400_000);
  if (days < 0) return "Closed";
  if (days <= 14) return `Closes in ${days}d`;
  return `Closes ${new Date(t).toLocaleDateString()}`;
}

export function GrantsBookmarksPage() {
  const [items, setItems] = useState<GrantSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.grants
      .bookmarks()
      .then((r) => setItems(r.items))
      .catch((e: unknown) => {
        setItems([]);
        setError(e instanceof Error ? e.message : "Failed to load");
      });
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link to="/grants" className="text-sm text-primary hover:underline">
        ← Funding
      </Link>
      <h1 className="font-display text-2xl font-semibold tracking-tight mt-3">
        Saved grants
      </h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Grants you've bookmarked. Deadline alerts go to your notification
        bell as the close date approaches.
      </p>

      {error && (
        <div className="mb-4 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
          {error}
        </div>
      )}

      {items == null ? (
        <Skeleton className="h-32 w-full" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No saved grants yet. Bookmark grants from the funding feed.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((g) => (
            <Link
              key={g.id}
              to={`/grants/${g.id}`}
              className="block rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition-colors"
            >
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                {g.agency}
                {g.mechanism ? ` · ${g.mechanism}` : ""}
              </div>
              <div className="font-display font-semibold text-base leading-snug">
                {g.title}
              </div>
              <div className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1.5">
                <BookmarkCheck className="w-3.5 h-3.5 text-primary" />
                <span>Saved · </span>
                <CalendarClock className="w-3.5 h-3.5" />
                <span>{formatDeadline(g.deadlineAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// Sprint 71 — Grant detail page.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Bookmark,
  BookmarkCheck,
  CalendarClock,
  Coins,
  ExternalLink,
} from "lucide-react";
import type { GrantDetail } from "@axiomic/types";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - Date.now()) / 86400_000);
}

function formatAmount(n: number | null): string | null {
  if (n == null || n <= 0) return null;
  if (n >= 1_000_000) return `$${Math.round(n / 100_000) / 10}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

export function GrantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const [grant, setGrant] = useState<GrantDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (!id) return;
    setError(null);
    api.grants
      .get(id)
      .then((r) => setGrant(r.grant))
      .catch((e: unknown) => {
        setGrant(null);
        setError(e instanceof Error ? e.message : "Failed to load grant");
      });
  }, [id]);

  const handleToggleBookmark = async () => {
    if (!grant) return;
    setToggling(true);
    try {
      const { bookmarked } = await api.grants.toggleBookmark(grant.id);
      setGrant((g) => (g ? { ...g, bookmarked } : g));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to toggle");
    } finally {
      setToggling(false);
    }
  };

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
          {error}
        </div>
        <Link
          to="/grants"
          className="text-sm text-primary hover:underline mt-4 inline-block"
        >
          ← Back to funding
        </Link>
      </div>
    );
  }
  if (!grant) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Skeleton className="h-8 w-1/2 mb-4" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const days = daysUntil(grant.deadlineAt);
  const amount = formatAmount(grant.amountCeiling);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link to="/grants" className="text-sm text-primary hover:underline">
        ← All funding
      </Link>
      <div className="mt-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {grant.agency}
          {grant.mechanism ? ` · ${grant.mechanism}` : ""}
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight mt-1">
          {grant.title}
        </h1>
      </div>

      <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock className="w-4 h-4" />
          {grant.deadlineAt
            ? days != null && days >= 0
              ? `Closes in ${days} day${days === 1 ? "" : "s"} (${grant.deadlineAt})`
              : `Closed ${grant.deadlineAt}`
            : "Ongoing — no deadline posted"}
        </span>
        {amount && (
          <span className="inline-flex items-center gap-1.5">
            <Coins className="w-4 h-4" />
            Up to {amount}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 mt-4">
        <a
          href={grant.url}
          target="_blank"
          rel="noreferrer"
          className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 font-medium"
        >
          Open at {grant.agency}
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
        {user && (
          <button
            type="button"
            onClick={handleToggleBookmark}
            disabled={toggling}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {grant.bookmarked ? (
              <BookmarkCheck className="w-3.5 h-3.5 text-primary" />
            ) : (
              <Bookmark className="w-3.5 h-3.5" />
            )}
            {grant.bookmarked ? "Saved" : "Save"}
          </button>
        )}
      </div>

      {grant.topics.length > 0 && (
        <div className="mt-4 flex gap-1.5 flex-wrap">
          {grant.topics.map((t) => (
            <span
              key={t}
              className="text-[10px] px-2 py-0.5 rounded bg-accent/30 text-muted-foreground"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold mb-2">Synopsis</h2>
        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
          {grant.summary || grant.fullDescription || "No synopsis available."}
        </p>
      </section>

      {grant.fullDescription && grant.fullDescription !== grant.summary && (
        <section className="mt-6">
          <h2 className="font-display text-lg font-semibold mb-2">
            Full description
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
            {grant.fullDescription}
          </p>
        </section>
      )}
    </div>
  );
}

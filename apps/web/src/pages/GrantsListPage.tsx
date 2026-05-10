// Sprint 71 — Funding feed list page.
//
// Two views via tabs: "For you" (personalized matches) and "All
// open" (browse + filter). Each card shows agency, mechanism,
// deadline urgency, amount ceiling, and a bookmark toggle. Personal
// rail surfaces the match reason + score breakdown.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bookmark,
  BookmarkCheck,
  CalendarClock,
  Coins,
  Sparkles,
  Building2,
} from "lucide-react";
import type { GrantSummary, GrantsFeedItem } from "@axiomic/types";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";

type Tab = "for-you" | "all";

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - Date.now()) / 86400_000);
}

function formatDeadline(iso: string | null): { label: string; tone: string } {
  const d = daysUntil(iso);
  if (d == null) return { label: "Ongoing / no deadline", tone: "muted" };
  if (d < 0) return { label: "Closed", tone: "muted" };
  if (d <= 3) return { label: `Closes in ${d}d`, tone: "urgent" };
  if (d <= 14) return { label: `Closes in ${d}d`, tone: "warn" };
  if (d <= 60) return { label: `Closes in ${d}d`, tone: "info" };
  const date = new Date(iso!);
  return {
    label: `Closes ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
    tone: "muted",
  };
}

function formatAmount(n: number | null): string | null {
  if (n == null || n <= 0) return null;
  if (n >= 1_000_000) return `$${Math.round(n / 100_000) / 10}M ceiling`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K ceiling`;
  return `$${n} ceiling`;
}

function GrantCard({
  grant,
  match,
  onToggleBookmark,
  toggling,
}: {
  grant: GrantSummary;
  match?: GrantsFeedItem;
  onToggleBookmark: (id: string) => void;
  toggling: Set<string>;
}) {
  const deadline = formatDeadline(grant.deadlineAt);
  const amount = formatAmount(grant.amountCeiling);
  const isToggling = toggling.has(grant.id);
  return (
    <div className="rounded-lg border border-border bg-card hover:border-primary/40 transition-colors">
      <div className="p-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
          <Building2 className="w-3 h-3" />
          <span>{grant.agency}</span>
          {grant.mechanism && (
            <>
              <span>·</span>
              <span>{grant.mechanism}</span>
            </>
          )}
          {amount && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <Coins className="w-3 h-3" />
                {amount}
              </span>
            </>
          )}
        </div>
        <Link to={`/grants/${grant.id}`} className="block">
          <h3 className="font-display font-semibold text-base leading-snug mb-1 hover:text-primary">
            {grant.title}
          </h3>
        </Link>
        {grant.summary && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {grant.summary}
          </p>
        )}
        {match && (
          <p className="text-xs text-primary mt-2">{match.reason}</p>
        )}
        {grant.topics.length > 0 && (
          <div className="mt-2 flex gap-1.5 flex-wrap">
            {grant.topics.slice(0, 4).map((t) => (
              <span
                key={t}
                className="text-[10px] px-1.5 py-0.5 rounded bg-accent/30 text-muted-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="px-4 pb-3 flex items-center justify-between text-xs">
        <span
          className={
            deadline.tone === "urgent"
              ? "text-rose-500 font-medium inline-flex items-center gap-1"
              : deadline.tone === "warn"
                ? "text-amber-500 inline-flex items-center gap-1"
                : "text-muted-foreground inline-flex items-center gap-1"
          }
        >
          <CalendarClock className="w-3.5 h-3.5" />
          {deadline.label}
        </span>
        <button
          type="button"
          onClick={() => onToggleBookmark(grant.id)}
          disabled={isToggling}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 disabled:opacity-50"
          aria-pressed={grant.bookmarked ?? false}
          aria-label={grant.bookmarked ? "Remove bookmark" : "Bookmark"}
        >
          {grant.bookmarked ? (
            <BookmarkCheck className="w-3.5 h-3.5 text-primary" />
          ) : (
            <Bookmark className="w-3.5 h-3.5" />
          )}
          {grant.bookmarked ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}

export function GrantsListPage() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<Tab>(user ? "for-you" : "all");
  const [feedItems, setFeedItems] = useState<GrantsFeedItem[] | null>(null);
  const [allGrants, setAllGrants] = useState<GrantSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<Set<string>>(new Set());

  // Filters for the "All open" tab.
  const [agencyFilter, setAgencyFilter] = useState<string | null>(null);
  const [withinDays, setWithinDays] = useState<number | null>(null);

  const loadFeed = () => {
    setError(null);
    api.grants
      .feed(12)
      .then((r) => setFeedItems(r.items))
      .catch((e: unknown) => {
        setFeedItems([]);
        setError(e instanceof Error ? e.message : "Failed to load feed");
      });
  };

  const loadAll = () => {
    setError(null);
    api.grants
      .list({
        agency: agencyFilter ?? undefined,
        withinDays: withinDays ?? undefined,
        limit: 30,
      })
      .then((r) => setAllGrants(r.items))
      .catch((e: unknown) => {
        setAllGrants([]);
        setError(e instanceof Error ? e.message : "Failed to load grants");
      });
  };

  useEffect(() => {
    if (tab === "for-you") loadFeed();
    else loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, agencyFilter, withinDays]);

  const handleToggleBookmark = async (id: string) => {
    setToggling((prev) => new Set(prev).add(id));
    try {
      const { bookmarked } = await api.grants.toggleBookmark(id);
      setFeedItems((prev) =>
        prev
          ? prev.map((it) =>
              it.grant.id === id
                ? { ...it, grant: { ...it.grant, bookmarked } }
                : it,
            )
          : prev,
      );
      setAllGrants((prev) =>
        prev
          ? prev.map((g) => (g.id === id ? { ...g, bookmarked } : g))
          : prev,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to toggle bookmark");
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const allAgencies = useMemo(() => {
    if (!allGrants) return [];
    const counts = new Map<string, number>();
    for (const g of allGrants) counts.set(g.agency, (counts.get(g.agency) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [allGrants]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Funding
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Federal grants from NIH, NSF, CDC, and grants.gov, scored
            against your publication interests.
          </p>
        </div>
        {user && (
          <Link
            to="/grants/me/bookmarks"
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 inline-flex items-center gap-1.5"
          >
            <BookmarkCheck className="w-3.5 h-3.5" />
            Saved
          </Link>
        )}
      </div>

      <div className="flex items-center gap-1.5 mb-6">
        <button
          type="button"
          onClick={() => setTab("for-you")}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors inline-flex items-center gap-1.5 ${
            tab === "for-you"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          For you
        </button>
        <button
          type="button"
          onClick={() => setTab("all")}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            tab === "all"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          All open
        </button>
      </div>

      {tab === "all" && (
        <div className="flex items-center gap-1.5 mb-6 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
            Closes within
          </span>
          {[
            { label: "Anytime", v: null },
            { label: "30d", v: 30 },
            { label: "60d", v: 60 },
            { label: "90d", v: 90 },
          ].map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => setWithinDays(opt.v)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                withinDays === opt.v
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
          {allAgencies.length > 0 && (
            <>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1 ml-3">
                Agency
              </span>
              <button
                type="button"
                onClick={() => setAgencyFilter(null)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  agencyFilter === null
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                All
              </button>
              {allAgencies.map(([name]) => (
                <button
                  key={name}
                  type="button"
                  onClick={() =>
                    setAgencyFilter(agencyFilter === name ? null : name)
                  }
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    agencyFilter === name
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {name}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
          {error}
        </div>
      )}

      {tab === "for-you" ? (
        feedItems == null ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : feedItems.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            We need a bit more signal — publish a paper or set your ORCID
            in settings, and your funding feed will fill in here.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {feedItems.map((m) => (
              <GrantCard
                key={m.grant.id}
                grant={m.grant}
                match={m}
                onToggleBookmark={handleToggleBookmark}
                toggling={toggling}
              />
            ))}
          </div>
        )
      ) : allGrants == null ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : allGrants.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No open grants match those filters.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {allGrants.map((g) => (
            <GrantCard
              key={g.id}
              grant={g}
              onToggleBookmark={handleToggleBookmark}
              toggling={toggling}
            />
          ))}
        </div>
      )}
    </div>
  );
}

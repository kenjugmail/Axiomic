// Sprint 70 — Researcher for-you feed.
//
// Three rails (For you / Trending in your field / From people you
// follow) backed by /research/feed. Each card shows a transparent
// "Why?" popover with the same numbers the server used to rank it,
// plus a "Summarize" drawer that streams the cached tier-aware AI
// summary and lets the user toggle tiers without re-paying inference.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Info,
  X,
} from "lucide-react";
import type { ResearchFeedItem, ResearchFeedResponse } from "@axiomic/types";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";

type Tier = "intro" | "undergrad" | "grad";

function formatScore(n: number): string {
  return (Math.round(n * 1000) / 1000).toFixed(3);
}

function formatAge(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const days = Math.floor((Date.now() - t) / 86400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function WhyPopover({
  item,
  onClose,
}: {
  item: ResearchFeedItem;
  onClose: () => void;
}) {
  const rows: Array<{ label: string; value: string }> = [
    {
      label: "Matches your topics",
      value: formatScore(item.breakdown.interestScore),
    },
    {
      label: "Recent search affinity",
      value: formatScore(item.breakdown.queryAffinity),
    },
    {
      label: "Author you follow",
      value: item.breakdown.authorOverlap > 0 ? "yes" : "—",
    },
    {
      label: "Recency",
      value: formatScore(item.breakdown.recencyDecay),
    },
    {
      label: "Citation boost",
      value: formatScore(item.breakdown.citationBoost),
    },
  ];
  return (
    <div className="absolute z-20 right-0 top-7 w-72 rounded-md border border-border bg-popover shadow-lg p-3 text-xs">
      <div className="flex items-start justify-between mb-2">
        <span className="font-medium text-foreground">Why this paper?</span>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-muted-foreground mb-2">{item.reason}</p>
      <div className="space-y-1">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between border-t border-border/50 pt-1"
          >
            <span className="text-muted-foreground">{r.label}</span>
            <span className="font-mono text-[11px] text-foreground">
              {r.value}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-border pt-1.5 mt-1.5">
          <span className="font-medium text-foreground">Total score</span>
          <span className="font-mono font-semibold text-primary">
            {formatScore(item.breakdown.total)}
          </span>
        </div>
      </div>
      {item.breakdown.alreadyShown && (
        <p className="text-[11px] text-amber-500 mt-2">
          Demoted slightly — shown to you in the last two weeks.
        </p>
      )}
    </div>
  );
}

async function streamSummary(
  slug: string,
  tier: Tier,
  onToken: (text: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(`/api/v1/research/${slug}/summary`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Summary failed: ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const ev of events) {
      const line = ev.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") return;
      try {
        const obj = JSON.parse(payload);
        if (typeof obj.token === "string") onToken(obj.token);
      } catch {
        // ignore malformed line
      }
    }
  }
}

function SummaryDrawer({
  item,
  onClose,
}: {
  item: ResearchFeedItem;
  onClose: () => void;
}) {
  const [tier, setTier] = useState<Tier>("undergrad");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cachedTiers, setCachedTiers] = useState<Set<Tier>>(new Set());

  useEffect(() => {
    let aborted = false;
    const ctrl = new AbortController();
    setText("");
    setError(null);
    setLoading(true);

    api.research
      .cachedSummary(item.slug, tier)
      .then((cached) => {
        if (aborted) return;
        if (cached.cached) {
          setText(cached.summaryMd);
          setCachedTiers((prev) => new Set(prev).add(tier));
          setLoading(false);
          return;
        }
        // Cache miss → stream a fresh summary.
        return streamSummary(
          item.slug,
          tier,
          (tok) => {
            if (aborted) return;
            setText((t) => t + tok);
          },
          ctrl.signal,
        ).then(() => {
          if (!aborted) {
            setCachedTiers((prev) => new Set(prev).add(tier));
            setLoading(false);
          }
        });
      })
      .catch((e: unknown) => {
        if (aborted) return;
        const msg = e instanceof Error ? e.message : "Failed to summarize";
        setError(msg);
        setLoading(false);
      });

    return () => {
      aborted = true;
      ctrl.abort();
    };
  }, [item.slug, tier]);

  return (
    <div
      className="fixed inset-0 z-30 bg-black/40 flex justify-end"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md h-full bg-background border-l border-border overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="font-display font-semibold text-base truncate">
              {item.title}
            </h2>
            <p className="text-xs text-muted-foreground">
              AI summary · {item.format}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-accent/40"
            aria-label="Close summary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 border-b border-border flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
            Tier
          </span>
          {(["intro", "undergrad", "grad"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTier(t)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                tier === t
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "intro" ? "Intro" : t === "grad" ? "Grad" : "Undergrad"}
              {cachedTiers.has(t) && (
                <span className="ml-1 text-[9px] text-emerald-500">●</span>
              )}
            </button>
          ))}
        </div>

        <div className="p-4 text-sm leading-relaxed whitespace-pre-wrap">
          {error ? (
            <div className="text-rose-500 text-sm">{error}</div>
          ) : text.length === 0 && loading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          ) : (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              {text}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border">
          <Link
            to={`/research/${item.slug}`}
            className="text-xs text-primary hover:underline"
          >
            Read the full paper →
          </Link>
        </div>
      </div>
    </div>
  );
}

function FeedCard({
  item,
  onSummarize,
}: {
  item: ResearchFeedItem;
  onSummarize: (item: ResearchFeedItem) => void;
}) {
  const [whyOpen, setWhyOpen] = useState(false);
  return (
    <div className="relative rounded-lg border border-border bg-card hover:border-primary/40 transition-colors">
      <Link
        to={`/research/${item.slug}`}
        className="block p-4"
      >
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
          <span>{item.format}</span>
          <span>·</span>
          <span>{formatAge(item.publishedAt)}</span>
          {item.citationCount > 0 && (
            <>
              <span>·</span>
              <span>{item.citationCount} cites</span>
            </>
          )}
          {item.authorUsername && (
            <>
              <span>·</span>
              <span>@{item.authorUsername}</span>
            </>
          )}
        </div>
        <h3 className="font-display font-semibold text-base leading-snug mb-1 group-hover:text-primary">
          {item.title}
        </h3>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {item.snippet}
        </p>
        {item.tags.length > 0 && (
          <div className="mt-2 flex gap-1.5 flex-wrap">
            {item.tags.slice(0, 4).map((t) => (
              <span
                key={t}
                className="text-[10px] px-1.5 py-0.5 rounded bg-accent/30 text-muted-foreground"
              >
                #{t}
              </span>
            ))}
          </div>
        )}
      </Link>
      <div className="px-4 pb-3 flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSummarize(item);
          }}
          className="text-primary hover:underline inline-flex items-center gap-1"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Summarize
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setWhyOpen((v) => !v);
            }}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            aria-expanded={whyOpen}
            aria-label="Why this paper?"
          >
            <Info className="w-3.5 h-3.5" />
            Why?
          </button>
          {whyOpen && (
            <WhyPopover item={item} onClose={() => setWhyOpen(false)} />
          )}
        </div>
      </div>
    </div>
  );
}

function Rail({
  title,
  icon,
  items,
  emptyMessage,
  onSummarize,
}: {
  title: string;
  icon: React.ReactNode;
  items: ResearchFeedItem[];
  emptyMessage: string;
  onSummarize: (item: ResearchFeedItem) => void;
}) {
  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-primary">{icon}</span>
        <h2 className="font-display text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <span className="text-xs text-muted-foreground ml-1">
          {items.length} {items.length === 1 ? "paper" : "papers"}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">{emptyMessage}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((it) => (
            <FeedCard key={it.id} item={it} onSummarize={onSummarize} />
          ))}
        </div>
      )}
    </section>
  );
}

function FrontierLink({
  it,
}: {
  it: Awaited<ReturnType<typeof api.research.frontier>>["items"][number];
}) {
  const cls =
    "font-display text-sm font-semibold leading-snug hover:text-primary";
  // External papers + grants are off-platform URLs; everything
  // else is an internal route.
  const external = it.kind === "external_paper" || it.kind === "grant";
  if (external) {
    return (
      <a href={it.url} target="_blank" rel="noreferrer" className={cls}>
        {it.title}
      </a>
    );
  }
  return (
    <Link to={it.url} className={cls}>
      {it.title}
    </Link>
  );
}

export function ResearchFeedPage() {
  const { user } = useAuthStore();
  const [data, setData] = useState<ResearchFeedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawerItem, setDrawerItem] = useState<ResearchFeedItem | null>(null);
  const [frontier, setFrontier] = useState<Awaited<
    ReturnType<typeof api.research.frontier>
  > | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.research
      .frontier(10)
      .then((r) => {
        if (!cancelled) setFrontier(r);
      })
      .catch(() => {
        if (!cancelled) setFrontier({ personalized: false, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api.research
      .feed(8)
      .then((r) => {
        if (cancelled) return;
        setData(r);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setData({
          personalized: false,
          rails: { for_you: [], trending: [], from_follows: [] },
        });
        setError(e instanceof Error ? e.message : "Failed to load feed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const totalCount = useMemo(() => {
    if (!data) return 0;
    return (
      data.rails.for_you.length +
      data.rails.trending.length +
      data.rails.from_follows.length
    );
  }, [data]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Research feed
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {data?.personalized
            ? "Papers ranked from your publication history, recent searches, and people you follow."
            : "Trending research papers. Sign in for personalized recommendations."}
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
          {error}
        </div>
      )}

      {!data ? (
        <div className="space-y-6">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Skeleton className="h-5 w-40 mb-3" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : totalCount === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            No papers yet — your feed will fill in as content lands and you
            search around.
          </p>
          <Link
            to="/research"
            className="text-sm text-primary hover:underline"
          >
            Browse all research papers
          </Link>
        </div>
      ) : (
        <>
          {frontier && frontier.items.length > 0 && (
            <section className="mb-8">
              <h2 className="text-sm font-semibold mb-3 inline-flex items-center gap-1.5">
                <Target className="w-4 h-4 text-primary" />
                Research frontier
                <span className="text-[10px] font-normal text-muted-foreground">
                  papers · bounties · reproductions · grants, ranked for
                  you
                </span>
              </h2>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {frontier.items.map((it) => (
                  <li
                    key={`${it.kind}-${it.id}`}
                    className="rounded-lg border border-border bg-card p-3 hover:border-primary/40 transition-colors"
                    data-testid="frontier-item"
                  >
                    <FrontierLink it={it} />
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded-full border border-border">
                        {it.kind.replace("_", " ")}
                      </span>
                      <span>{it.reason}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {data.personalized && (
            <Rail
              title="For you"
              icon={<Sparkles className="w-4 h-4" />}
              items={data.rails.for_you}
              emptyMessage={
                user
                  ? "We need a bit more signal — publish a paper or run a few searches and your feed will sharpen."
                  : "Sign in to see personalized recommendations."
              }
              onSummarize={setDrawerItem}
            />
          )}
          <Rail
            title="Trending in your field"
            icon={<TrendingUp className="w-4 h-4" />}
            items={data.rails.trending}
            emptyMessage="No trending papers yet."
            onSummarize={setDrawerItem}
          />
          {data.personalized && (
            <Rail
              title="From people you follow"
              icon={<Users className="w-4 h-4" />}
              items={data.rails.from_follows}
              emptyMessage="Follow other researchers to fill this rail."
              onSummarize={setDrawerItem}
            />
          )}
        </>
      )}

      {drawerItem && (
        <SummaryDrawer
          item={drawerItem}
          onClose={() => setDrawerItem(null)}
        />
      )}
    </div>
  );
}

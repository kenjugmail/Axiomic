import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import type { NewsArticleSummary, NewsTagCount } from "@axiomic/types";
import { NewsCover } from "../components/news/NewsCover";
import { useAuthStore } from "../stores/auth";

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return "today";
  if (diff < 2 * day) return "yesterday";
  if (diff < 30 * day) return `${Math.floor(diff / day)}d ago`;
  return d.toLocaleDateString();
}

function totalReactions(counts: NewsArticleSummary["reactionCounts"]): number {
  return counts.thumbs + counts.lightbulb + counts.mind_blown;
}

export function NewsListPage() {
  const user = useAuthStore((s) => s.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTag = searchParams.get("tag") || "";
  const [articles, setArticles] = useState<NewsArticleSummary[] | null>(null);
  const [tags, setTags] = useState<NewsTagCount[]>([]);

  useEffect(() => {
    setArticles(null);
    api.news
      .list({ tag: activeTag || undefined })
      .then((r) => setArticles(r.articles))
      .catch(() => setArticles([]));
  }, [activeTag]);

  useEffect(() => {
    api.news.tags().then((r) => setTags(r.tags)).catch(() => setTags([]));
  }, []);

  const setTag = (tag: string) => {
    const sp = new URLSearchParams(searchParams);
    if (tag) sp.set("tag", tag);
    else sp.delete("tag");
    setSearchParams(sp);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-end justify-between mb-8 gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">News</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Long-form articles by the community. Anyone can suggest edits;
            the author approves them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {user && (
            <Link
              to="/news/drafts"
              className="px-3 py-2 rounded-md border border-border text-sm hover:bg-accent/40"
            >
              ✏️ Drafts
            </Link>
          )}
          {user && (
            <Link
              to="/news/bookmarks"
              className="px-3 py-2 rounded-md border border-border text-sm hover:bg-accent/40"
            >
              🔖 Saved
            </Link>
          )}
          {user && (
            <Link
              to="/news/new"
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
            >
              + New article
            </Link>
          )}
        </div>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-6">
          <button
            onClick={() => setTag("")}
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              !activeTag
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          {tags.map((t) => (
            <button
              key={t.tag}
              onClick={() => setTag(t.tag)}
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                activeTag === t.tag
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              #{t.tag}
              <span className="ml-1 opacity-60">{t.count}</span>
            </button>
          ))}
        </div>
      )}

      {articles === null ? (
        <div className="grid sm:grid-cols-2 gap-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-64 animate-pulse bg-muted rounded-xl" />
          ))}
        </div>
      ) : articles.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground border border-dashed border-border rounded-xl">
          {activeTag ? (
            <>
              <p className="text-base">
                No articles tagged{" "}
                <span className="font-mono text-foreground">#{activeTag}</span> yet.
              </p>
              <button
                onClick={() => setTag("")}
                className="text-sm text-primary hover:underline mt-2"
              >
                Clear filter →
              </button>
            </>
          ) : (
            <>
              <p className="text-base">No articles yet.</p>
              {user && (
                <p className="text-sm mt-2">
                  <Link to="/news/new" className="text-primary hover:underline">
                    Write the first one →
                  </Link>
                </p>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Featured (most recent) gets a wider layout. */}
          <Link
            to={`/news/${articles[0].slug}`}
            className="block rounded-xl overflow-hidden border border-border bg-card hover:bg-accent/20 transition-colors"
          >
            <NewsCover
              emoji={articles[0].coverEmoji}
              accent={articles[0].accentColor}
              size="lg"
            />
            <div className="p-6">
              <div className="text-xs uppercase tracking-wider text-primary mb-2">
                Latest
              </div>
              <h2 className="text-2xl font-bold mb-2 leading-tight">
                {articles[0].title}
              </h2>
              <p className="text-muted-foreground mb-3 line-clamp-2">
                {articles[0].summary}
              </p>
              {articles[0].tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {articles[0].tags.map((t) => (
                    <span
                      key={t}
                      className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>
                  by{" "}
                  <span className="font-medium text-foreground">
                    @{articles[0].authorUsername}
                  </span>
                </span>
                <span>·</span>
                <span>{articles[0].readingMinutes} min read</span>
                <span>·</span>
                <span>{relativeDate(articles[0].createdAt)}</span>
                {totalReactions(articles[0].reactionCounts) > 0 && (
                  <>
                    <span>·</span>
                    <span>{totalReactions(articles[0].reactionCounts)} reactions</span>
                  </>
                )}
              </div>
            </div>
          </Link>

          {/* Rest grid in 2-col layout. */}
          {articles.length > 1 && (
            <div className="grid sm:grid-cols-2 gap-5">
              {articles.slice(1).map((a) => (
                <Link
                  key={a.id}
                  to={`/news/${a.slug}`}
                  className="block rounded-xl overflow-hidden border border-border bg-card hover:bg-accent/20 transition-colors"
                >
                  <NewsCover emoji={a.coverEmoji} accent={a.accentColor} size="sm" />
                  <div className="p-4">
                    <h3 className="font-semibold mb-1.5 leading-snug line-clamp-2">
                      {a.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {a.summary}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>@{a.authorUsername}</span>
                      <span>·</span>
                      <span>{a.readingMinutes} min</span>
                      <span>·</span>
                      <span>{relativeDate(a.createdAt)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

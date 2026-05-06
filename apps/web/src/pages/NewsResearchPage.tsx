import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Plus } from "lucide-react";
import { api } from "../lib/api";
import type { NewsArticleSummary } from "@axiomic/types";
import { NewsCover } from "../components/news/NewsCover";
import { useAuthStore } from "../stores/auth";
import { EmptyState } from "../components/ui";

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return "today";
  if (diff < 2 * day) return "yesterday";
  if (diff < 30 * day) return `${Math.floor(diff / day)}d ago`;
  return d.toLocaleDateString();
}

// Surface for research-paper-style articles only — anything with an
// authored abstract or one or more references. Reuses the same news
// shape but reframes the layout (paper-strip + abstract preview)
// for a more academic feel.
export function NewsResearchPage() {
  const user = useAuthStore((s) => s.user);
  const [articles, setArticles] = useState<NewsArticleSummary[] | null>(null);

  useEffect(() => {
    api.news
      .list({ style: "research" })
      .then((r) => setArticles(r.articles))
      .catch(() => setArticles([]));
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link
        to="/news"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; All news
      </Link>

      <div className="flex items-end justify-between mb-8 mt-2 gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Research</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Long-form, paper-style articles. Each has an abstract,
            numbered references, and (optionally) coauthors.
          </p>
        </div>
        {user && (
          <Link
            to="/news/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            New article
          </Link>
        )}
      </div>

      {articles === null ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse bg-muted rounded-xl" />
          ))}
        </div>
      ) : articles.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No research articles yet."
          description="Fill in an abstract or references on a news article and it will land here."
          cta={
            user ? (
              <Link
                to="/news/new"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
                Write the first one
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-4">
          {articles.map((a) => (
            <li
              key={a.id}
              className="rounded-xl border border-border bg-card overflow-hidden"
            >
              <Link
                to={`/news/${a.slug}`}
                className="grid sm:grid-cols-[160px_1fr] gap-4 hover:bg-accent/20 transition-colors"
              >
                <NewsCover emoji={a.coverEmoji} accent={a.accentColor} size="sm" />
                <div className="p-4 pr-5 min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-primary mb-1">
                    Research · {a.readingMinutes} min read
                  </div>
                  <h2 className="text-lg font-semibold leading-snug mb-1.5">
                    {a.title}
                  </h2>
                  <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                    {a.summary}
                  </p>
                  <div className="text-xs text-muted-foreground">
                    by{" "}
                    <span className="font-medium text-foreground">
                      @{a.authorUsername}
                    </span>
                    <span> · {relativeDate(a.createdAt)}</span>
                  </div>
                  {a.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {a.tags.slice(0, 6).map((t) => (
                        <span
                          key={t}
                          className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

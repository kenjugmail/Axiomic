import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import type { NewsArticleCard } from "@axiomic/types";
import { NewsCover } from "./NewsCover";

interface Props {
  articleSlug: string;
}

type Mode = "author" | "semantic";

export function RelatedNewsRail({ articleSlug }: Props) {
  const [mode, setMode] = useState<Mode>("author");
  const [articles, setArticles] = useState<NewsArticleCard[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setArticles(null);
    setLoading(true);
    const promise =
      mode === "semantic"
        ? api.ai.relatedNewsSemantic(articleSlug)
        : api.news.related(articleSlug);
    promise
      .then((r) => setArticles(r.articles))
      .catch(() => setArticles([]))
      .finally(() => setLoading(false));
  }, [articleSlug, mode]);

  return (
    <section className="mt-12 pt-8 border-t border-border">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="text-xl font-bold">Keep reading</h2>
        <div className="flex gap-1 p-1 rounded-md bg-muted text-xs">
          <button
            onClick={() => setMode("author")}
            className={`px-3 py-1 rounded transition-colors ${
              mode === "author"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Same author
          </button>
          <button
            onClick={() => setMode("semantic")}
            className={`px-3 py-1 rounded transition-colors ${
              mode === "semantic"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            ✨ Semantic
          </button>
        </div>
      </div>

      {loading || articles === null ? (
        <div className="h-32 animate-pulse bg-muted rounded-xl" />
      ) : articles.length === 0 ? (
        <p className="text-sm text-muted-foreground">No related articles yet.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {articles.map((a) => (
            <Link
              key={a.id}
              to={`/news/${a.slug}`}
              className="block rounded-xl overflow-hidden border border-border bg-card hover:bg-accent/20 transition-colors"
            >
              <NewsCover emoji={a.coverEmoji} accent={a.accentColor} size="sm" />
              <div className="p-4">
                <h3 className="font-semibold text-sm mb-1 leading-snug line-clamp-2">
                  {a.title}
                </h3>
                <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                  {a.summary}
                </p>
                <span className="text-[11px] text-muted-foreground">
                  @{a.authorUsername}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

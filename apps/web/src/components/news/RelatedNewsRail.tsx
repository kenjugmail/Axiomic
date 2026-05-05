import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import type { NewsArticleCard } from "@axiomic/types";
import { NewsCover } from "./NewsCover";

interface Props {
  articleSlug: string;
}

export function RelatedNewsRail({ articleSlug }: Props) {
  const [articles, setArticles] = useState<NewsArticleCard[] | null>(null);

  useEffect(() => {
    api.news
      .related(articleSlug)
      .then((r) => setArticles(r.articles))
      .catch(() => setArticles([]));
  }, [articleSlug]);

  if (articles === null) {
    return (
      <div className="mt-12 pt-8 border-t border-border">
        <div className="h-32 animate-pulse bg-muted rounded-xl" />
      </div>
    );
  }
  if (articles.length === 0) return null;

  return (
    <section className="mt-12 pt-8 border-t border-border">
      <h2 className="text-xl font-bold mb-4">Keep reading</h2>
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
    </section>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark } from "lucide-react";
import { api } from "../lib/api";
import type { NewsBookmarkSummary } from "@axiomic/types";
import { NewsCover } from "../components/news/NewsCover";
import { useAuthStore } from "../stores/auth";
import { EmptyState } from "../components/ui";

function bookmarkedAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return "saved today";
  if (diff < 2 * day) return "saved yesterday";
  if (diff < 30 * day) return `saved ${Math.floor(diff / day)}d ago`;
  return `saved ${new Date(iso).toLocaleDateString()}`;
}

export function NewsBookmarksPage() {
  const { user, loading: authLoading } = useAuthStore();
  const [articles, setArticles] = useState<NewsBookmarkSummary[] | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    api.news
      .bookmarks()
      .then((r) => setArticles(r.articles))
      .catch(() => setArticles([]));
  }, [user, authLoading]);

  if (authLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="animate-pulse h-32 bg-muted rounded-lg" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground mb-4">
          Sign in to see your bookmarks.
        </p>
        <Link to="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8 gap-3 flex-wrap">
        <div>
          <Link to="/news" className="text-sm text-muted-foreground hover:text-foreground">
            &larr; News
          </Link>
          <h1 className="text-3xl font-bold mt-1">Saved articles</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Articles you've bookmarked, freshest save first.
          </p>
        </div>
      </div>

      {articles === null ? (
        <div className="grid sm:grid-cols-2 gap-5">
          {[1, 2].map((i) => (
            <div key={i} className="h-64 animate-pulse bg-muted rounded-xl" />
          ))}
        </div>
      ) : articles.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="No bookmarks yet."
          description="Hit Save on any article to find it here later."
          cta={
            <Link
              to="/news"
              className="inline-flex items-center px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
            >
              Browse the news
            </Link>
          }
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-5">
          {articles.map((a) => (
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
                  <span className="inline-flex items-center gap-1 text-accent-amber">
                    <Bookmark className="w-3 h-3" strokeWidth={2} />
                    {bookmarkedAgo(a.bookmarkedAt)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

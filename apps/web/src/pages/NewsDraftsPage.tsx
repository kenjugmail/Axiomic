import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { NewsArticleSummary } from "@axiomic/types";
import { NewsCover } from "../components/news/NewsCover";
import { useAuthStore } from "../stores/auth";

export function NewsDraftsPage() {
  const { user, loading: authLoading } = useAuthStore();
  const [drafts, setDrafts] = useState<NewsArticleSummary[] | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    api.news
      .drafts()
      .then((r) => setDrafts(r.articles))
      .catch(() => setDrafts([]));
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
        <p className="text-muted-foreground mb-4">Sign in to see your drafts.</p>
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
          <h1 className="text-3xl font-bold mt-1">Drafts</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Only you can see these. Publish from the article editor when you're ready.
          </p>
        </div>
        <Link
          to="/news/new"
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          + New article
        </Link>
      </div>

      {drafts === null ? (
        <div className="grid sm:grid-cols-2 gap-5">
          {[1, 2].map((i) => (
            <div key={i} className="h-64 animate-pulse bg-muted rounded-xl" />
          ))}
        </div>
      ) : drafts.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground border border-dashed border-border rounded-xl">
          <p className="text-base">No drafts.</p>
          <p className="text-sm mt-2">
            Hit{" "}
            <span className="font-medium text-foreground">Save as draft</span>{" "}
            from the editor to come back to a piece later.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-5">
          {drafts.map((a) => (
            <Link
              key={a.id}
              to={`/news/${a.slug}/edit`}
              className="block rounded-xl overflow-hidden border border-border bg-card hover:bg-accent/20 transition-colors relative"
            >
              <div className="absolute top-3 left-3 z-10 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/90 text-white">
                Draft
              </div>
              <NewsCover emoji={a.coverEmoji} accent={a.accentColor} size="sm" />
              <div className="p-4">
                <h3 className="font-semibold mb-1.5 leading-snug line-clamp-2">
                  {a.title || <span className="text-muted-foreground italic">Untitled</span>}
                </h3>
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                  {a.summary || "No summary yet."}
                </p>
                <div className="flex flex-wrap gap-1">
                  {a.tags.map((t) => (
                    <span
                      key={t}
                      className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark } from "lucide-react";
import { api } from "../lib/api";
import type { ForumBookmarkSummary, PostType } from "@axiomic/types";
import { PostTypeBadge } from "../components/PostTypeBadge";
import { useAuthStore } from "../stores/auth";
import { EmptyState } from "../components/ui";

function bookmarkedAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return "saved today";
  if (diff < 2 * day) return "saved yesterday";
  if (diff < 30 * day) return `saved ${Math.floor(diff / day)}d ago`;
  return `saved ${new Date(iso).toLocaleDateString()}`;
}

export function ForumBookmarksPage() {
  const { user, loading: authLoading } = useAuthStore();
  const [topics, setTopics] = useState<ForumBookmarkSummary[] | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    api.forum
      .bookmarks()
      .then((r) => setTopics(r.topics))
      .catch(() => setTopics([]));
  }, [user, authLoading]);

  if (authLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="animate-pulse h-32 bg-muted rounded-lg" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground mb-4">
          Sign in to see your bookmarked forum topics.
        </p>
        <Link to="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link to="/forum" className="text-sm text-muted-foreground hover:text-foreground">
        &larr; Forum
      </Link>
      <h1 className="text-2xl font-bold mt-1 mb-6">Saved topics</h1>

      {topics === null ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse bg-muted rounded-md" />
          ))}
        </div>
      ) : topics.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="No saved topics yet."
          description="Hit Save on any forum topic to find it here later."
          cta={
            <Link
              to="/forum"
              className="inline-flex items-center px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
            >
              Browse the forum
            </Link>
          }
        />
      ) : (
        <ul className="space-y-2">
          {topics.map((t) => (
            <li
              key={t.id}
              className="border border-border rounded-lg p-3 hover:bg-accent/30 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <PostTypeBadge type={t.postType as PostType} />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t.domainTitle}
                </span>
                <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-accent-amber">
                  <Bookmark className="w-3 h-3" strokeWidth={2} />
                  {bookmarkedAgo(t.bookmarkedAt)}
                </span>
              </div>
              <Link
                to={`/forum/t/${t.slug}`}
                className="font-medium text-sm hover:text-primary"
              >
                {t.title}
              </Link>
              <div className="text-xs text-muted-foreground mt-0.5">
                @{t.authorUsername}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

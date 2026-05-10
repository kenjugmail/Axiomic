import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import { api } from "../lib/api";
import type { FeedItem, FollowSummary, PostType } from "@axiomic/types";
import { NewsCover } from "../components/news/NewsCover";
import { PostTypeBadge } from "../components/PostTypeBadge";
import { useAuthStore } from "../stores/auth";
import { EmptyState } from "../components/ui";
import { relativeTime } from "../lib/dates";

export function FeedPage() {
  const { user, loading: authLoading } = useAuthStore();
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [following, setFollowing] = useState<FollowSummary[]>([]);

  useEffect(() => {
    if (authLoading || !user) return;
    api.social
      .feed()
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
    api.social
      .follows(user.username)
      .then((r) => setFollowing(r.following))
      .catch(() => {});
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
          Sign in to see your feed.
        </p>
        <Link to="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Feed</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Articles and topics from people you follow, freshest first.
      </p>

      <div className="grid lg:grid-cols-[1fr_260px] gap-8">
        <div>
          {items === null ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 animate-pulse bg-muted rounded-xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nothing here yet."
              description="Follow people from any profile or article byline to fill this feed."
              cta={
                <Link
                  to="/news"
                  className="inline-flex items-center px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
                >
                  Browse news
                </Link>
              }
            />
          ) : (
            <ul className="space-y-3">
              {items.map((item, i) => (
                <li key={`${item.kind}-${item.slug}-${i}`}>
                  {item.kind === "news" ? (
                    <Link
                      to={`/news/${item.slug}`}
                      className="grid grid-cols-[120px_1fr] gap-4 rounded-xl overflow-hidden border border-border bg-card hover:bg-accent/20 transition-colors"
                    >
                      <NewsCover
                        emoji={item.coverEmoji}
                        accent={item.accentColor}
                        size="sm"
                      />
                      <div className="p-3 pr-4 min-w-0">
                        <div className="text-[10px] uppercase tracking-wider text-primary mb-1">
                          News
                        </div>
                        <h3 className="font-semibold text-sm line-clamp-2 leading-snug">
                          {item.title}
                        </h3>
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                          {item.summary}
                        </p>
                        <div className="text-[11px] text-muted-foreground mt-2">
                          @{item.authorUsername} · {relativeTime(item.createdAt)}
                        </div>
                      </div>
                    </Link>
                  ) : (
                    <Link
                      to={`/forum/t/${item.slug}`}
                      className="block rounded-xl border border-border bg-card hover:bg-accent/20 transition-colors p-4"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <PostTypeBadge type={item.postType as PostType} />
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {item.domainTitle}
                        </span>
                      </div>
                      <h3 className="font-semibold text-sm leading-snug">
                        {item.title}
                      </h3>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        @{item.authorUsername} · {relativeTime(item.createdAt)}
                      </div>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="space-y-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            People you follow
          </div>
          {following.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You're not following anyone yet.
            </p>
          ) : (
            <ul className="space-y-1">
              {following.map((u) => (
                <li key={u.username}>
                  <Link
                    to={`/profile/${u.username}`}
                    className="text-sm hover:text-primary"
                  >
                    @{u.username}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  api,
  type ForumDomain,
  type ForumTopicSummary,
  type PostType,
} from "../lib/api";
import { POST_TYPES } from "@axiomic/types";
import { PostTypeBadge } from "../components/PostTypeBadge";

export function ForumListPage() {
  const { domain: domainParam } = useParams<{ domain?: string }>();
  const [domains, setDomains] = useState<ForumDomain[]>([]);
  const [topics, setTopics] = useState<ForumTopicSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [postTypeFilter, setPostTypeFilter] = useState<PostType | "all">("all");
  const [sort, setSort] = useState<"active" | "new" | "top">("active");

  useEffect(() => {
    api.forum.domains().then((d) => setDomains(d.domains));
  }, []);

  useEffect(() => {
    setLoading(true);
    api.forum
      .listTopics({
        domain: domainParam,
        postType: postTypeFilter === "all" ? undefined : postTypeFilter,
        sort,
      })
      .then((d) => setTopics(d.topics))
      .finally(() => setLoading(false));
  }, [domainParam, postTypeFilter, sort]);

  const activeDomain = useMemo(
    () => domains.find((d) => d.slug === domainParam),
    [domains, domainParam]
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-baseline justify-between mb-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {activeDomain ? activeDomain.title : "Forum"}
        </h1>
        <Link
          to="/forum/new"
          className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        >
          New topic
        </Link>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        {activeDomain?.description ||
          "Structured discussion: claims, questions, derivations, critiques, syntheses, and predictions."}
      </p>

      {/* Domain switcher */}
      <div className="flex flex-wrap gap-1 mb-3 text-sm">
        <Link
          to="/forum"
          className={`px-3 py-1 rounded-md ${
            !domainParam
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          All domains
        </Link>
        {domains.map((d) => (
          <Link
            key={d.slug}
            to={`/forum/${d.slug}`}
            className={`px-3 py-1 rounded-md ${
              domainParam === d.slug
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {d.title}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-1 mb-4 text-sm border-t border-border pt-3">
        <span className="px-2 py-1 text-muted-foreground text-xs uppercase tracking-wider">
          Type
        </span>
        <button
          onClick={() => setPostTypeFilter("all")}
          className={`px-2 py-1 rounded-md text-xs ${
            postTypeFilter === "all"
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          all
        </button>
        {POST_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setPostTypeFilter(t)}
            className={`px-2 py-1 rounded-md text-xs capitalize ${
              postTypeFilter === t
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
        <span className="ml-auto flex gap-1">
          {(["active", "new", "top"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`px-2 py-1 rounded-md text-xs capitalize ${
                sort === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </span>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 animate-pulse bg-muted rounded-lg" />
          ))}
        </div>
      ) : topics.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">
          No topics yet.{" "}
          <Link to="/forum/new" className="text-primary hover:underline">
            Start one.
          </Link>
        </p>
      ) : (
        <ul className="space-y-2">
          {topics.map((t) => (
            <li
              key={t.id}
              className="border border-border rounded-lg p-4 hover:bg-accent/30 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center min-w-12 text-muted-foreground">
                  <span className="text-lg font-semibold text-foreground">
                    {t.score}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider">
                    score
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <PostTypeBadge type={t.postType as PostType} />
                    {!domainParam && (
                      <Link
                        to={`/forum/${t.domainSlug}`}
                        className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                      >
                        {t.domainTitle}
                      </Link>
                    )}
                    {t.wikiPageSlug && (
                      <Link
                        to={`/wiki/${t.wikiPageSlug}`}
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                        title="Linked wiki page"
                      >
                        ↳ {t.wikiPageTitle}
                      </Link>
                    )}
                  </div>
                  <Link
                    to={`/forum/t/${t.slug}`}
                    className="font-medium hover:text-primary transition-colors block"
                  >
                    {t.title}
                  </Link>
                  <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                    <Link
                      to={`/profile/${t.authorUsername}`}
                      className="hover:text-foreground"
                    >
                      @{t.authorUsername}
                    </Link>
                    <span>{t.postCount} replies</span>
                    <span>·</span>
                    <span title={t.lastActivityAt}>
                      active {timeAgo(t.lastActivityAt)}
                    </span>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso.replace(" ", "T") + "Z").getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { NewsArticle, NewsReactionKind } from "@axiomic/types";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { AiArticleHelpers } from "../components/news/AiArticleHelpers";
import { ArticleTOC } from "../components/news/ArticleTOC";
import { NewsComments } from "../components/news/NewsComments";
import { NewsCover } from "../components/news/NewsCover";
import { RelatedNewsRail } from "../components/news/RelatedNewsRail";
import { BookmarkButton } from "../components/social/BookmarkButton";
import { ReactionStrip } from "../components/social/ReactionStrip";
import { useLiveEvents } from "../hooks/useLiveEvents";
import { useAuthStore } from "../stores/auth";

function relativeDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function NewsArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const user = useAuthStore((s) => s.user);
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reacting, setReacting] = useState(false);
  const [bookmarking, setBookmarking] = useState(false);

  useEffect(() => {
    if (!slug) return;
    api.news
      .get(slug)
      .then((r) => setArticle(r.article))
      .catch((e) => setError(e?.message ?? "Failed to load article"));
  }, [slug]);

  // Subscribe to live reaction updates for this article. Other people's
  // reactions land instantly without a refresh.
  useLiveEvents({
    articleSlugs: slug ? [slug] : [],
    onEvent: (e) => {
      if (e.kind !== "reaction_update") return;
      if (!article || e.articleSlug !== article.slug) return;
      setArticle({ ...article, reactionCounts: e.reactionCounts });
    },
  });

  const handleReact = async (kind: NewsReactionKind) => {
    if (!user || !slug || !article || reacting) return;
    setReacting(true);
    try {
      const next = await api.news.react(slug, kind);
      setArticle({
        ...article,
        reactionCounts: next.reactionCounts,
        myReactions: next.myReactions,
      });
    } finally {
      setReacting(false);
    }
  };

  const handleBookmark = async () => {
    if (!user || !slug || !article || bookmarking) return;
    setBookmarking(true);
    try {
      const next = await api.news.toggleBookmark(slug);
      setArticle({ ...article, myBookmark: next.bookmarked });
    } finally {
      setBookmarking(false);
    }
  };

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="text-xl font-semibold mb-2">Article not found</h1>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Link to="/news" className="text-primary hover:underline">
          Back to news
        </Link>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="h-56 animate-pulse bg-muted rounded-xl mb-6" />
        <div className="space-y-3">
          <div className="h-8 animate-pulse bg-muted rounded w-2/3" />
          <div className="h-4 animate-pulse bg-muted rounded w-1/2" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 grid xl:grid-cols-[1fr_220px] gap-10">
      <div className="max-w-3xl min-w-0">
      <Link
        to="/news"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; All news
      </Link>

      <div className="mt-4 rounded-xl overflow-hidden border border-border">
        <NewsCover
          emoji={article.coverEmoji}
          accent={article.accentColor}
          size="lg"
        />
      </div>

      <h1 className="text-4xl font-bold mt-6 leading-tight">{article.title}</h1>
      {article.summary && (
        <p className="text-lg text-muted-foreground mt-3 leading-relaxed">
          {article.summary}
        </p>
      )}

      <div className="flex items-center gap-3 text-sm text-muted-foreground mt-5 flex-wrap">
        <span>
          By{" "}
          <Link
            to={`/profile/${article.authorUsername}`}
            className="font-medium text-foreground hover:underline"
          >
            {article.authorDisplayName || article.authorUsername}
          </Link>
          {article.coauthors.length > 0 && (
            <>
              {" with "}
              {article.coauthors.map((co, i) => (
                <span key={co}>
                  {i > 0 && ", "}
                  <Link
                    to={`/profile/${co}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {co}
                  </Link>
                </span>
              ))}
            </>
          )}
        </span>
        <span>·</span>
        <span>{relativeDate(article.createdAt)}</span>
        <span>·</span>
        <span>{article.readingMinutes} min read</span>
        {article.lastEditorUsername &&
          article.lastEditorUsername !== article.authorUsername && (
            <>
              <span>·</span>
              <span>
                last edited by{" "}
                <Link
                  to={`/profile/${article.lastEditorUsername}`}
                  className="text-foreground hover:underline"
                >
                  @{article.lastEditorUsername}
                </Link>
              </span>
            </>
          )}
      </div>

      {/* Author actions: edit + review pending proposals. */}
      {article.isAuthor && (
        <div className="flex items-center gap-2 mt-4">
          <Link
            to={`/news/${article.slug}/edit`}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
          >
            Edit
          </Link>
          <Link
            to={`/news/${article.slug}/proposals`}
            className={`text-xs px-3 py-1.5 rounded-md border ${
              article.pendingProposalCount > 0
                ? "border-primary/40 bg-primary/5 text-primary"
                : "border-border"
            } hover:bg-accent/40`}
          >
            {article.pendingProposalCount > 0
              ? `Review ${article.pendingProposalCount} pending edit${article.pendingProposalCount === 1 ? "" : "s"}`
              : "Review proposals"}
          </Link>
        </div>
      )}

      {!article.isAuthor && user && (
        <div className="mt-4">
          <Link
            to={`/news/${article.slug}/propose`}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 inline-block"
          >
            Suggest an edit
          </Link>
        </div>
      )}

      {/* AI helpers — TL;DR + explain-simpler shortcuts. Render above
          the article body so a reader can decide whether to dive in. */}
      {slug && <AiArticleHelpers articleSlug={slug} />}

      {/* Optional abstract — research-paper style, lives above body. */}
      {article.abstract && (
        <div className="mt-8 rounded-xl border border-border bg-muted/30 p-5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Abstract
          </div>
          <div className="prose-sm max-w-none [&_p]:text-sm [&_p]:leading-relaxed">
            <MarkdownRenderer content={article.abstract} />
          </div>
        </div>
      )}

      {/* Body. Trusted markdown — viz directives render inline. */}
      <article className="mt-8 prose-sm max-w-none">
        <MarkdownRenderer content={article.body} />
      </article>

      {/* Numbered references list. Each entry is a one-liner with an
          optional link. Body uses [1], [2] markers. */}
      {article.references.length > 0 && (
        <section className="mt-10 pt-6 border-t border-border">
          <h2 className="text-base font-semibold mb-3">References</h2>
          <ol className="space-y-1.5 text-sm">
            {article.references.map((r, i) => (
              <li key={r.label ?? String(i + 1)} className="flex gap-2">
                <span className="text-muted-foreground tabular-nums">[{r.label ?? i + 1}]</span>
                <span className="flex-1">
                  {r.text}
                  {r.url && (
                    <>
                      {" "}
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline break-all"
                      >
                        {r.url}
                      </a>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Reactions + bookmark */}
      <div className="mt-10 pt-6 border-t border-border flex flex-wrap items-center justify-between gap-3">
        <ReactionStrip
          signedIn={!!user}
          reactionCounts={article.reactionCounts}
          myReactions={article.myReactions}
          onReact={handleReact}
          pending={reacting}
        />
        {user && (
          <BookmarkButton
            bookmarked={article.myBookmark}
            onToggle={handleBookmark}
            pending={bookmarking}
          />
        )}
      </div>

      {slug && <NewsComments articleSlug={slug} />}
      {slug && <RelatedNewsRail articleSlug={slug} />}
      </div>
      <ArticleTOC body={article.body} />
    </div>
  );
}

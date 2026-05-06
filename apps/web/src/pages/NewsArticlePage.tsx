import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { NewsArticle, NewsReactionKind } from "@axiomic/types";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { AiArticleHelpers } from "../components/news/AiArticleHelpers";
import { NewsComments } from "../components/news/NewsComments";
import { NewsCover } from "../components/news/NewsCover";
import { RelatedNewsRail } from "../components/news/RelatedNewsRail";
import { BookmarkButton } from "../components/social/BookmarkButton";
import { ReactionStrip } from "../components/social/ReactionStrip";
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
    <div className="max-w-3xl mx-auto px-4 py-8">
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
        <Link
          to={`/profile/${article.authorUsername}`}
          className="hover:text-foreground"
        >
          By{" "}
          <span className="font-medium text-foreground">
            {article.authorDisplayName || article.authorUsername}
          </span>
        </Link>
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

      {/* Body. Trusted markdown — viz directives render inline. */}
      <article className="mt-8 prose-sm max-w-none">
        <MarkdownRenderer content={article.body} />
      </article>

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
  );
}

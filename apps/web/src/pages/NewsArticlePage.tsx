import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, GraduationCap, MessageSquare } from "lucide-react";
import { api } from "../lib/api";
import { Skeleton } from "../components/ui";
import type {
  ClaimThread,
  NewsArticle,
  NewsReactionKind,
} from "@axiomic/types";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { TutorMount } from "../components/ai/TutorMount";
import { SelectionPopover } from "../components/SelectionPopover";
import { askTutorAction } from "../components/ai/askTutorAction";
import { MessageSquarePlus } from "lucide-react";
import { AiArticleHelpers } from "../components/news/AiArticleHelpers";
import { ArticleTOC } from "../components/news/ArticleTOC";
import { ArtifactsSection } from "../components/news/ArtifactsSection";
import { RelatedRail } from "../components/cross/RelatedRail";
import { ClaimThreadPanel } from "../components/news/ClaimThreadPanel";
import { LessonFromArticleDialog } from "../components/news/LessonFromArticleDialog";
import { NewsComments } from "../components/news/NewsComments";
import { NewsCover } from "../components/news/NewsCover";
import { RelatedNewsRail } from "../components/news/RelatedNewsRail";
import { ReproduceDialog } from "../components/news/ReproduceDialog";
import { ReproductionsBadge } from "../components/news/ReproductionsBadge";
import { BookmarkButton } from "../components/social/BookmarkButton";
import { ReactionStrip } from "../components/social/ReactionStrip";
import { useLiveEvents } from "../hooks/useLiveEvents";
import { useAuthStore } from "../stores/auth";
import { findTextQuote, type TextQuote } from "../lib/textQuote";

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
  const [lessonDialogOpen, setLessonDialogOpen] = useState(false);
  const [reproDialogOpen, setReproDialogOpen] = useState(false);
  const [threads, setThreads] = useState<ClaimThread[]>([]);
  const [pendingThreadQuote, setPendingThreadQuote] =
    useState<TextQuote | null>(null);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const articleBodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    api.news
      .get(slug)
      .then((r) => {
        if (!cancelled) setArticle(r.article);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? "Failed to load article");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Load claim threads for this article. We do this in a separate
  // request so the article paint isn't blocked on the threads query.
  const refreshThreads = () => {
    if (!slug) return;
    api.news
      .listClaimThreads(slug)
      .then((r) => setThreads(r.threads))
      .catch(() => {
        // Don't surface a hard error here — the article still renders
        // fine without threads loaded.
      });
  };

  useEffect(() => {
    refreshThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Resolve each thread's text-quote to a Range in the rendered article
  // and register the ranges with the CSS Highlight API. Falls back to
  // no-op when the API isn't supported (degrades to sidebar-only navigation).
  // Anchor-lost threads are tracked so the panel can show a note.
  const [anchorLostIds, setAnchorLostIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const root = articleBodyRef.current;
    if (!root || threads.length === 0 || !article) return;

    const ranges: Range[] = [];
    const lost = new Set<string>();
    for (const t of threads) {
      const r = findTextQuote(root, {
        exact: t.exact,
        prefix: t.prefix,
        suffix: t.suffix,
      });
      if (r) ranges.push(r);
      else lost.add(t.id);
    }
    setAnchorLostIds(lost);

    // CSS Highlight API: subtle yellow underline. Browsers without
    // support skip silently — sidebar list still surfaces the threads.
    const supported =
      typeof (window as any).CSS !== "undefined" &&
      "highlights" in (window as any).CSS &&
      typeof (window as any).Highlight === "function";
    if (!supported) return;
    try {
      const h = new (window as any).Highlight(...ranges);
      (window as any).CSS.highlights.set("claim-thread", h);
    } catch {
      // Defensive — some browsers throw on duplicate registrations.
    }
    return () => {
      try {
        (window as any).CSS.highlights.delete("claim-thread");
      } catch {}
    };
  }, [threads, article]);

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
        <Skeleton variant="card" className="h-56 mb-6" />
        <div className="space-y-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 grid xl:grid-cols-[1fr_220px] gap-10">
      <div className="max-w-2xl min-w-0">
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

      <h1 className="font-display text-4xl sm:text-5xl font-semibold mt-6 leading-[1.1] tracking-tight">
        {article.title}
      </h1>
      {article.summary && (
        <p className="text-lg text-muted-foreground mt-4 leading-relaxed">
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
        {slug && article.reproStats.total > 0 && (
          <>
            <span>·</span>
            <ReproductionsBadge articleSlug={slug} stats={article.reproStats} />
          </>
        )}
      </div>

      {/* Author actions: edit + review pending proposals + turn into lesson. */}
      {article.isAuthor && (
        <div className="flex items-center gap-2 mt-4 flex-wrap">
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
          {article.status === "published" && (
            <button
              onClick={() => setLessonDialogOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-primary/40 text-primary hover:bg-primary/10"
              title="Generate a Brilliant-style lesson from this article"
            >
              <GraduationCap className="w-3.5 h-3.5" strokeWidth={2} />
              {article.derivedLesson ? "Regenerate lesson" : "Turn into lesson"}
            </button>
          )}
        </div>
      )}

      {/* Lesson-available badge: visible to everyone once a lesson has
          been derived. Author sees it too — confirms the link is live. */}
      {article.derivedLesson && (
        <div className="mt-4">
          <Link
            to={`/paths/${article.derivedLesson.pathSlug}/lessons/${article.derivedLesson.nodeSlug}`}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
          >
            <GraduationCap className="w-3.5 h-3.5" strokeWidth={2} />
            Lesson available — practice the concepts
          </Link>
        </div>
      )}

      {lessonDialogOpen && (
        <LessonFromArticleDialog
          articleSlug={article.slug}
          articleTitle={article.title}
          onClose={() => setLessonDialogOpen(false)}
        />
      )}

      {reproDialogOpen && slug && (
        <ReproduceDialog
          articleSlug={slug}
          artifacts={article.artifacts}
          onClose={() => setReproDialogOpen(false)}
          onSubmitted={async () => {
            setReproDialogOpen(false);
            // Re-fetch the article to refresh the badge + mine flag.
            try {
              const fresh = await api.news.get(slug);
              setArticle(fresh.article);
            } catch {
              // ignore
            }
          }}
        />
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
        <div className="mt-8 border-l-4 border-primary/40 pl-6 py-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Abstract
          </div>
          <div className="prose-sm max-w-none italic [&_p]:text-base [&_p]:leading-relaxed [&_p]:text-foreground/85">
            <MarkdownRenderer content={article.abstract} />
          </div>
        </div>
      )}

      {/* Body. Trusted markdown — viz directives render inline. */}
      <article ref={articleBodyRef} className="mt-8 prose-sm max-w-none">
        <MarkdownRenderer
          content={article.body}
          codeKernelKey={`article:${article.slug}`}
          codeAuthorUsername={article.authorUsername}
          codeViewerUsername={user?.username ?? null}
          numberFigures
          linkCitations={article.references.length > 0}
        />
      </article>

      {/* Numbered references list. Each entry is a one-liner with an
          optional link. Body uses [1], [2] markers. */}
      {article.references.length > 0 && (
        <section className="mt-12 pt-6 border-t border-border">
          <h2 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
            References
          </h2>
          <ol className="space-y-2 text-sm">
            {article.references.map((r, i) => (
              <li
                key={r.label ?? String(i + 1)}
                id={`ref-${r.label ?? i + 1}`}
                className="grid grid-cols-[2.5rem_1fr] gap-1 leading-relaxed scroll-mt-20"
              >
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  [{r.label ?? i + 1}]
                </span>
                <span>
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

      {/* Sprint 15 — runnable artifacts + reproduce CTA. Section hides
          itself for anonymous viewers when there's nothing attached. */}
      {slug && (
        <ArtifactsSection
          articleSlug={slug}
          initialArtifacts={article.artifacts}
          canEdit={article.isAuthor}
          onChange={(artifacts) => setArticle({ ...article, artifacts })}
        />
      )}

      {/* Sprint 16 — wiki concepts referenced in the body. Hides itself
          when there are no `[[slug]]` mentions. */}
      <RelatedRail
        title="Background concepts"
        icon="wiki"
        items={(article.relatedWikiPages ?? []).map((w) => ({
          kind: "wiki" as const,
          ...w,
        }))}
        emptyHint={null}
      />

      {user && !article.isAuthor && (
        <div className="mt-6">
          {article.reproStats.mine ? (
            <p className="text-xs text-muted-foreground italic">
              ✓ You've already filed a reproduction receipt for this article.
            </p>
          ) : (
            <button
              onClick={() => setReproDialogOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
              title="File a reproduction receipt for this article"
            >
              <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />
              I reproduced this
            </button>
          )}
        </div>
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

      {threads.length > 0 && (
        <section className="mt-10 pt-6 border-t border-border">
          <h2 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
            <MessageSquare className="w-3 h-3" strokeWidth={2} />
            Claim threads · {threads.length}
          </h2>
          <ul className="space-y-1.5 text-sm">
            {threads.map((t) => {
              const lost = anchorLostIds.has(t.id);
              return (
                <li key={t.id}>
                  <button
                    onClick={() => {
                      setOpenThreadId(t.id);
                      // Scroll the matching range into view + flash it.
                      const root = articleBodyRef.current;
                      if (root) {
                        const r = findTextQuote(root, {
                          exact: t.exact,
                          prefix: t.prefix,
                          suffix: t.suffix,
                        });
                        if (r) {
                          const anchorNode =
                            r.startContainer.parentElement ?? null;
                          if (anchorNode) {
                            anchorNode.scrollIntoView({
                              behavior: "smooth",
                              block: "center",
                            });
                            anchorNode.classList.add("claim-flash");
                            setTimeout(
                              () =>
                                anchorNode.classList.remove("claim-flash"),
                              900,
                            );
                          }
                        }
                      }
                    }}
                    className="w-full text-left px-3 py-2 rounded-md border border-border hover:bg-accent/40 transition-colors duration-fast"
                  >
                    <div className="flex items-baseline gap-2 text-xs text-muted-foreground mb-0.5">
                      <span className="text-foreground font-medium">
                        @{t.authorUsername}
                      </span>
                      <span>· {t.replies.length} repl{t.replies.length === 1 ? "y" : "ies"}</span>
                      {lost && (
                        <span className="text-amber-600 dark:text-amber-400">
                          · anchor lost
                        </span>
                      )}
                    </div>
                    <div className="italic text-foreground/80 line-clamp-2">
                      “{t.exact}”
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {slug && <NewsComments articleSlug={slug} />}
      {slug && <RelatedNewsRail articleSlug={slug} />}
      </div>
      <ArticleTOC body={article.body} />

      {/* Sprint 64b-6 — unified selection popover. Renders BOTH
          "Discuss this claim" + "Ask tutor" actions on the same
          popover; previously two competing popovers stacked at the
          same position. */}
      {slug && (
        <SelectionPopover
          rootRef={articleBodyRef}
          actions={[
            {
              id: "discuss-claim",
              icon: <MessageSquarePlus className="w-3.5 h-3.5" strokeWidth={2} />,
              label: "Discuss this claim",
              enabled: !!user,
              onSelect: (quote) => setPendingThreadQuote(quote),
            },
            {
              ...askTutorAction({ sourcePageSlug: article.slug }),
              enabled: !!user,
            },
          ]}
        />
      )}

      {pendingThreadQuote && slug && (
        <ClaimThreadPanel
          mode="create"
          exact={pendingThreadQuote.exact}
          onClose={() => setPendingThreadQuote(null)}
          onSubmit={async (body) => {
            await api.news.createClaimThread(slug, {
              exact: pendingThreadQuote.exact,
              prefix: pendingThreadQuote.prefix,
              suffix: pendingThreadQuote.suffix,
              body,
            });
            setPendingThreadQuote(null);
            // Clear browser selection so the popover doesn't immediately
            // re-appear over the same range.
            window.getSelection()?.removeAllRanges();
            refreshThreads();
          }}
        />
      )}

      {openThreadId && slug && (() => {
        const t = threads.find((x) => x.id === openThreadId);
        if (!t) return null;
        return (
          <ClaimThreadPanel
            mode="view"
            thread={t}
            anchorLost={anchorLostIds.has(t.id)}
            onClose={() => setOpenThreadId(null)}
            onSubmitReply={async (content) => {
              await api.news.replyToClaimThread(slug, t.id, { content });
              refreshThreads();
            }}
          />
        );
      })()}

      {/* Sprint 63h — AI tutor mount. Selection-to-chat is disabled
          here because ClaimSelectionPopover already owns selection on
          this surface; unifying the two popovers is a follow-up. */}
      <TutorMount pageSlug={article.slug} pageTitle={article.title} tier="news" />
    </div>
  );
}

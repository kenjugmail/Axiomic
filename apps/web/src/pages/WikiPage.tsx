import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  api,
  type WikiPage as WikiPageType,
  type PageVersion,
  type ForumTopicSummary,
  type PostType,
} from "../lib/api";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { TableOfContents } from "../components/TableOfContents";
import { TierSwitcher } from "../components/TierSwitcher";
import { AISidebar } from "../components/AISidebar";
import { Comments } from "../components/Comments";
import { FlashcardViewer } from "../components/FlashcardViewer";
import { PostTypeBadge } from "../components/PostTypeBadge";
import { useAuthStore } from "../stores/auth";

export function WikiPage() {
  const { slug } = useParams<{ slug: string }>();
  const user = useAuthStore((s) => s.user);
  const [page, setPage] = useState<WikiPageType | null>(null);
  const [content, setContent] = useState("");
  const [allContent, setAllContent] = useState<Record<string, string>>({});
  const [versions, setVersions] = useState<PageVersion[]>([]);
  const [tier, setTier] = useState("intro");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [flashcardsOpen, setFlashcardsOpen] = useState(false);
  const [relatedPages, setRelatedPages] = useState<WikiPageType[]>([]);
  const [discussions, setDiscussions] = useState<ForumTopicSummary[]>([]);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError("");

    api.wiki
      .get(slug, tier)
      .then((data: any) => {
        setPage(data.page);
        setContent(data.content);
        setAllContent(data.allContent || {});
        setVersions(data.versions || []);
        // linkedTopics is bundled with the page response now; falls back
        // to a separate fetch if the field isn't present (e.g., older
        // server). Keeps backward compatibility cheap.
        if (Array.isArray(data.linkedTopics)) {
          setDiscussions(data.linkedTopics);
        } else if (data.page?.id) {
          api.forum
            .listTopics({ wikiPageId: data.page.id, sort: "active" })
            .then((d) => setDiscussions(d.topics))
            .catch(() => {});
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    // Load related pages
    api.ai.relatedPages(slug).then((data) => setRelatedPages(data.pages)).catch(() => {});
  }, [slug]);

  const handleTierChange = (newTier: string) => {
    setTier(newTier);
    const tierContent = allContent[newTier];
    if (tierContent) {
      setContent(tierContent);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-4 bg-muted rounded w-2/3" />
          <div className="h-4 bg-muted rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold mb-4">Page not found</h1>
        <p className="text-muted-foreground mb-6">{error || "This wiki page doesn't exist."}</p>
        <Link to="/wiki" className="text-primary hover:underline">Browse all pages</Link>
      </div>
    );
  }

  return (
    <div className={`max-w-7xl mx-auto px-4 py-8 ${aiOpen ? "lg:mr-96" : ""}`}>
      <div className="flex gap-8">
        {/* Main content */}
        <article className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <div className="text-sm text-muted-foreground mb-1">
                <Link to="/wiki" className="hover:text-foreground">Wiki</Link>
                <span className="mx-1">/</span>
                <Link to={`/wiki?category=${page.category}`} className="hover:text-foreground capitalize">
                  {page.category}
                </Link>
              </div>
              <h1 className="text-3xl font-bold">{page.title}</h1>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <TierSwitcher tier={tier} onTierChange={handleTierChange} />
              {user && (
                <Link
                  to={`/wiki/${slug}/edit`}
                  className="p-2 rounded-lg border border-border hover:bg-accent transition-colors"
                  title="Edit page"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </Link>
              )}
              <button
                onClick={() => setAiOpen(!aiOpen)}
                className={`p-2 rounded-lg border transition-colors ${
                  aiOpen ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"
                }`}
                title="AI Tutor"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </button>
              <button
                onClick={() => setFlashcardsOpen(true)}
                className="p-2 rounded-lg border border-border hover:bg-accent transition-colors"
                title="Flashcards"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </button>
            </div>
          </div>

          <MarkdownRenderer content={content} />

          {/* Related pages */}
          {relatedPages.length > 0 && (
            <div className="mt-8 p-4 rounded-lg bg-muted/50 border border-border">
              <h3 className="text-sm font-semibold mb-2">Related Topics</h3>
              <div className="flex flex-wrap gap-2">
                {relatedPages.map((p) => (
                  <Link
                    key={p.id}
                    to={`/wiki/${p.slug}`}
                    className="px-3 py-1 rounded-full text-sm bg-background border border-border hover:bg-accent transition-colors"
                  >
                    {p.title}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Version history */}
          <div className="mt-8 border-t border-border pt-4">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {showHistory ? "Hide" : "Show"} version history ({versions.length})
            </button>
            {showHistory && (
              <div className="mt-3 space-y-2">
                {versions.map((v) => {
                  const isCurrent = page && v.version === page.currentVersion;
                  return (
                    <div
                      key={v.id}
                      className="flex items-center justify-between gap-3 text-sm text-muted-foreground"
                    >
                      <div>
                        <span className="font-mono">v{v.version}</span> — {v.editMessage || "No message"}{" "}
                        <span className="text-xs">({new Date(v.createdAt).toLocaleDateString()})</span>
                      </div>
                      {user && !isCurrent && (
                        <button
                          onClick={async () => {
                            if (!slug) return;
                            if (!confirm(`Restore content from v${v.version}? A new version will be created.`)) return;
                            try {
                              await api.wiki.restore(slug, v.version);
                              // Re-fetch the page so the restored content shows.
                              const data: any = await api.wiki.get(slug, tier);
                              setPage(data.page);
                              setContent(data.content);
                              setAllContent(data.allContent || {});
                              setVersions(data.versions || []);
                            } catch (err: any) {
                              alert(err?.message ?? "Restore failed");
                            }
                          }}
                          className="text-xs px-2 py-0.5 rounded border border-border hover:bg-accent/40"
                        >
                          Restore
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Forum discussions anchored to this page */}
          <div className="mt-8 border-t border-border pt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Discussions</h3>
              <Link
                to={`/forum/new?wikiPageId=${page.id}&wikiPageSlug=${page.slug}`}
                className="text-xs px-3 py-1 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80"
              >
                Start a discussion
              </Link>
            </div>
            {discussions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No threads yet. Be the first to make a claim, ask a question, or critique an argument here.
              </p>
            ) : (
              <ul className="space-y-2">
                {discussions.map((t) => (
                  <li key={t.id} className="border border-border rounded-md p-3 hover:bg-accent/30 transition-colors">
                    <div className="flex items-center gap-2 mb-1">
                      <PostTypeBadge type={t.postType as PostType} />
                      <Link
                        to={`/forum/t/${t.slug}`}
                        className="font-medium hover:text-primary text-sm"
                      >
                        {t.title}
                      </Link>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      @{t.authorUsername} · {t.postCount} replies · score {t.score}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Comments */}
          <Comments pageId={page.id} />
        </article>

        {/* Sidebar */}
        <aside className="hidden lg:block w-56 shrink-0">
          <TableOfContents content={content} />
        </aside>
      </div>

      {/* AI Sidebar */}
      <AISidebar
        pageSlug={page.slug}
        pageTitle={page.title}
        tier={tier}
        isOpen={aiOpen}
        onClose={() => setAiOpen(false)}
      />

      {/* Flashcard viewer */}
      <FlashcardViewer
        pageSlug={page.slug}
        pageTitle={page.title}
        tier={tier}
        isOpen={flashcardsOpen}
        onClose={() => setFlashcardsOpen(false)}
      />
    </div>
  );
}

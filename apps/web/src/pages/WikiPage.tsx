import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Layers, MessageSquare, Pencil } from "lucide-react";
import {
  api,
  type WikiPage as WikiPageType,
  type PageVersion,
  type ForumTopicSummary,
  type PostType,
} from "../lib/api";
import type {
  LinkedNodeSummary,
  LinkedArticleSummary,
} from "@axiomic/types";
import { RelatedRail } from "../components/cross/RelatedRail";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { PracticePanel } from "../components/wiki/PracticePanel";
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
  const [linkedNodes, setLinkedNodes] = useState<LinkedNodeSummary[]>([]);
  const [linkedArticles, setLinkedArticles] = useState<LinkedArticleSummary[]>(
    [],
  );

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
        // Sprint 16 — Practice / Articles cross-link rails. Both arrive
        // bundled; missing fields just hide their rail.
        setLinkedNodes(
          Array.isArray(data.linkedNodes) ? data.linkedNodes : [],
        );
        setLinkedArticles(
          Array.isArray(data.linkedArticles) ? data.linkedArticles : [],
        );
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
              <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
                {page.title}
              </h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <TierSwitcher tier={tier} onTierChange={handleTierChange} />
              {user && (
                <Link
                  to={`/wiki/${slug}/edit`}
                  className="p-2 rounded-md border border-border hover:bg-accent/40 transition-colors duration-fast"
                  title="Edit page"
                  aria-label="Edit page"
                >
                  <Pencil className="w-4 h-4" strokeWidth={2} />
                </Link>
              )}
              <button
                onClick={() => setAiOpen(!aiOpen)}
                className={`p-2 rounded-md border transition-colors duration-fast ${
                  aiOpen
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-accent/40"
                }`}
                title="AI Tutor"
                aria-label="AI Tutor"
              >
                <MessageSquare className="w-4 h-4" strokeWidth={2} />
              </button>
              <button
                onClick={() => setFlashcardsOpen(true)}
                className="p-2 rounded-md border border-border hover:bg-accent/40 transition-colors duration-fast"
                title="Flashcards"
                aria-label="Flashcards"
              >
                <Layers className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>
          </div>

          <MarkdownRenderer
            content={content}
            codeKernelKey={slug ? `wiki:${slug}` : null}
          />

          {/* Quiz me on this page (AI). */}
          {slug && <PracticePanel pageSlug={slug} tier={tier} />}

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

          {/* Sprint 16 — flywheel cross-link rails: which nodes teach
              this concept, which articles cite it. Both sit between the
              existing version history and the discussions list, so the
              reader sees "practice this" and "articles citing this" at
              the same scroll depth as forum threads. Empty rails hide
              themselves; first-load author can leave them empty without
              clutter. */}
          <RelatedRail
            title="Practice this"
            icon="lesson"
            items={linkedNodes.map((n) => ({ kind: "node" as const, ...n }))}
            emptyHint={null}
          />
          <RelatedRail
            title="Articles citing this concept"
            icon="article"
            items={linkedArticles.map((a) => ({
              kind: "article" as const,
              ...a,
            }))}
            emptyHint={null}
          />

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

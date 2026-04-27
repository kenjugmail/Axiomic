import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, type WikiPage as WikiPageType, type PageVersion } from "../lib/api";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { TableOfContents } from "../components/TableOfContents";
import { TierSwitcher } from "../components/TierSwitcher";
import { AISidebar } from "../components/AISidebar";
import { Comments } from "../components/Comments";
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
  const [relatedPages, setRelatedPages] = useState<WikiPageType[]>([]);

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
    <div className={`max-w-7xl mx-auto px-4 py-8 ${aiOpen ? "mr-96" : ""}`}>
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
                {versions.map((v) => (
                  <div key={v.id} className="text-sm text-muted-foreground">
                    <span className="font-mono">v{v.version}</span> — {v.editMessage || "No message"}{" "}
                    <span className="text-xs">({new Date(v.createdAt).toLocaleDateString()})</span>
                  </div>
                ))}
              </div>
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
    </div>
  );
}

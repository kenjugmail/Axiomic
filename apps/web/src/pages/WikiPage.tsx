import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, type WikiPage as WikiPageType, type PageVersion } from "../lib/api";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { TableOfContents } from "../components/TableOfContents";
import { TierSwitcher } from "../components/TierSwitcher";

export function WikiPage() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<WikiPageType | null>(null);
  const [content, setContent] = useState("");
  const [allContent, setAllContent] = useState<Record<string, string>>({});
  const [versions, setVersions] = useState<PageVersion[]>([]);
  const [tier, setTier] = useState("intro");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);

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
          <div className="h-4 bg-muted rounded w-3/4" />
        </div>
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold mb-4">Page not found</h1>
        <p className="text-muted-foreground mb-6">{error || "This wiki page doesn't exist."}</p>
        <Link to="/wiki" className="text-primary hover:underline">
          Browse all pages
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
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
            <TierSwitcher tier={tier} onTierChange={handleTierChange} />
          </div>

          <MarkdownRenderer content={content} />

          {/* Version history */}
          <div className="mt-12 border-t border-border pt-6">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {showHistory ? "Hide" : "Show"} version history ({versions.length} version{versions.length !== 1 ? "s" : ""})
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
        </article>

        {/* Sidebar: Table of Contents */}
        <aside className="hidden lg:block w-56 shrink-0">
          <TableOfContents content={content} />
        </aside>
      </div>
    </div>
  );
}

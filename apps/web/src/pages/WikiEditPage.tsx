import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { useAuthStore } from "../stores/auth";

export function WikiEditPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pageTitle, setPageTitle] = useState("");
  const [activeTier, setActiveTier] = useState<"intro" | "undergrad" | "grad">("intro");
  const [content, setContent] = useState({ intro: "", undergrad: "", grad: "" });
  const [editMessage, setEditMessage] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!slug) return;
    api.wiki.get(slug).then((data: any) => {
      setPageTitle(data.page.title);
      setContent({
        intro: data.allContent.intro || "",
        undergrad: data.allContent.undergrad || "",
        grad: data.allContent.grad || "",
      });
      setLoading(false);
    }).catch(() => {
      setError("Page not found");
      setLoading(false);
    });
  }, [slug]);

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground mb-4">You need to be signed in to edit pages.</p>
        <Link to="/login" className="text-primary hover:underline">Sign in</Link>
      </div>
    );
  }

  const handleSave = async () => {
    if (!slug) return;
    setSaving(true);
    setError("");
    try {
      await api.wiki.update(slug, {
        contentIntro: content.intro,
        contentUndergrad: content.undergrad,
        contentGrad: content.grad,
        editMessage: editMessage || `Edit by ${user.username}`,
      });
      navigate(`/wiki/${slug}`);
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="max-w-4xl mx-auto px-4 py-12"><div className="animate-pulse h-64 bg-muted rounded-lg" /></div>;
  }

  const tiers = [
    { key: "intro" as const, label: "Intro" },
    { key: "undergrad" as const, label: "Undergrad" },
    { key: "grad" as const, label: "Graduate" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link to={`/wiki/${slug}`} className="text-sm text-muted-foreground hover:text-foreground">&larr; Back to page</Link>
          <h1 className="text-2xl font-bold mt-1">Editing: {pageTitle}</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={`px-3 py-1.5 rounded-md text-sm ${showPreview ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
          >
            {showPreview ? "Editor" : "Preview"}
          </button>
          <input
            value={editMessage}
            onChange={(e) => setEditMessage(e.target.value)}
            placeholder="Edit message..."
            className="px-3 py-1.5 rounded-md border border-input bg-background text-sm w-48 focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}

      {/* Tier tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted mb-4 w-fit">
        {tiers.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTier(t.key)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTier === t.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Editor / Preview */}
      {showPreview ? (
        <div className="min-h-[500px] p-6 rounded-lg border border-border bg-card">
          <MarkdownRenderer content={content[activeTier]} />
        </div>
      ) : (
        <textarea
          value={content[activeTier]}
          onChange={(e) => setContent({ ...content, [activeTier]: e.target.value })}
          className="w-full min-h-[500px] p-4 rounded-lg border border-input bg-background font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder={`Write ${activeTier} tier content in Markdown...\n\nSupported: **bold**, *italic*, $LaTeX$, \`\`\`code\`\`\`, [links](/wiki/slug), ::viz[name]`}
        />
      )}
    </div>
  );
}

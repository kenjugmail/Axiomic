import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { VizPickerButton } from "../components/VizPickerButton";
import { useAuthStore } from "../stores/auth";

// Slugify on the fly so the user can stop fiddling with the slug field
// once the title is set; they can still edit it explicitly if they want
// a different shape.
function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function WikiNewPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuthStore();

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [category, setCategory] = useState("uncategorized");
  const [activeTier, setActiveTier] = useState<"intro" | "undergrad" | "grad">("intro");
  const [content, setContent] = useState({ intro: "", undergrad: "", grad: "" });
  const [editMessage, setEditMessage] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const insertAtCursor = (snippet: string) => {
    const ta = textareaRef.current;
    const current = content[activeTier];
    if (!ta) {
      setContent({ ...content, [activeTier]: current + snippet });
      return;
    }
    const start = ta.selectionStart ?? current.length;
    const end = ta.selectionEnd ?? current.length;
    const next = current.slice(0, start) + snippet + current.slice(end);
    setContent({ ...content, [activeTier]: next });
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + snippet.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  if (authLoading) {
    return <div className="max-w-4xl mx-auto px-4 py-12"><div className="animate-pulse h-64 bg-muted rounded-lg" /></div>;
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground mb-4">You need to be signed in to create pages.</p>
        <Link to="/login" className="text-primary hover:underline">Sign in</Link>
      </div>
    );
  }

  const effectiveSlug = slugTouched ? slug : slugify(title);

  const canSave =
    title.trim().length > 0 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(effectiveSlug) &&
    (content.intro.trim() || content.undergrad.trim() || content.grad.trim());

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError("");
    try {
      await api.wiki.create({
        slug: effectiveSlug,
        title: title.trim(),
        category: category.trim() || "uncategorized",
        contentIntro: content.intro,
        contentUndergrad: content.undergrad,
        contentGrad: content.grad,
        editMessage: editMessage || undefined,
      });
      navigate(`/wiki/${effectiveSlug}`);
    } catch (err: any) {
      setError(err?.message ?? "Failed to create page");
    } finally {
      setSaving(false);
    }
  };

  const tiers = [
    { key: "intro" as const, label: "Intro" },
    { key: "undergrad" as const, label: "Undergrad" },
    { key: "grad" as const, label: "Graduate" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link to="/wiki" className="text-sm text-muted-foreground hover:text-foreground">&larr; Back to wiki</Link>
          <h1 className="text-2xl font-bold mt-1">New wiki page</h1>
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
            disabled={!canSave || saving}
            className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create page"}
          </button>
        </div>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}

      {/* Page metadata */}
      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Layer Normalization"
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Category</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="uncategorized"
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="sm:col-span-3">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Slug <span className="font-mono text-[10px]">(/wiki/{effectiveSlug || "..."})</span>
          </label>
          <input
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            placeholder="auto-generated from title"
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Tier tabs + viz picker */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 p-1 rounded-lg bg-muted w-fit">
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
        {!showPreview && <VizPickerButton onPick={insertAtCursor} />}
      </div>

      {showPreview ? (
        <div className="min-h-[500px] p-6 rounded-lg border border-border bg-card">
          <MarkdownRenderer content={content[activeTier]} />
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={content[activeTier]}
          onChange={(e) => setContent({ ...content, [activeTier]: e.target.value })}
          className="w-full min-h-[500px] p-4 rounded-lg border border-input bg-background font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder={`Write ${activeTier} tier content in Markdown...\n\nSupported: **bold**, *italic*, $LaTeX$, \`\`\`code\`\`\`, [links](/wiki/slug), ::viz[name]`}
        />
      )}
    </div>
  );
}

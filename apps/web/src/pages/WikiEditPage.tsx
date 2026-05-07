import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Columns, Eye, Pencil, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { MarkdownToolbar } from "../components/composer/MarkdownToolbar";
import { useAuthStore } from "../stores/auth";
import { streamTokens } from "../lib/streamTokens";

type Tier = "intro" | "undergrad" | "grad";
type ViewMode = "edit" | "preview" | "split";

export function WikiEditPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pageTitle, setPageTitle] = useState("");
  const [activeTier, setActiveTier] = useState<Tier>("intro");
  const [content, setContent] = useState({ intro: "", undergrad: "", grad: "" });
  const [editMessage, setEditMessage] = useState("");
  const [view, setView] = useState<ViewMode>("edit");
  const [polishing, setPolishing] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draftTopic, setDraftTopic] = useState("");
  const [draftOpen, setDraftOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!slug) return;
    api.wiki
      .get(slug)
      .then((data: any) => {
        setPageTitle(data.page.title);
        setContent({
          intro: data.allContent.intro || "",
          undergrad: data.allContent.undergrad || "",
          grad: data.allContent.grad || "",
        });
        setLoading(false);
      })
      .catch(() => {
        setError("Page not found");
        setLoading(false);
      });
  }, [slug]);

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground mb-4">
          You need to be signed in to edit pages.
        </p>
        <Link to="/login" className="text-primary hover:underline">
          Sign in
        </Link>
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

  const polish = async () => {
    if (polishing || !content[activeTier].trim()) return;
    setPolishing(true);
    setError("");
    const original = content[activeTier];
    const r = await streamTokens({
      url: "/api/v1/ai/wiki/polish",
      body: { current: original, tier: activeTier },
      onToken: (_t, next) => {
        setContent((c) => ({ ...c, [activeTier]: next }));
      },
    });
    setPolishing(false);
    if (!r.ok) {
      setError(r.error ?? "Polish failed");
      setContent((c) => ({ ...c, [activeTier]: original }));
    }
  };

  const draft = async () => {
    if (drafting || draftTopic.trim().length < 2) return;
    setDrafting(true);
    setError("");
    const r = await streamTokens({
      url: "/api/v1/ai/wiki/draft",
      body: { topic: draftTopic.trim(), tier: activeTier },
      onToken: (_t, next) => {
        setContent((c) => ({ ...c, [activeTier]: next }));
      },
    });
    setDrafting(false);
    if (!r.ok) {
      setError(r.error ?? "Draft failed");
    }
    setDraftOpen(false);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="animate-pulse h-64 bg-muted rounded-lg" />
      </div>
    );
  }

  const tiers: Array<{ key: Tier; label: string }> = [
    { key: "intro", label: "Intro" },
    { key: "undergrad", label: "Undergrad" },
    { key: "grad", label: "Graduate" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div className="min-w-0">
          <Link
            to={`/wiki/${slug}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Back to page
          </Link>
          <h1 className="text-2xl font-bold mt-1 truncate">
            Editing: {pageTitle}
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 p-0.5 rounded-md bg-muted text-xs">
            <button
              onClick={() => setView("edit")}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded ${
                view === "edit"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={view === "edit"}
              title="Edit only"
            >
              <Pencil className="w-3 h-3" strokeWidth={2} />
              Edit
            </button>
            <button
              onClick={() => setView("split")}
              className={`hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded ${
                view === "split"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={view === "split"}
              title="Side-by-side"
            >
              <Columns className="w-3 h-3" strokeWidth={2} />
              Split
            </button>
            <button
              onClick={() => setView("preview")}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded ${
                view === "preview"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={view === "preview"}
              title="Preview only"
            >
              <Eye className="w-3 h-3" strokeWidth={2} />
              Preview
            </button>
          </div>
          <input
            value={editMessage}
            onChange={(e) => setEditMessage(e.target.value)}
            placeholder="Edit message…"
            className="hidden md:block px-3 py-1.5 rounded-md border border-input bg-background text-sm w-48 focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Tier tabs + AI helpers */}
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="flex gap-1 p-1 rounded-lg bg-muted w-fit">
          {tiers.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTier(t.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-fast ${
                activeTier === t.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setDraftOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-primary/40 text-primary hover:bg-primary/10"
            title="Draft this tier from a topic with AI"
          >
            <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
            Draft
          </button>
          <button
            type="button"
            onClick={polish}
            disabled={polishing || !content[activeTier].trim()}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50"
            title="Polish this tier with AI"
          >
            <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
            {polishing ? "Polishing…" : "Polish"}
          </button>
        </div>
      </div>

      {draftOpen && (
        <div className="mb-3 rounded-lg border border-primary/40 bg-primary/5 p-3 flex items-start gap-2 flex-wrap">
          <input
            autoFocus
            value={draftTopic}
            onChange={(e) => setDraftTopic(e.target.value)}
            placeholder={`Topic for the ${activeTier} tier (replaces this tier's content)…`}
            className="flex-1 min-w-[12rem] px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDraftOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={draft}
              disabled={drafting || draftTopic.trim().length < 2}
              className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {drafting ? "Drafting…" : "Generate"}
            </button>
          </div>
        </div>
      )}

      {/* Toolbar (only in edit / split modes) */}
      {view !== "preview" && (
        <div className="mb-2">
          <MarkdownToolbar
            textareaRef={textareaRef}
            onChange={(v) => setContent({ ...content, [activeTier]: v })}
          />
        </div>
      )}

      {/* Editor / Preview body */}
      {view === "preview" ? (
        <div className="min-h-[500px] p-6 rounded-lg border border-border bg-card wiki-content">
          <MarkdownRenderer content={content[activeTier]} />
        </div>
      ) : view === "split" ? (
        <div className="grid lg:grid-cols-2 gap-3 min-h-[500px]">
          <textarea
            ref={textareaRef}
            value={content[activeTier]}
            onChange={(e) =>
              setContent({ ...content, [activeTier]: e.target.value })
            }
            className="w-full min-h-[500px] p-4 rounded-lg border border-input bg-background font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder={`Write ${activeTier} tier content in Markdown…\n\nSupported: **bold**, *italic*, $LaTeX$, \`\`\`code\`\`\`, [links](/wiki/slug), :::viz[name]`}
          />
          <div className="min-h-[500px] p-6 rounded-lg border border-border bg-card overflow-y-auto wiki-content">
            <MarkdownRenderer content={content[activeTier]} />
          </div>
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={content[activeTier]}
          onChange={(e) =>
            setContent({ ...content, [activeTier]: e.target.value })
          }
          className="w-full min-h-[500px] p-4 rounded-lg border border-input bg-background font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder={`Write ${activeTier} tier content in Markdown…\n\nSupported: **bold**, *italic*, $LaTeX$, \`\`\`code\`\`\`, [links](/wiki/slug), :::viz[name]`}
        />
      )}
    </div>
  );
}

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { api } from "../lib/api";
import type { NewsAccentColor } from "@axiomic/types";
import { NewsEditor, type NewsDraft } from "../components/news/NewsEditor";
import { AiDraftDialog } from "../components/news/AiDraftDialog";
import { useAuthStore } from "../stores/auth";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

export function NewsNewPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuthStore();
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [draft, setDraft] = useState<NewsDraft>({
    slug: "",
    title: "",
    summary: "",
    body: "",
    coverEmoji: "📰",
    accentColor: "indigo" as NewsAccentColor,
    tags: [],
    abstract: "",
    references: [],
    coauthors: [],
  });

  if (authLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="animate-pulse h-64 bg-muted rounded-lg" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground mb-4">
          You need to be signed in to write a news article.
        </p>
        <Link to="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </div>
    );
  }

  // Auto-derive slug until the user types in the slug field.
  const handleChange = (next: NewsDraft) => {
    if (!slugTouched && next.title !== draft.title) {
      next = { ...next, slug: slugify(next.title) };
    }
    if (next.slug !== draft.slug) {
      setSlugTouched(true);
    }
    setDraft(next);
  };

  const canSave =
    draft.title.trim().length > 0 &&
    draft.body.trim().length > 0 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug);

  const save = async (status: "draft" | "published") => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.news.create({
        slug: draft.slug,
        title: draft.title.trim(),
        summary: draft.summary.trim(),
        body: draft.body,
        coverEmoji: draft.coverEmoji || "📰",
        accentColor: draft.accentColor,
        tags: draft.tags,
        abstract: draft.abstract.trim(),
        references: draft.references.filter((r) => r.text.trim().length > 0),
        coauthors: draft.coauthors,
        status,
      });
      navigate(status === "draft" ? "/news/drafts" : `/news/${draft.slug}`);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <Link
            to="/news"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; News
          </Link>
          <h1 className="text-2xl font-bold mt-1">Write a news article</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAiOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-primary/40 text-primary text-sm font-medium hover:bg-primary/10"
          >
            <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
            Draft with AI
          </button>
          <button
            onClick={() => save("draft")}
            disabled={!canSave || saving}
            className="px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-accent/40 disabled:opacity-50"
          >
            Save as draft
          </button>
          <button
            onClick={() => save("published")}
            disabled={!canSave || saving}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Publish"}
          </button>
        </div>
      </div>

      {aiOpen && (
        <AiDraftDialog
          tags={draft.tags}
          onAccept={(body) => {
            setDraft({ ...draft, body });
            setAiOpen(false);
            setShowPreview(true);
          }}
          onClose={() => setAiOpen(false)}
        />
      )}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <NewsEditor
        draft={draft}
        onChange={handleChange}
        slugEditable
        showPreview={showPreview}
        onTogglePreview={() => setShowPreview((v) => !v)}
      />
    </div>
  );
}

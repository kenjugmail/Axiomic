import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import {
  ResearchPaperEditor,
  type ResearchDraft,
} from "../components/research/ResearchPaperEditor";
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

const EMPTY_DRAFT: ResearchDraft = {
  slug: "",
  title: "",
  summary: "",
  format: "research",
  abstract: "",
  contentIntro: "",
  contentUndergrad: "",
  contentGrad: "",
  canonicalTier: "undergrad",
  paperStructure: {},
  references: [],
  coauthors: [],
  coverEmoji: "📄",
  accentColor: "violet",
  tags: [],
};

export function ResearchNewPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [draft, setDraft] = useState<ResearchDraft>(EMPTY_DRAFT);

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
          You need to be signed in to write a research paper.
        </p>
        <Link to="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </div>
    );
  }

  const handleChange = (next: ResearchDraft) => {
    if (!slugTouched && next.title !== draft.title) {
      next = { ...next, slug: slugify(next.title) };
    }
    if (next.slug !== draft.slug) setSlugTouched(true);
    setDraft(next);
  };

  const canSave =
    draft.title.trim().length > 0 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug) &&
    (draft.contentIntro.trim().length > 0 ||
      draft.contentUndergrad.trim().length > 0 ||
      draft.contentGrad.trim().length > 0);

  const save = async (status: "draft" | "published") => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.research.create({
        slug: draft.slug,
        title: draft.title.trim(),
        summary: draft.summary.trim(),
        format: draft.format,
        abstract: draft.abstract.trim(),
        contentIntro: draft.contentIntro,
        contentUndergrad: draft.contentUndergrad,
        contentGrad: draft.contentGrad,
        canonicalTier: draft.canonicalTier,
        paperStructure: draft.paperStructure,
        references: draft.references.filter((r) => r.text.trim().length > 0),
        coauthors: draft.coauthors,
        coverEmoji: draft.coverEmoji,
        accentColor: draft.accentColor,
        tags: draft.tags,
        status,
      });
      navigate(
        status === "draft" ? "/research/me/drafts" : `/research/${draft.slug}`,
      );
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
            to="/research"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Research
          </Link>
          <h1 className="text-2xl font-bold mt-1">Write a research paper</h1>
        </div>
        <div className="flex items-center gap-2">
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

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <ResearchPaperEditor
        draft={draft}
        onChange={handleChange}
        slugEditable
      />
    </div>
  );
}

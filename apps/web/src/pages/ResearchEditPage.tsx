import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { ResearchPaper } from "@axiomic/types";
import {
  ResearchPaperEditor,
  type ResearchDraft,
} from "../components/research/ResearchPaperEditor";
import { useAuthStore } from "../stores/auth";

function paperToDraft(p: ResearchPaper): ResearchDraft {
  return {
    slug: p.slug,
    title: p.title,
    summary: p.summary,
    format: p.format,
    abstract: p.abstract,
    contentIntro: p.allContent.intro,
    contentUndergrad: p.allContent.undergrad,
    contentGrad: p.allContent.grad,
    canonicalTier: p.canonicalTier,
    paperStructure: p.paperStructure,
    references: p.references,
    coauthors: p.coauthors,
    coverEmoji: p.coverEmoji,
    accentColor: p.accentColor,
    tags: p.tags,
  };
}

export function ResearchEditPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuthStore();
  const [paper, setPaper] = useState<ResearchPaper | null>(null);
  const [draft, setDraft] = useState<ResearchDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    api.research
      .get(slug)
      .then((r) => {
        setPaper(r.paper);
        setDraft(paperToDraft(r.paper));
      })
      .catch((e) => setError(e?.message ?? "Failed to load paper"));
  }, [slug]);

  if (authLoading) return null;
  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground mb-4">Sign in to edit.</p>
        <Link to="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }
  if (!paper || !draft) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="animate-pulse h-64 bg-muted rounded-lg" />
      </div>
    );
  }

  if (paper.authorId !== user.id) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">
          Only the author can edit this paper.
        </p>
        <Link to={`/research/${paper.slug}`} className="text-primary hover:underline">
          View the paper instead
        </Link>
      </div>
    );
  }

  const canSave =
    draft.title.trim().length > 0 &&
    (draft.contentIntro.trim().length > 0 ||
      draft.contentUndergrad.trim().length > 0 ||
      draft.contentGrad.trim().length > 0);

  const save = async (nextStatus?: "draft" | "published") => {
    if (!canSave || saving || !slug) return;
    setSaving(true);
    setError(null);
    try {
      await api.research.update(slug, {
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
        status: nextStatus,
      });
      navigate(`/research/${slug}`);
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
            to={`/research/${paper.slug}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Back to paper
          </Link>
          <h1 className="text-2xl font-bold mt-1">Edit research paper</h1>
        </div>
        <div className="flex items-center gap-2">
          {paper.status === "draft" && (
            <button
              onClick={() => save("published")}
              disabled={!canSave || saving}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              Save & publish
            </button>
          )}
          <button
            onClick={() => save()}
            disabled={!canSave || saving}
            className="px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-accent/40 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
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
        onChange={setDraft}
        slugEditable={false}
      />
    </div>
  );
}

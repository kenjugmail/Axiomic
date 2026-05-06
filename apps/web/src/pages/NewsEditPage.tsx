import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { NewsAccentColor, NewsArticle } from "@axiomic/types";
import { NewsEditor, type NewsDraft } from "../components/news/NewsEditor";
import { useAuthStore } from "../stores/auth";

export function NewsEditPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuthStore();
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [draft, setDraft] = useState<NewsDraft | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    api.news
      .get(slug)
      .then((r) => {
        setArticle(r.article);
        setDraft({
          slug: r.article.slug,
          title: r.article.title,
          summary: r.article.summary,
          body: r.article.body,
          coverEmoji: r.article.coverEmoji,
          accentColor: r.article.accentColor as NewsAccentColor,
          tags: r.article.tags,
          abstract: r.article.abstract ?? "",
          references: r.article.references ?? [],
          coauthors: r.article.coauthors ?? [],
        });
      })
      .catch(() => setError("Failed to load article"));
  }, [slug]);

  if (authLoading || (!article && !error)) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="animate-pulse h-64 bg-muted rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-destructive mb-4">{error}</p>
        <Link to="/news" className="text-primary hover:underline">
          Back to news
        </Link>
      </div>
    );
  }

  if (!user || !article || !draft) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground mb-4">
          You need to be signed in to edit this article.
        </p>
        <Link to="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </div>
    );
  }

  if (!article.isAuthor) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-3">
        <p className="text-muted-foreground">
          Only the author can edit this article directly. You can suggest an
          edit instead — the author will review it.
        </p>
        <Link
          to={`/news/${article.slug}/propose`}
          className="inline-block px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          Suggest an edit
        </Link>
      </div>
    );
  }

  const canSave = draft.title.trim().length > 0 && draft.body.trim().length > 0;

  const save = async (statusOverride?: "draft" | "published") => {
    if (!canSave || saving || !slug || !article) return;
    setSaving(true);
    setError(null);
    try {
      const nextStatus = statusOverride ?? article.status;
      await api.news.update(slug, {
        title: draft.title.trim(),
        summary: draft.summary.trim(),
        body: draft.body,
        coverEmoji: draft.coverEmoji || "📰",
        accentColor: draft.accentColor,
        tags: draft.tags,
        abstract: draft.abstract.trim(),
        references: draft.references.filter((r) => r.text.trim().length > 0),
        coauthors: draft.coauthors,
        status: nextStatus,
      });
      navigate(nextStatus === "draft" ? "/news/drafts" : `/news/${slug}`);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <Link
            to={`/news/${slug}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Article
          </Link>
          <h1 className="text-2xl font-bold mt-1">Editing: {article.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {article.status === "published" ? (
            <button
              onClick={() => save("draft")}
              disabled={!canSave || saving}
              className="px-3 py-2 rounded-md border border-border text-sm hover:bg-accent/40 disabled:opacity-50"
            >
              Unpublish
            </button>
          ) : (
            <button
              onClick={() => save("published")}
              disabled={!canSave || saving}
              className="px-3 py-2 rounded-md border border-emerald-500/40 text-emerald-700 dark:text-emerald-400 text-sm hover:bg-emerald-500/10 disabled:opacity-50"
            >
              Publish
            </button>
          )}
          <button
            onClick={() => save()}
            disabled={!canSave || saving}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
      <NewsEditor
        draft={draft}
        onChange={setDraft}
        slugEditable={false}
        showPreview={showPreview}
        onTogglePreview={() => setShowPreview((v) => !v)}
      />
    </div>
  );
}

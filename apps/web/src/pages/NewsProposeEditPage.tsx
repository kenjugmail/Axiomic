import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { NewsAccentColor, NewsArticle } from "@axiomic/types";
import { NewsEditor, type NewsDraft } from "../components/news/NewsEditor";
import { streamTokens } from "../lib/streamTokens";
import { useAuthStore } from "../stores/auth";

export function NewsProposeEditPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuthStore();
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [draft, setDraft] = useState<NewsDraft | null>(null);
  const [message, setMessage] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [polishing, setPolishing] = useState(false);

  const polish = async () => {
    if (!article || !draft || polishing) return;
    setPolishing(true);
    setError(null);
    let acc = "";
    const result = await streamTokens({
      url: "/api/v1/ai/news/polish",
      body: {
        original: article.body,
        proposed: draft.body,
        message: message.trim() || undefined,
      },
      onToken: (_t, next) => {
        acc = next;
        setDraft((d) => (d ? { ...d, body: next } : d));
      },
    });
    setPolishing(false);
    if (!result.ok) setError(result.error ?? "Polish failed");
    // Final sync in case the last setDraft was dropped during a re-render.
    if (result.ok && acc) {
      setDraft((d) => (d ? { ...d, body: acc } : d));
    }
  };

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

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground mb-4">
          Sign in to suggest an edit.
        </p>
        <Link to="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </div>
    );
  }

  if (error || !article || !draft) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-destructive mb-4">{error ?? "Article not found"}</p>
        <Link to="/news" className="text-primary hover:underline">
          Back to news
        </Link>
      </div>
    );
  }

  if (article.isAuthor) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground mb-4">
          You're the author. Edit the article directly instead.
        </p>
        <Link
          to={`/news/${article.slug}/edit`}
          className="text-primary hover:underline"
        >
          Edit article
        </Link>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-3">
        <div className="text-5xl">✉️</div>
        <h1 className="text-xl font-semibold">Proposal sent</h1>
        <p className="text-muted-foreground">
          @{article.authorUsername} will review your edit and you'll get a
          notification when they approve or decline it.
        </p>
        <Link to={`/news/${article.slug}`} className="text-primary hover:underline">
          Back to article
        </Link>
      </div>
    );
  }

  const canSubmit = draft.title.trim().length > 0 && draft.body.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || submitting || !slug) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.news.propose(slug, {
        proposedTitle: draft.title.trim(),
        proposedSummary: draft.summary.trim(),
        proposedBody: draft.body,
        message: message.trim() || undefined,
      });
      setSubmitted(true);
    } catch (e: any) {
      setError(e?.message ?? "Could not submit");
    } finally {
      setSubmitting(false);
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
          <h1 className="text-2xl font-bold mt-1">Suggest an edit</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your changes go to @{article.authorUsername} for review.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={polish}
            disabled={polishing || !canSubmit}
            className="px-3 py-2 rounded-md border border-primary/40 text-primary text-sm font-medium hover:bg-primary/10 disabled:opacity-50"
            title="AI polishes the body of your proposal in place"
          >
            {polishing ? "Polishing…" : "✨ Polish with AI"}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting || polishing}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit proposal"}
          </button>
        </div>
      </div>
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <div className="mb-4">
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Note to the author (optional)
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="What did you change and why?"
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
        />
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

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type SavedFlashcard } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { MarkdownRenderer } from "../components/MarkdownRenderer";

type Tab = "due" | "all";

// Maps the four-button UI to SM-2 grades.
const RATINGS: { label: string; rating: number; tone: string }[] = [
  { label: "Again", rating: 1, tone: "border-rose-500/40 hover:bg-rose-500/10 text-rose-700 dark:text-rose-400" },
  { label: "Hard", rating: 3, tone: "border-amber-500/40 hover:bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  { label: "Good", rating: 4, tone: "border-emerald-500/40 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  { label: "Easy", rating: 5, tone: "border-blue-500/40 hover:bg-blue-500/10 text-blue-700 dark:text-blue-400" },
];

function relativeTime(iso: string | null): string {
  if (!iso) return "new";
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diff = t - now;  // positive = future
  const abs = Math.abs(diff);
  const day = 24 * 60 * 60 * 1000;
  if (abs < day) return diff <= 0 ? "due now" : "due soon";
  const days = Math.round(abs / day);
  return diff > 0 ? `due in ${days}d` : `${days}d overdue`;
}

export function FlashcardsPage() {
  const { user, loading: authLoading } = useAuthStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("due");
  const [allCards, setAllCards] = useState<SavedFlashcard[]>([]);
  const [dueCards, setDueCards] = useState<SavedFlashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/login");
      return;
    }
    refresh();
  }, [user, authLoading, navigate]);

  const refresh = async () => {
    setLoading(true);
    try {
      const [d, a] = await Promise.all([
        api.flashcards.due(),
        api.flashcards.list(),
      ]);
      setDueCards(d.cards);
      setAllCards(a.cards);
      setReviewIdx(0);
      setRevealed(false);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const current = dueCards[reviewIdx];

  const handleRate = async (rating: number) => {
    if (!current || submitting) return;
    setSubmitting(true);
    try {
      await api.flashcards.review(current.id, rating);
      // Drop the just-reviewed card from the queue and reset reveal.
      setDueCards((arr) => arr.filter((_, i) => i !== reviewIdx));
      setReviewIdx((i) => Math.min(i, dueCards.length - 2));
      setRevealed(false);
      // Refresh "all cards" stats lazily so the streak/interval columns update.
      api.flashcards.list().then((r) => setAllCards(r.cards)).catch(() => {});
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.flashcards.delete(id);
      setAllCards((arr) => arr.filter((c) => c.id !== id));
      setDueCards((arr) => arr.filter((c) => c.id !== id));
    } catch {
      // ignore
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Flashcards</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Spaced repetition review of cards you've saved from wiki pages.
        </p>
      </div>

      <div className="flex gap-2 mb-6 border-b border-border">
        {(["due", "all"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm border-b-2 transition-colors capitalize ${
              tab === t
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "due" ? `Due today (${dueCards.length})` : `All cards (${allCards.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse bg-muted rounded-lg" />
          ))}
        </div>
      ) : tab === "due" ? (
        dueCards.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <p className="text-lg">🎉 You're all caught up.</p>
            <p className="text-sm mt-2">
              Save more cards from a wiki page to build your deck — open any page and
              click the flashcards icon.
            </p>
          </div>
        ) : current ? (
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground">
              Card {reviewIdx + 1} of {dueCards.length} · from{" "}
              <Link
                to={`/wiki/${current.pageSlug}`}
                className="text-primary hover:underline"
              >
                {current.pageTitle}
              </Link>
            </div>
            <div
              onClick={() => setRevealed((r) => !r)}
              className="min-h-[220px] p-6 rounded-xl border border-border bg-card cursor-pointer hover:bg-accent/20 transition-colors"
            >
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
                {revealed ? "Answer" : "Question"}
              </div>
              {revealed ? (
                <MarkdownRenderer content={current.back} className="text-sm [&_p]:mb-2" />
              ) : (
                <p className="text-base font-medium">{current.front}</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {revealed ? "Rate how well you remembered." : "Click the card to reveal the answer."}
            </p>

            {revealed && (
              <div className="grid grid-cols-4 gap-2">
                {RATINGS.map((r) => (
                  <button
                    key={r.rating}
                    onClick={() => handleRate(r.rating)}
                    disabled={submitting}
                    className={`px-3 py-2 rounded-md border text-sm font-medium transition-colors disabled:opacity-50 ${r.tone}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null
      ) : (
        // All-cards tab.
        <div>
          {allCards.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              No cards yet. Open a wiki page and use the flashcards feature to start.
            </p>
          ) : (
            <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {allCards.map((c) => (
                <li key={c.id} className="px-4 py-3 hover:bg-accent/20">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium line-clamp-2">{c.front}</div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                        <Link
                          to={`/wiki/${c.pageSlug}`}
                          className="text-primary hover:underline"
                        >
                          {c.pageTitle}
                        </Link>
                        <span>·</span>
                        <span>{relativeTime(c.dueAt)}</span>
                        <span>·</span>
                        <span>reps {c.repetitions}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="text-xs text-muted-foreground hover:text-destructive shrink-0"
                      title="Remove from deck"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

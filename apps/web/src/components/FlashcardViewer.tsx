import { useState, useEffect } from "react";
import { api, type Flashcard } from "../lib/api";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { useAuthStore } from "../stores/auth";

interface FlashcardViewerProps {
  pageSlug: string;
  pageTitle: string;
  tier: string;
  isOpen: boolean;
  onClose: () => void;
}

export function FlashcardViewer({
  pageSlug,
  pageTitle,
  tier,
  isOpen,
  onClose,
}: FlashcardViewerProps) {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  // Tracks which card-indexes the user has saved into their deck so we
  // can swap the button into a checkmark without a re-fetch.
  const [savedIdx, setSavedIdx] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setCurrentIndex(0);
    setFlipped(false);
    setSavedIdx(new Set());
    api.ai.flashcards(pageSlug, tier).then((data) => {
      setCards(data.cards);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [isOpen, pageSlug, tier]);

  const handleSave = async () => {
    if (!user || saving) return;
    const card = cards[currentIndex];
    if (!card) return;
    setSaving(true);
    try {
      await api.flashcards.save({
        pageSlug,
        pageTitle,
        front: card.front,
        back: card.back,
      });
      setSavedIdx((prev) => {
        const next = new Set(prev);
        next.add(currentIndex);
        return next;
      });
    } catch {
      // ignore — user will see button stay un-checked.
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const current = cards[currentIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Flashcards</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {currentIndex + 1} / {cards.length}
            </span>
            <button onClick={onClose} className="p-1 hover:bg-accent rounded">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="animate-pulse text-sm text-muted-foreground">Generating flashcards...</div>
          </div>
        ) : cards.length === 0 ? (
          <div className="h-48 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No flashcards could be generated for this page.</p>
          </div>
        ) : (
          <>
            {/* Card */}
            <div
              onClick={() => setFlipped(!flipped)}
              className="min-h-[200px] p-6 rounded-lg border border-border bg-background cursor-pointer hover:bg-accent/30 transition-colors flex items-center justify-center text-center"
            >
              {flipped ? (
                <div className="text-sm">
                  <MarkdownRenderer content={current.back} className="[&_p]:text-sm [&_p]:mb-1" />
                </div>
              ) : (
                <p className="font-medium">{current.front}</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground text-center mt-2">
              {flipped ? "Click to see question" : "Click to reveal answer"}
            </p>

            {/* Save to deck */}
            {user && (
              <div className="mt-3 flex justify-center">
                <button
                  onClick={handleSave}
                  disabled={saving || savedIdx.has(currentIndex)}
                  className={`text-xs px-3 py-1 rounded-md border transition-colors ${
                    savedIdx.has(currentIndex)
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : "border-input hover:bg-accent/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {savedIdx.has(currentIndex) ? "✓ Saved to deck" : saving ? "Saving…" : "Save to deck"}
                </button>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between mt-4">
              <button
                onClick={() => { setCurrentIndex(Math.max(0, currentIndex - 1)); setFlipped(false); }}
                disabled={currentIndex === 0}
                className="px-4 py-2 rounded-md bg-secondary text-secondary-foreground text-sm disabled:opacity-30"
              >
                Previous
              </button>
              <button
                onClick={() => { setCurrentIndex(Math.min(cards.length - 1, currentIndex + 1)); setFlipped(false); }}
                disabled={currentIndex === cards.length - 1}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-30"
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { api } from "../../lib/api";
import type { AiPracticeQuestion } from "@axiomic/types";

interface Props {
  pageSlug: string;
  tier: string;
}

export function PracticePanel({ pageSlug, tier }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<AiPracticeQuestion[]>([]);
  const [picks, setPicks] = useState<Record<number, number | null>>({});
  const [revealed, setRevealed] = useState(false);

  const generate = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setRevealed(false);
    setPicks({});
    setQuestions([]);
    try {
      const r = await api.ai.practiceQuestions(pageSlug, tier);
      setQuestions(r.questions);
      if (r.questions.length === 0) {
        setError("AI couldn't extract questions from this page. Try again.");
      }
    } catch (e: any) {
      setError(e?.message ?? "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="my-6 rounded-lg border border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-primary mb-0.5">
            <Sparkles className="w-3 h-3" strokeWidth={2} />
            Quiz me on this page
          </div>
          <p className="text-sm text-muted-foreground">
            AI generates 3 multiple-choice questions from the content above.
          </p>
        </div>
        {!open ? (
          <button
            onClick={() => {
              setOpen(true);
              generate();
            }}
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium"
          >
            Quiz me
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={generate}
              disabled={loading}
              className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent/40 disabled:opacity-50"
            >
              {loading ? "Generating…" : "Regenerate"}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Hide
            </button>
          </div>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {loading && questions.length === 0 && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 animate-pulse bg-muted rounded-md" />
              ))}
            </div>
          )}
          {questions.map((q, i) => {
            const pick = picks[i] ?? null;
            return (
              <div key={i} className="rounded-md border border-border bg-card p-3">
                <div className="text-sm font-medium mb-2">
                  {i + 1}. {q.question}
                </div>
                <ul className="space-y-1">
                  {q.options.map((opt, oi) => {
                    const selected = pick === oi;
                    const correct = revealed && oi === q.correctIndex;
                    const wrong = revealed && selected && oi !== q.correctIndex;
                    return (
                      <li key={oi}>
                        <button
                          onClick={() =>
                            !revealed && setPicks({ ...picks, [i]: oi })
                          }
                          disabled={revealed}
                          className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors ${
                            correct
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                              : wrong
                                ? "bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/30"
                                : selected
                                  ? "bg-primary/10 text-primary border border-primary/30"
                                  : "border border-transparent hover:bg-accent/30"
                          } disabled:cursor-not-allowed`}
                        >
                          <span className="text-muted-foreground mr-2">
                            {String.fromCharCode(65 + oi)}.
                          </span>
                          {opt}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {revealed && q.explanation && (
                  <p className="text-xs text-muted-foreground mt-2 italic">{q.explanation}</p>
                )}
              </div>
            );
          })}
          {questions.length > 0 && (
            <div className="flex items-center justify-between">
              <button
                onClick={() => setRevealed((v) => !v)}
                className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium"
              >
                {revealed ? "Hide answers" : "Reveal answers"}
              </button>
              {revealed && (
                <span className="text-xs text-muted-foreground">
                  Score:{" "}
                  {questions.reduce(
                    (acc, q, i) => acc + (picks[i] === q.correctIndex ? 1 : 0),
                    0,
                  )}{" "}
                  / {questions.length}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

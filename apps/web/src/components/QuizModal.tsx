import { useEffect, useState } from "react";
import { api, type QuizQuestion } from "../lib/api";
import { QuestionRenderer, isAnswered } from "./quiz/QuestionRenderer";
import { assertQuestionKind } from "@axiomic/types";

const PASSING_SCORE = 0.7;

interface QuizModalProps {
  nodeId: string;
  nodeTitle: string;
  onClose: () => void;
  // Called when the user passes the quiz so the parent can refetch progress.
  onPassed?: () => void;
}

type Phase = "loading" | "answering" | "scored" | "error";

interface ScoreResult {
  score: number;
  correct: number;
  total: number;
  // Optional per-question right/wrong for the review state. Falls back
  // to "couldn't determine" when older servers omit it.
  perQuestion?: Record<string, boolean>;
}

// Client-side mirror of the server's per-kind scoring. Used to feed
// the review state without a second round trip; the server remains the
// source of truth for the overall score.
function scoreLocally(question: QuizQuestion, answer: string | undefined): boolean {
  const q = assertQuestionKind(question);
  if (answer === undefined && q.kind !== "slider") return false;
  switch (q.kind) {
    case "multiple_choice":
      return answer === String(q.correctIndex);
    case "slider": {
      const v = parseFloat(answer ?? String(q.default));
      return !isNaN(v) && v >= q.target.min && v <= q.target.max;
    }
    case "drag_classify": {
      try {
        const map = JSON.parse(answer!) as Record<string, string>;
        return q.items.every((i) => map[i.id] === i.bin);
      } catch {
        return false;
      }
    }
    case "code": {
      try {
        const r = JSON.parse(answer!) as { passed: number; total: number };
        return (
          typeof r.passed === "number" &&
          r.passed === q.tests.length &&
          r.total === q.tests.length
        );
      } catch {
        return false;
      }
    }
    case "puzzle_drag_build": {
      try {
        const map = JSON.parse(answer!) as Record<string, string>;
        const compsById = new Map(q.components.map((c) => [c.id, c]));
        return q.slots.every((s) => {
          const cId = map[s.id];
          if (!cId) return false;
          const comp = compsById.get(cId);
          return !!comp && comp.type === s.accepts;
        });
      } catch {
        return false;
      }
    }
    case "math_expression": {
      if (answer === undefined) return false;
      const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
      const a = norm(answer);
      return q.acceptedAnswers.some((acc) => norm(acc) === a);
    }
    case "sortable": {
      try {
        const order = JSON.parse(answer!) as string[];
        const correct = q.items.map((it) => it.id);
        return (
          order.length === correct.length &&
          order.every((id, i) => id === correct[i])
        );
      } catch {
        return false;
      }
    }
    case "code_completion": {
      try {
        const map = JSON.parse(answer!) as Record<string, string>;
        const norm = (s: string) => s.trim();
        return q.blanks.every((b) => {
          const u = map[b.id];
          if (typeof u !== "string") return false;
          const nu = norm(u);
          return b.acceptedAnswers.some((acc) => norm(acc) === nu);
        });
      } catch {
        return false;
      }
    }
    case "free_response":
    case "scenario": {
      if (answer === undefined) return false;
      try {
        const r = JSON.parse(answer) as { graded?: boolean; correct?: boolean };
        return r.graded === true && r.correct === true;
      } catch {
        return false;
      }
    }
    case "guided_derivation": {
      if (answer === undefined) return false;
      try {
        const r = JSON.parse(answer) as {
          completed?: boolean;
          correct?: boolean;
        };
        return r.completed === true && r.correct === true;
      } catch {
        return false;
      }
    }
  }
}

export function QuizModal({ nodeId, nodeTitle, onClose, onPassed }: QuizModalProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.mastery
      .getQuiz(nodeId)
      .then((data) => {
        if (cancelled) return;
        setQuestions(data.questions);
        setPhase("answering");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message ?? "Failed to load quiz");
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [nodeId]);

  // Esc to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSubmit = async () => {
    if (!allAnswered) return;
    setSubmitting(true);
    try {
      const r = await api.mastery.submitQuiz(nodeId, answers);
      // Compute per-question correctness locally so the review state can
      // light up right/wrong colors. The server's overall score is what
      // gates auto-mark-complete.
      const perQuestion: Record<string, boolean> = {};
      for (const q of questions) {
        perQuestion[q.id] = scoreLocally(q, answers[q.id]);
      }
      setResult({ ...r, perQuestion });
      setPhase("scored");
      if (r.score >= PASSING_SCORE) {
        try {
          await api.mastery.markComplete(nodeId);
          onPassed?.();
        } catch {
          // Don't fail the modal if the auto-mark step has a hiccup.
        }
      }
    } catch (e: any) {
      setError(e?.message ?? "Submit failed");
      setPhase("error");
    } finally {
      setSubmitting(false);
    }
  };

  const passed = result !== null && result.score >= PASSING_SCORE;
  const allAnswered =
    questions.length > 0 && questions.every((q) => isAnswered(q, answers[q.id]));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh]">
      <button type="button" aria-label="Close dialog" onClick={onClose} className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <div className="relative w-full max-w-2xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Quiz · {nodeTitle}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pass with {Math.round(PASSING_SCORE * 100)}% to mark this node complete.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {phase === "loading" && (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-20 animate-pulse bg-muted rounded-md" />
              ))}
            </div>
          )}

          {phase === "error" && (
            <div className="text-sm text-destructive">{error}</div>
          )}

          {(phase === "answering" || phase === "scored") &&
            questions.map((q, i) => {
              const review =
                phase === "scored" && result?.perQuestion
                  ? { correct: !!result.perQuestion[q.id] }
                  : undefined;
              return (
                <div key={q.id} className="space-y-3">
                  <div className="text-sm font-medium">
                    <span className="text-muted-foreground mr-2">{i + 1}.</span>
                    {q.question}
                  </div>
                  <QuestionRenderer
                    question={q}
                    value={answers[q.id]}
                    onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
                    review={review}
                  />
                  {review && (q as any).explanation && (
                    <div className="text-xs text-muted-foreground italic px-1">
                      {(q as any).explanation}
                    </div>
                  )}
                </div>
              );
            })}

          {phase === "scored" && result && (
            <div
              className={`p-4 rounded-md border ${
                passed
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-amber-500/30 bg-amber-500/5"
              }`}
            >
              <div className="text-lg font-semibold">
                {passed ? "Passed!" : "Not quite — try again."}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                You got {result.correct} / {result.total} correct (
                {Math.round(result.score * 100)}%).
              </div>
              {passed && (
                <p className="text-sm mt-2 text-foreground">
                  This node is now marked complete.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          {phase === "answering" && (
            <>
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!allAnswered || submitting}
                className="px-4 py-1.5 text-sm rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50"
              >
                {submitting ? "Scoring…" : "Submit"}
              </button>
            </>
          )}
          {(phase === "scored" || phase === "error") && (
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm rounded-md bg-primary text-primary-foreground font-medium"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

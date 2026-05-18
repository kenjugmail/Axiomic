import { useState } from "react";
import type { GuidedDerivationQuestion as Q } from "@axiomic/types";
import { api } from "../../lib/api";
import { MarkdownRenderer } from "../MarkdownRenderer";

interface Props {
  question: Q;
  value: string | undefined;
  onChange: (v: string) => void;
  review?: { correct: boolean };
}

type StepStatus = "pending" | "correct" | "revealed";

interface State {
  completed: boolean;
  correct: boolean;
  steps: { status: StepStatus; hintTier: number }[];
  idx: number;
}

function initState(q: Q, value: string | undefined): State {
  if (value) {
    try {
      const r = JSON.parse(value) as State;
      if (r && Array.isArray(r.steps) && r.steps.length === q.steps.length) {
        return r;
      }
    } catch {
      /* fresh start */
    }
  }
  return {
    completed: false,
    correct: false,
    steps: q.steps.map(() => ({ status: "pending", hintTier: 0 })),
    idx: 0,
  };
}

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

export function GuidedDerivationQuestion({
  question,
  value,
  onChange,
  review,
}: Props) {
  const [state, setState] = useState<State>(() => initState(question, value));
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  function persist(next: State) {
    setState(next);
    onChange(JSON.stringify(next));
  }

  function finishIfDone(steps: State["steps"], idx: number) {
    if (idx >= question.steps.length) {
      persist({
        completed: true,
        correct: steps.every((s) => s.status === "correct"),
        steps,
        idx,
      });
    } else {
      persist({ ...state, steps, idx });
    }
  }

  function markStep(status: StepStatus) {
    const steps = state.steps.map((s, i) =>
      i === state.idx ? { ...s, status } : s,
    );
    setDraft("");
    finishIfDone(steps, state.idx + 1);
  }

  function wrong() {
    const steps = state.steps.map((s, i) =>
      i === state.idx ? { ...s, hintTier: s.hintTier + 1 } : s,
    );
    persist({ ...state, steps });
  }

  async function check() {
    const step = question.steps[state.idx];
    if (!step || busy) return;
    const a = step.accepts;
    if (a.mode === "math") {
      if (a.acceptedAnswers.some((acc) => norm(acc) === norm(draft)))
        markStep("correct");
      else wrong();
      return;
    }
    if (a.mode === "choice") {
      if (draft === String(a.correctIndex)) markStep("correct");
      else wrong();
      return;
    }
    // text → AI rubric grade (heuristic fallback server-side)
    if (!draft.trim()) return;
    setBusy(true);
    try {
      const r = await api.ai.gradeFreeResponse({
        question: step.prompt,
        rubric: a.rubricCriteria.map((c) => `- ${c.description}`).join("\n"),
        response: draft,
        maxScore: Math.max(3, a.rubricCriteria.length),
        passRatio: 0.6,
      });
      if (r.correct) markStep("correct");
      else wrong();
    } catch {
      wrong();
    } finally {
      setBusy(false);
    }
  }

  const cur = state.steps[state.idx];
  const locked = !!review || state.completed;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
        <span className="text-[11px] uppercase tracking-wider text-primary">
          Goal
        </span>
        <div className="mt-1 [&_p]:mb-0">
          <MarkdownRenderer content={question.goal} />
        </div>
      </div>

      <ol className="space-y-3">
        {question.steps.map((s, i) => {
          const st = state.steps[i];
          const done = st.status !== "pending" && i < state.idx;
          if (i > state.idx) return null;
          return (
            <li
              key={i}
              className="rounded-md border border-border p-3 text-sm"
            >
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                Step {i + 1} of {question.steps.length}
                {done &&
                  (st.status === "correct" ? " · solved" : " · revealed")}
              </div>
              <div className="font-medium [&_p]:mb-1">
                <MarkdownRenderer content={s.prompt} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {s.motivation}
              </p>

              {done && (
                <div className="mt-2 rounded bg-muted/50 p-2 text-xs [&_p]:mb-0">
                  <MarkdownRenderer content={s.reveal} />
                </div>
              )}

              {!done && i === state.idx && !locked && (
                <div className="mt-3 space-y-2">
                  {s.accepts.mode === "choice" ? (
                    <div className="space-y-1">
                      {s.accepts.options.map((opt, oi) => (
                        <label
                          key={oi}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <input
                            type="radio"
                            name={`gd-${question.id}-${i}`}
                            checked={draft === String(oi)}
                            onChange={() => setDraft(String(oi))}
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
                  ) : s.accepts.mode === "math" ? (
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Enter the next step…"
                      aria-label={`Step ${state.idx + 1} answer`}
                      className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  ) : (
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={3}
                      placeholder="Explain this step…"
                      aria-label={`Step ${state.idx + 1} explanation`}
                      className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  )}

                  {cur.hintTier > 0 &&
                    s.hints.slice(0, cur.hintTier).map((h, hi) => (
                      <p
                        key={hi}
                        className="text-xs text-amber-700 dark:text-amber-400"
                      >
                        💡 {h}
                      </p>
                    ))}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={check}
                      disabled={busy}
                      className="inline-flex items-center px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50"
                    >
                      {busy ? "Checking…" : "Check step"}
                    </button>
                    {cur.hintTier >= s.hints.length && (
                      <button
                        type="button"
                        onClick={() => markStep("revealed")}
                        className="text-xs text-muted-foreground hover:text-foreground underline"
                      >
                        Reveal this step
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {state.completed && (
        <div
          className={`rounded-md border p-3 text-sm ${
            state.correct
              ? "border-emerald-500/40 bg-emerald-500/10"
              : "border-amber-500/40 bg-amber-500/10"
          }`}
        >
          <div className="font-medium">
            {state.correct
              ? "Derivation complete — every step solved."
              : "Derivation complete (some steps revealed)."}
          </div>
          {question.finalResult && (
            <div className="mt-1 [&_p]:mb-0">
              <MarkdownRenderer content={question.finalResult} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import type { RubricCriterion } from "@axiomic/types";
import { api } from "../../lib/api";
import { MarkdownRenderer } from "../MarkdownRenderer";

interface Envelope {
  graded: boolean;
  correct: boolean;
  score: number;
  maxScore: number;
  feedbackMd: string;
  text: string;
}

interface Props {
  questionText: string;
  rubricCriteria: RubricCriterion[];
  passRatio?: number;
  value: string | undefined;
  onChange: (v: string) => void;
  review?: { correct: boolean };
}

function parseEnvelope(value: string | undefined): Envelope | null {
  if (!value) return null;
  try {
    const r = JSON.parse(value);
    if (r && typeof r === "object" && r.graded === true) return r as Envelope;
  } catch {
    /* not an envelope yet */
  }
  return null;
}

// Shared textarea + "Check answer" box for the AI-graded
// free_response / scenario kinds. The component owns the async
// grade call and writes a result envelope into the answer string
// (same pattern as the `code` kind), so the synchronous lesson
// grader just reads {graded,correct}. Heuristic server fallback
// keeps it working without a live model.
export function AiGradedResponse({
  questionText,
  rubricCriteria,
  passRatio,
  value,
  onChange,
  review,
}: Props) {
  const existing = useMemo(() => parseEnvelope(value), [value]);
  const [text, setText] = useState(existing?.text ?? "");
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rubricMd = useMemo(
    () => rubricCriteria.map((c) => `- ${c.description}`).join("\n"),
    [rubricCriteria],
  );
  const maxScore = Math.max(3, rubricCriteria.length);
  const locked = !!review || !!existing;

  async function check() {
    if (grading || !text.trim()) return;
    setGrading(true);
    setError(null);
    try {
      const r = await api.ai.gradeFreeResponse({
        question: questionText,
        rubric: rubricMd,
        response: text,
        maxScore,
        passRatio: passRatio ?? 0.6,
      });
      const env: Envelope = {
        graded: true,
        correct: r.correct,
        score: r.score,
        maxScore: r.maxScore,
        feedbackMd: r.feedbackMd,
        text,
      };
      onChange(JSON.stringify(env));
    } catch {
      setError("Grading failed — try again.");
    } finally {
      setGrading(false);
    }
  }

  return (
    <div className="space-y-3">
      <textarea
        value={existing?.text ?? text}
        onChange={(e) => setText(e.target.value)}
        disabled={locked}
        rows={6}
        placeholder="Write your answer in your own words…"
        className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-70"
      />
      {!locked && (
        <button
          type="button"
          onClick={check}
          disabled={grading || !text.trim()}
          className="inline-flex items-center px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50"
        >
          {grading ? "Grading…" : "Check answer"}
        </button>
      )}
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {existing && (
        <div
          className={`rounded-md border p-3 text-sm ${
            existing.correct
              ? "border-emerald-500/40 bg-emerald-500/10"
              : "border-amber-500/40 bg-amber-500/10"
          }`}
        >
          <div
            className={`font-medium ${
              existing.correct ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"
            }`}
          >
            {existing.correct ? "Strong answer" : "Partial"} · {existing.score}/
            {existing.maxScore}
          </div>
          <div className="mt-1 text-foreground/90 [&_p]:mb-1 [&_p:last-child]:mb-0">
            <MarkdownRenderer content={existing.feedbackMd} />
          </div>
        </div>
      )}
    </div>
  );
}

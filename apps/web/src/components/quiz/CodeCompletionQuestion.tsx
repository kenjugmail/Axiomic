import { useEffect, useState } from "react";
import type { CodeCompletionQuestion as Q } from "@axiomic/types";

interface Props {
  question: Q;
  value: string | undefined;
  onChange: (v: string) => void;
  review?: { correct: boolean };
}

// Code-completion: render the template as alternating text + input
// segments based on `___N___` placeholder markers. Answer is a JSON
// `{ blankId: userValue }` map.
const PLACEHOLDER_RE = /___(\d+)___/g;

interface Segment {
  kind: "text" | "blank";
  text?: string;
  blankId?: string;
}

function parseTemplate(template: string, blankIds: string[]): Segment[] {
  const segs: Segment[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  PLACEHOLDER_RE.lastIndex = 0;
  while ((m = PLACEHOLDER_RE.exec(template)) !== null) {
    if (m.index > lastIdx) {
      segs.push({ kind: "text", text: template.slice(lastIdx, m.index) });
    }
    const idx = parseInt(m[1], 10);
    const blankId = blankIds[idx - 1];
    segs.push({ kind: "blank", blankId });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < template.length) {
    segs.push({ kind: "text", text: template.slice(lastIdx) });
  }
  return segs;
}

export function CodeCompletionQuestion({ question, value, onChange, review }: Props) {
  const blankIds = question.blanks.map((b) => b.id);
  const segments = parseTemplate(question.template, blankIds);

  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    if (value) {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === "object") return parsed;
      } catch {
        // fall through
      }
    }
    return {};
  });

  useEffect(() => {
    onChange(JSON.stringify(answers));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  const acceptedById = new Map(question.blanks.map((b) => [b.id, b.acceptedAnswers]));

  return (
    <div className="space-y-3">
      <pre className="rounded-md border border-border bg-muted/40 p-3 text-sm font-mono whitespace-pre-wrap leading-relaxed">
        {segments.map((s, i) => {
          if (s.kind === "text") return <span key={i}>{s.text}</span>;
          if (!s.blankId) return null;
          const userVal = answers[s.blankId] ?? "";
          const accepted = acceptedById.get(s.blankId) ?? [];
          const norm = (x: string) => x.trim();
          const isCorrect =
            review && accepted.some((acc) => norm(acc) === norm(userVal));
          return (
            <input
              key={i}
              value={userVal}
              onChange={(e) =>
                setAnswers({ ...answers, [s.blankId!]: e.target.value })
              }
              disabled={!!review}
              size={Math.max(6, userVal.length + 2)}
              className={`inline-block px-1 py-px rounded border text-sm font-mono ${
                review
                  ? isCorrect
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-rose-500 bg-rose-500/10"
                  : "border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              }`}
              placeholder={`___`}
            />
          );
        })}
      </pre>
      {review && !review.correct && (
        <div className="text-xs text-rose-700 dark:text-rose-400 space-y-0.5">
          <div>Expected fills:</div>
          <ul className="list-disc list-inside font-mono text-xs">
            {question.blanks.map((b) => (
              <li key={b.id}>
                {b.id}: {b.acceptedAnswers[0]}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

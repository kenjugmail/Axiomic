import type { MultipleChoiceQuestion as Q } from "@axiomic/types";

interface Props {
  question: Q;
  value: string | undefined;
  onChange: (v: string) => void;
  // Read-only review mode after submission. When `correct` is provided
  // the renderer highlights right/wrong choices.
  review?: { correct: boolean };
}

export function MultipleChoiceQuestion({ question, value, onChange, review }: Props) {
  return (
    <div className="space-y-1.5">
      {question.options.map((opt, j) => {
        const checked = value === String(j);
        const isCorrect = j === question.correctIndex;
        let className = "border-input hover:bg-accent/40";
        if (review) {
          if (isCorrect) className = "border-emerald-500/40 bg-emerald-500/10";
          else if (checked) className = "border-rose-500/40 bg-rose-500/10";
          else className = "border-input opacity-60";
        } else if (checked) {
          className = "border-primary bg-primary/5";
        }
        return (
          <label
            key={j}
            className={`flex items-start gap-2 px-3 py-2 rounded-md border text-sm transition-colors ${
              review ? "" : "cursor-pointer"
            } ${className}`}
          >
            <input
              type="radio"
              name={question.id}
              value={j}
              checked={checked}
              onChange={() => onChange(String(j))}
              disabled={!!review}
              className="mt-0.5 accent-primary"
            />
            <span className="flex-1">{opt}</span>
            {review && isCorrect && (
              <span className="text-xs text-emerald-700 dark:text-emerald-400 shrink-0">✓</span>
            )}
            {review && checked && !isCorrect && (
              <span className="text-xs text-rose-700 dark:text-rose-400 shrink-0">✗</span>
            )}
          </label>
        );
      })}
    </div>
  );
}

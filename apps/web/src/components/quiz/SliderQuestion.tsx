import { SoftmaxTemperatureSlider } from "../../../../../packages/viz/src/quiz/SoftmaxTemperatureSlider";
import type { SliderQuestion as Q } from "@axiomic/types";

interface Props {
  question: Q;
  // Stored as a string so we can pass it through the same answer map
  // shape used by every kind. Parse to float for the viz.
  value: string | undefined;
  onChange: (v: string) => void;
  review?: { correct: boolean };
}

// Lookup table for which controlled viz to render. Adding a new viz
// kind is a one-line addition here.
function renderViz(name: string, value: number, q: Q) {
  switch (name) {
    case "softmax-temperature":
      return (
        <SoftmaxTemperatureSlider
          value={value}
          targetMin={q.target.min}
          targetMax={q.target.max}
          {...(q.vizProps as object)}
        />
      );
    default:
      return (
        <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
          Unknown viz: {name}
        </div>
      );
  }
}

export function SliderQuestion({ question, value, onChange, review }: Props) {
  const numeric =
    value !== undefined ? parseFloat(value) : question.default;
  const safe = isNaN(numeric) ? question.default : numeric;

  return (
    <div className="space-y-3">
      {renderViz(question.viz, safe, question)}
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">{question.min}</span>
        <input
          type="range"
          min={question.min}
          max={question.max}
          step={question.step}
          value={safe}
          onChange={(e) => onChange(e.target.value)}
          disabled={!!review}
          className="flex-1 accent-primary"
        />
        <span className="text-xs text-muted-foreground">{question.max}</span>
      </div>
      {review && (
        <div
          className={`text-xs px-3 py-2 rounded-md ${
            review.correct
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-rose-500/10 text-rose-700 dark:text-rose-400"
          }`}
        >
          {review.correct
            ? `Your value (${safe.toFixed(2)}) is in the target range [${question.target.min}, ${question.target.max}].`
            : `Your value (${safe.toFixed(2)}) is outside the target range [${question.target.min}, ${question.target.max}].`}
        </div>
      )}
    </div>
  );
}

// Digital-SAT-parity: multi-select / two-part style. Checkbox-style
// options. The server exposes `correctCount` (not the indexes) so
// the runner can disable further picks once the learner has chosen
// exactly that many — keeping the answer-key opaque mid-attempt.

interface Props {
  options: Array<{ label: string; text: string }>;
  selectedIndexes: number[];
  correctCount: number;
  onChange: (next: number[]) => void;
  disabled?: boolean;
  // For review/post-submit display.
  correctIndexes?: number[] | null;
}

export function MultiSelectQuestion({
  options,
  selectedIndexes,
  correctCount,
  onChange,
  disabled,
  correctIndexes,
}: Props) {
  const selected = new Set(selectedIndexes);
  const cap = correctCount > 0 ? correctCount : options.length;
  const atCap = selected.size >= cap;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground" data-testid="ms-hint">
        {correctCount > 1
          ? `Pick exactly ${correctCount} options.`
          : "Pick the correct option."}
      </p>
      <div className="space-y-2">
        {options.map((opt, i) => {
          const isSel = selected.has(i);
          const isCorrect = correctIndexes?.includes(i);
          // Highlight in review mode if we have the key.
          const reviewClass = correctIndexes
            ? isCorrect
              ? "border-emerald-500/40 bg-emerald-500/5"
              : isSel
                ? "border-rose-500/40 bg-rose-500/5"
                : "border-border"
            : isSel
              ? "border-primary bg-primary/10"
              : "border-border bg-card hover:border-primary/40";
          return (
            <button
              key={opt.label}
              type="button"
              disabled={disabled || (!isSel && atCap)}
              onClick={() => {
                if (!isSel && atCap) return;
                const next = new Set(selectedIndexes);
                if (isSel) next.delete(i);
                else next.add(i);
                onChange(Array.from(next).sort((a, b) => a - b));
              }}
              className={`w-full text-left rounded-lg border p-3 transition-colors disabled:opacity-50 ${reviewClass}`}
              aria-pressed={isSel}
            >
              <span className="font-mono text-xs font-semibold mr-3 text-muted-foreground">
                {opt.label}
              </span>
              <span className="text-sm whitespace-pre-wrap">{opt.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

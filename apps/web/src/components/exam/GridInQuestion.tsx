// Digital-SAT-parity: grid-in (Student-Produced Response) input.
// Single text field accepting digits, decimal point, slash (for
// fractions), and minus sign. Grading is server-side via
// gradeGridIn (dual-path string-or-numeric match).

interface Props {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  // For review/post-submit display.
  acceptedAnswers?: string[] | null;
}

// Restrict to the keystrokes the SAT grid actually allows. Letters
// and stray punctuation are silently dropped so a learner can't
// confuse the grader with "three quarters".
const ALLOWED = /^[0-9./\-\s]*$/;

export function GridInQuestion({
  value,
  onChange,
  disabled,
  acceptedAnswers,
}: Props) {
  return (
    <div className="space-y-2">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (ALLOWED.test(v)) onChange(v);
        }}
        disabled={disabled}
        placeholder="e.g. 3/4, 0.75, 12"
        aria-label="Grid-in answer"
        data-testid="grid-in-input"
        className="w-full max-w-xs px-3 py-2 rounded-lg border border-input bg-background text-base font-mono focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <p className="text-xs text-muted-foreground">
        Accepts integers, decimals, and fractions like <code>3/4</code>.
      </p>
      {acceptedAnswers && acceptedAnswers.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Accepted: {acceptedAnswers.map((s) => `"${s}"`).join(", ")}
        </p>
      )}
    </div>
  );
}

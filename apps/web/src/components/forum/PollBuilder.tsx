interface Props {
  question: string;
  options: string[];
  onChange: (next: { question: string; options: string[] }) => void;
}

const MIN = 2;
const MAX = 8;

export function PollBuilder({ question, options, onChange }: Props) {
  const setQuestion = (q: string) => onChange({ question: q, options });
  const setOption = (i: number, label: string) => {
    const next = [...options];
    next[i] = label;
    onChange({ question, options: next });
  };
  const addOption = () => {
    if (options.length >= MAX) return;
    onChange({ question, options: [...options, ""] });
  };
  const removeOption = (i: number) => {
    if (options.length <= MIN) return;
    onChange({ question, options: options.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="text-[10px] uppercase tracking-wider text-violet-700 dark:text-violet-300">
        Poll setup
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Question
        </label>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What's the right call here?"
          maxLength={200}
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="space-y-2">
        <label className="block text-xs font-medium text-muted-foreground">
          Options ({options.length} / {MAX})
        </label>
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
            <input
              value={opt}
              onChange={(e) => setOption(i, e.target.value)}
              placeholder={`Option ${i + 1}`}
              maxLength={200}
              className="flex-1 px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={() => removeOption(i)}
              disabled={options.length <= MIN}
              className="text-xs px-2 py-1 rounded text-muted-foreground hover:text-destructive disabled:opacity-30"
              aria-label="Remove option"
            >
              ✕
            </button>
          </div>
        ))}
        {options.length < MAX && (
          <button
            type="button"
            onClick={addOption}
            className="text-xs px-3 py-1.5 rounded-md border border-dashed border-border hover:bg-accent/40"
          >
            + Add option
          </button>
        )}
      </div>
    </div>
  );
}

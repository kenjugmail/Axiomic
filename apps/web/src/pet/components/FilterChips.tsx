// Phase 3 (prototype migration) — FilterChips.
// Small pill chip row labeled by a left-side caption. Port of
// extras.jsx:154-175. Selected state uses the accent color.

interface Option<V extends string> {
  value: V;
  label: string;
}

interface Props<V extends string> {
  label: string;
  value: V;
  options: Array<Option<V>>;
  onChange: (v: V) => void;
}

export function FilterChips<V extends string>({
  label,
  value,
  options,
  onChange,
}: Props<V>): JSX.Element {
  return (
    <div className="flex gap-1.5 items-center mb-1.5 flex-wrap">
      <span
        className="text-xs flex-none"
        style={{ color: "var(--ink-3)", width: 56 }}
      >
        {label}
      </span>
      {options.map((opt) => {
        const on = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={on}
            className="rounded-full transition-colors"
            style={{
              padding: "5px 10px",
              fontSize: 12,
              border: on ? "1px solid var(--accent)" : "1px solid var(--line)",
              background: on ? "var(--accent-soft)" : "var(--bg-elev)",
              color: on ? "var(--accent)" : "var(--ink-2)",
              fontWeight: on ? 600 : 400,
              cursor: "pointer",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

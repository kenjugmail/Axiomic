/**
 * Native range input wrapped with a label + numeric readout.
 * Used for the density and rarity-intensity controls in Settings.
 */
export interface RangeSliderProps {
  label: string;
  description?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** How to render the number on the right (default: 1-decimal). */
  format?: (value: number) => string;
  testId?: string;
}

export function RangeSlider({
  label,
  description,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.05,
  format,
  testId,
}: RangeSliderProps) {
  const display = format ? format(value) : value.toFixed(2);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <label className="text-sm font-medium">{label}</label>
        <span className="text-xs font-mono text-muted-foreground">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number.parseFloat(e.target.value))}
        data-testid={testId}
        aria-label={label}
        className="w-full"
      />
      {description && (
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      )}
    </div>
  );
}

import React, { useMemo } from "react";

// Controlled-prop variant of SoftmaxTemperature for use inside a quiz
// or lesson slide. The host owns the temperature value via `value`;
// the viz has no internal state. This is the adapter the slider quiz
// kind binds to.

interface Props {
  value: number;
  // Optional: highlight a target band so the learner has a visual goal.
  targetMin?: number;
  targetMax?: number;
  // Default label/logit fixtures match the wiki softmax page so this
  // looks familiar.
  labels?: string[];
  logits?: number[];
}

const DEFAULT_LABELS = ["cat", "dog", "bird", "fish", "tree"];
const DEFAULT_LOGITS = [2.5, 2.0, 1.5, 0.8, 0.3];

function softmax(logits: number[], temperature: number): number[] {
  const t = Math.max(temperature, 0.01);
  const scaled = logits.map((l) => l / t);
  const maxVal = Math.max(...scaled);
  const exps = scaled.map((s) => Math.exp(s - maxVal));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

export function SoftmaxTemperatureSlider({
  value,
  targetMin,
  targetMax,
  labels = DEFAULT_LABELS,
  logits = DEFAULT_LOGITS,
}: Props) {
  const probs = useMemo(() => softmax(logits, value), [logits, value]);
  const uniformHeight = 1 / labels.length;
  const maxProb = Math.max(...probs, uniformHeight);

  const inTarget =
    targetMin !== undefined && targetMax !== undefined
      ? value >= targetMin && value <= targetMax
      : null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2 text-sm">
        <span>
          T = <span className="font-mono font-medium">{value.toFixed(2)}</span>
        </span>
        {inTarget !== null && (
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              inTarget
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {inTarget ? "in target range" : "keep adjusting…"}
          </span>
        )}
      </div>

      <div className="text-xs text-muted-foreground mb-3">
        {value < 0.5
          ? "Sharp: the highest-logit token dominates."
          : value < 1.5
            ? "Moderate: balanced distribution."
            : value < 4
              ? "Smoother: lower-logit tokens are getting some mass."
              : "Flat: distribution is approaching uniform."}
      </div>

      <div className="flex items-end gap-2 h-44">
        {labels.map((label, i) => (
          <div key={label} className="flex-1 flex flex-col items-center gap-1 h-full">
            <span className="text-[10px] font-mono text-muted-foreground">
              {(probs[i] * 100).toFixed(1)}%
            </span>
            <div className="relative w-full flex-1">
              {/* Uniform reference line — what the bars would look like
                  if T → ∞. Helps the learner see "uniform" visually. */}
              <div
                className="absolute left-0 right-0 border-t border-dashed border-muted-foreground/40"
                style={{ bottom: `${(uniformHeight / maxProb) * 100}%` }}
              />
              <div
                className="absolute bottom-0 w-full rounded-t bg-primary transition-all duration-200"
                style={{ height: `${(probs[i] / maxProb) * 100}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-muted-foreground truncate w-full text-center">
              {label}
            </span>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-muted-foreground mt-1 text-center">
        Dashed line = uniform distribution ({(uniformHeight * 100).toFixed(1)}% per bar)
      </div>
    </div>
  );
}

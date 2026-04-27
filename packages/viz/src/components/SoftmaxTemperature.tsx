import React, { useState, useMemo } from "react";
import { BaseViz } from "./BaseViz";

interface SoftmaxTemperatureProps {
  labels?: string[];
  logits?: number[];
}

const DEFAULT_LABELS = ["cat", "dog", "bird", "fish", "tree", "car", "sun", "moon"];
const DEFAULT_LOGITS = [2.5, 2.0, 1.5, 0.8, 0.3, 0.1, -0.5, -1.0];

function softmax(logits: number[], temperature: number): number[] {
  const t = Math.max(temperature, 0.01);
  const scaled = logits.map((l) => l / t);
  const maxVal = Math.max(...scaled);
  const exps = scaled.map((s) => Math.exp(s - maxVal));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

export function SoftmaxTemperature({ labels: propLabels, logits: propLogits }: SoftmaxTemperatureProps) {
  const labels = propLabels || DEFAULT_LABELS;
  const logits = propLogits || DEFAULT_LOGITS;
  const [temperature, setTemperature] = useState(1.0);

  const probs = useMemo(() => softmax(logits, temperature), [logits, temperature]);
  const maxProb = Math.max(...probs);

  const handleReset = () => setTemperature(1.0);

  return (
    <BaseViz
      title="Softmax Temperature Explorer"
      description="Adjust temperature to see how the probability distribution changes"
      height={340}
      onReset={handleReset}
    >
      <div className="h-full flex flex-col p-4">
        {/* Temperature slider */}
        <div className="flex items-center gap-4 mb-4">
          <label className="text-sm font-medium whitespace-nowrap">
            T = <span className="font-mono">{temperature.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min="0.1"
            max="5"
            step="0.05"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="flex-1 accent-primary"
          />
          <div className="text-xs text-muted-foreground flex gap-3">
            <button onClick={() => setTemperature(0.1)} className="hover:text-foreground">Sharp</button>
            <button onClick={() => setTemperature(1.0)} className="hover:text-foreground">Normal</button>
            <button onClick={() => setTemperature(5.0)} className="hover:text-foreground">Flat</button>
          </div>
        </div>

        {/* Info text */}
        <div className="text-xs text-muted-foreground mb-3">
          {temperature < 0.5
            ? "Low temperature: distribution is sharp, highest-logit token dominates"
            : temperature < 1.5
            ? "Moderate temperature: balanced distribution"
            : "High temperature: distribution approaches uniform, more random sampling"}
        </div>

        {/* Bar chart */}
        <div className="flex-1 flex items-end gap-2">
          {labels.map((label, i) => (
            <div key={label} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] font-mono text-muted-foreground">
                {(probs[i] * 100).toFixed(1)}%
              </span>
              <div className="w-full relative" style={{ height: "180px" }}>
                <div
                  className="absolute bottom-0 w-full rounded-t transition-all duration-200"
                  style={{
                    height: `${(probs[i] / maxProb) * 100}%`,
                    backgroundColor: `hsl(${220 + i * 15}, 70%, ${50 + probs[i] * 20}%)`,
                    minHeight: "2px",
                  }}
                />
              </div>
              <span className="text-xs font-mono truncate w-full text-center">{label}</span>
              <span className="text-[9px] text-muted-foreground font-mono">
                {logits[i].toFixed(1)}
              </span>
            </div>
          ))}
        </div>

        {/* Entropy display */}
        <div className="mt-2 text-xs text-center text-muted-foreground">
          Entropy: <span className="font-mono">
            {(-probs.reduce((s, p) => s + (p > 0 ? p * Math.log2(p) : 0), 0)).toFixed(2)}
          </span> bits
          (max: {Math.log2(labels.length).toFixed(2)})
        </div>
      </div>
    </BaseViz>
  );
}

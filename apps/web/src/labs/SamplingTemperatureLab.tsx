// Lab — sampling temperature visualizer.
// The learner sees how a fixed logit distribution gets sharper or
// flatter as temperature changes, and a small generated stream of
// (deterministic, seeded) "samples" off the resulting distribution.

import { useEffect, useMemo, useState } from "react";
import type { LabProps } from "./registry";

const VOCAB = ["the", "cat", "sat", "on", "mat", "ran", "fast", "lazy"];
const LOGITS = [3.2, 2.4, 1.7, 1.2, 0.9, 0.6, 0.3, 0.1];

function softmax(scores: number[], temperature: number): number[] {
  const t = Math.max(0.01, temperature);
  const scaled = scores.map((s) => s / t);
  const max = Math.max(...scaled);
  const exps = scaled.map((s) => Math.exp(s - max));
  const sum = exps.reduce((s, x) => s + x, 0);
  return exps.map((x) => x / sum);
}

// Tiny seeded PRNG.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleFrom(probs: number[], rng: () => number): number {
  const r = rng();
  let acc = 0;
  for (let i = 0; i < probs.length; i++) {
    acc += probs[i];
    if (r <= acc) return i;
  }
  return probs.length - 1;
}

export function SamplingTemperatureLab({ onStateChange }: LabProps) {
  const [temperature, setTemperature] = useState(1.0);
  const [seed, setSeed] = useState(42);

  const probs = useMemo(() => softmax(LOGITS, temperature), [temperature]);
  const samples = useMemo(() => {
    const rng = mulberry32(seed);
    return Array.from({ length: 12 }, () => VOCAB[sampleFrom(probs, rng)]);
  }, [probs, seed]);
  const entropy = useMemo(
    () => -probs.reduce((s, p) => s + (p > 0 ? p * Math.log2(p) : 0), 0),
    [probs],
  );

  useEffect(() => {
    onStateChange?.({ temperature, samples, entropyBits: +entropy.toFixed(3) });
  }, [temperature, samples, entropy, onStateChange]);

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 my-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
        Lab · Sampling temperature
      </div>
      <label className="block mb-3">
        <span className="text-xs text-muted-foreground">
          Temperature: <span className="font-mono">{temperature.toFixed(2)}</span>
        </span>
        <input
          type="range"
          min={0.05}
          max={3}
          step={0.05}
          value={temperature}
          onChange={(e) => setTemperature(parseFloat(e.target.value))}
          className="w-full mt-1"
        />
      </label>
      <div className="text-xs text-muted-foreground mb-2">
        Entropy: {entropy.toFixed(2)} bits
      </div>
      <div className="space-y-1 mb-3">
        {VOCAB.map((tok, i) => (
          <div key={tok} className="grid grid-cols-[4rem_1fr_3rem] gap-2 text-xs items-center">
            <span className="font-mono text-foreground">{tok}</span>
            <div className="bg-muted rounded h-4 overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${probs[i] * 100}%` }}
              />
            </div>
            <span className="font-mono text-muted-foreground tabular-nums text-right">
              {(probs[i] * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 items-center">
        <button
          type="button"
          onClick={() => setSeed(seed + 1)}
          className="text-xs px-2 py-1 rounded border border-border hover:bg-accent/40 mr-2"
        >
          Re-roll
        </button>
        {samples.map((t, i) => (
          <span
            key={i}
            className="text-xs px-1.5 py-0.5 rounded bg-background border border-border font-mono"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

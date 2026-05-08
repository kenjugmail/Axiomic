// Lab — attention weights playground.
// The learner edits a token sequence + a query token and watches
// softmax(QK^T / sqrt(d)) attention weights update in real-time. Tiny
// inline implementation so the lab is self-contained.

import { useEffect, useMemo, useState } from "react";
import type { LabProps } from "./registry";

const DEFAULT_TOKENS = ["the", "cat", "sat", "on", "the", "mat"];
const DIM = 8;

// Deterministic pseudo-embedding from a token string (so the same word
// always lands at the same vector). Hashing trick — not the right
// embedding for a real model but lets the lab show the mechanism.
function tokenEmbed(token: string, dim: number): number[] {
  const v = new Array(dim).fill(0);
  let h = 0x811c9dc5 | 0;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  for (let i = 0; i < dim; i++) {
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    v[i] = (((h >>> 0) % 2000) / 1000) - 1; // range [-1, 1)
  }
  // L2 normalize so cosine-y similarity is comparable.
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return v.map((x) => x / norm);
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function softmax(scores: number[]): number[] {
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max));
  const sum = exps.reduce((s, x) => s + x, 0);
  return exps.map((x) => x / sum);
}

export function AttentionWeightsLab({ onStateChange }: LabProps) {
  const [text, setText] = useState(DEFAULT_TOKENS.join(" "));
  const [queryIdx, setQueryIdx] = useState(0);
  const tokens = useMemo(
    () => text.trim().split(/\s+/).filter(Boolean).slice(0, 16),
    [text],
  );

  const weights = useMemo(() => {
    if (tokens.length === 0) return [];
    const embeds = tokens.map((t) => tokenEmbed(t, DIM));
    const q = embeds[Math.min(queryIdx, embeds.length - 1)];
    const scale = Math.sqrt(DIM);
    const scores = embeds.map((k) => dot(q, k) / scale);
    return softmax(scores);
  }, [tokens, queryIdx]);

  useEffect(() => {
    onStateChange?.({
      tokens,
      queryIdx,
      weights: weights.map((w) => +w.toFixed(4)),
    });
  }, [tokens, queryIdx, weights, onStateChange]);

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 my-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
        Lab · Attention weights
      </div>
      <label className="block mb-3">
        <span className="text-xs text-muted-foreground">Tokens (space-separated)</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full mt-1 text-sm px-3 py-1.5 rounded-md border border-border bg-background font-mono"
        />
      </label>
      <label className="block mb-3">
        <span className="text-xs text-muted-foreground">
          Query token: <span className="font-mono text-foreground">{tokens[queryIdx] ?? "—"}</span>
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(0, tokens.length - 1)}
          value={Math.min(queryIdx, tokens.length - 1)}
          onChange={(e) => setQueryIdx(parseInt(e.target.value, 10))}
          className="w-full mt-1"
        />
      </label>
      <div className="grid grid-cols-[auto_1fr_3rem] gap-x-2 gap-y-1 text-xs">
        {tokens.map((t, i) => (
          <div key={i} className="contents">
            <span
              className={`font-mono px-1.5 py-0.5 rounded ${
                i === queryIdx
                  ? "bg-primary/15 text-primary"
                  : "bg-background border border-border"
              }`}
            >
              {t}
            </span>
            <div className="bg-muted rounded h-5 overflow-hidden self-center">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${(weights[i] ?? 0) * 100}%` }}
              />
            </div>
            <span className="font-mono text-muted-foreground tabular-nums text-right">
              {((weights[i] ?? 0) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

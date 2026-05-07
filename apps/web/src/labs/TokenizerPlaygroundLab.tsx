// Lab — tokenizer playground.
// Whitespace-split + simple BPE-ish merge counting, just for
// demonstration. The learner watches token count drop as merges grow.

import { useEffect, useMemo, useState } from "react";
import type { LabProps } from "./registry";

function tokenizeWhitespace(text: string): string[] {
  return text
    .toLowerCase()
    .split(/(\s+)/g)
    .filter((s) => s.length > 0 && !/^\s+$/.test(s));
}

// Toy BPE: count adjacent character pairs, merge most frequent N times.
function bpeishTokens(text: string, merges: number): string[] {
  const words = tokenizeWhitespace(text);
  let chunks: string[][] = words.map((w) => Array.from(w));
  for (let step = 0; step < merges; step++) {
    const pairCounts = new Map<string, number>();
    for (const w of chunks) {
      for (let i = 0; i < w.length - 1; i++) {
        const k = w[i] + "" + w[i + 1];
        pairCounts.set(k, (pairCounts.get(k) ?? 0) + 1);
      }
    }
    if (pairCounts.size === 0) break;
    let best = "";
    let bestCount = 0;
    for (const [k, c] of pairCounts) {
      if (c > bestCount) {
        best = k;
        bestCount = c;
      }
    }
    if (bestCount < 2) break;
    const [a, b] = best.split("");
    chunks = chunks.map((w) => {
      const out: string[] = [];
      for (let i = 0; i < w.length; i++) {
        if (i + 1 < w.length && w[i] === a && w[i + 1] === b) {
          out.push(a + b);
          i++;
        } else {
          out.push(w[i]);
        }
      }
      return out;
    });
  }
  return chunks.flat();
}

export function TokenizerPlaygroundLab({ onStateChange }: LabProps) {
  const [text, setText] = useState(
    "the quick brown fox jumps over the lazy dog. the cat sat on the mat. the dog ran fast.",
  );
  const [merges, setMerges] = useState(20);

  const tokens = useMemo(() => bpeishTokens(text, merges), [text, merges]);
  const charCount = useMemo(() => text.replace(/\s+/g, "").length, [text]);

  useEffect(() => {
    onStateChange?.({
      merges,
      tokenCount: tokens.length,
      charCount,
      compressionRatio: charCount === 0 ? 0 : tokens.length / charCount,
    });
  }, [tokens.length, charCount, merges, onStateChange]);

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 my-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
        Lab · Tokenizer playground
      </div>
      <label className="block mb-3">
        <span className="text-xs text-muted-foreground">Input text</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="w-full mt-1 text-sm px-3 py-1.5 rounded-md border border-border bg-background font-mono"
        />
      </label>
      <label className="block mb-3">
        <span className="text-xs text-muted-foreground">
          Merges: <span className="font-mono">{merges}</span>
        </span>
        <input
          type="range"
          min={0}
          max={80}
          value={merges}
          onChange={(e) => setMerges(parseInt(e.target.value, 10))}
          className="w-full mt-1"
        />
      </label>
      <div className="text-xs text-muted-foreground mb-2">
        {tokens.length} tokens · {charCount} chars · ratio{" "}
        {((tokens.length / Math.max(1, charCount)) * 100).toFixed(0)}%
      </div>
      <div className="flex flex-wrap gap-1">
        {tokens.map((t, i) => (
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

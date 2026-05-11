import React, { useState, useMemo } from "react";
import { BaseViz } from "./BaseViz";

// Simple BPE-like tokenizer simulation
const COMMON_MERGES: [string, string][] = [
  ["t", "h"], ["th", "e"], ["i", "n"], ["a", "n"], ["e", "r"],
  ["o", "n"], ["r", "e"], ["a", "t"], ["e", "n"], ["i", "s"],
  ["o", "r"], ["t", "i"], ["a", "l"], ["i", "t"], ["s", "t"],
  ["in", "g"], ["th", "at"], ["the", " "], ["er", "s"],
  ["at", "ion"], [" t", "he"], ["an", "d"], [" a", "nd"],
];

const COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#84cc16", "#6366f1",
  "#14b8a6", "#e11d48", "#0ea5e9", "#a855f7", "#eab308",
];

function simpleTokenize(text: string): string[] {
  // Start with characters
  let tokens = text.split("");

  // Apply BPE merges
  for (const [a, b] of COMMON_MERGES) {
    const newTokens: string[] = [];
    let i = 0;
    while (i < tokens.length) {
      if (i < tokens.length - 1) {
        const combined = tokens[i] + tokens[i + 1];
        if (tokens[i] === a && tokens[i + 1] === b) {
          newTokens.push(combined);
          i += 2;
          continue;
        }
      }
      newTokens.push(tokens[i]);
      i++;
    }
    tokens = newTokens;
  }

  return tokens;
}

export function TokenizerPlayground() {
  const [text, setText] = useState("The transformer architecture revolutionized natural language processing");
  const tokens = useMemo(() => simpleTokenize(text), [text]);

  const handleReset = () => {
    setText("The transformer architecture revolutionized natural language processing");
  };

  return (
    <BaseViz
      title="Tokenizer Playground"
      description="Type text to see how BPE-like tokenization breaks it into subword tokens"
      height={320}
      onReset={handleReset}
    >
      <div className="h-full flex flex-col p-4">
        {/* Input */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type some text..."
          rows={2}
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring mb-3"
        />

        {/* Stats */}
        <div className="flex gap-4 text-xs text-muted-foreground mb-3">
          <span>Characters: <span className="font-mono font-medium text-foreground">{text.length}</span></span>
          <span>Tokens: <span className="font-mono font-medium text-foreground">{tokens.length}</span></span>
          <span>
            Ratio: <span className="font-mono font-medium text-foreground">
              {text.length > 0 ? (text.length / tokens.length).toFixed(1) : "0"} chars/token
            </span>
          </span>
        </div>

        {/* Token display */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-wrap gap-1">
            {tokens.map((token, i) => (
              <span
                key={i}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono border"
                style={{
                  backgroundColor: `${COLORS[i % COLORS.length]}15`,
                  borderColor: `${COLORS[i % COLORS.length]}40`,
                  color: COLORS[i % COLORS.length],
                }}
                title={`Token ${i}: "${token}" (${token.length} chars)`}
              >
                {token.replace(/ /g, "\u00B7")}
              </span>
            ))}
          </div>

          {/* Token IDs (simulated) */}
          <div className="mt-3 text-xs text-muted-foreground">
            <span className="font-medium">Token IDs:</span>{" "}
            <span className="font-mono">
              [{tokens.map((t, _i) => {
                // Simple hash for token ID
                let hash = 0;
                for (let j = 0; j < t.length; j++) hash = ((hash << 5) - hash + t.charCodeAt(j)) | 0;
                return Math.abs(hash) % 50000;
              }).join(", ")}]
            </span>
          </div>
        </div>
      </div>
    </BaseViz>
  );
}

import React from "react";

// Controlled-prop attention heatmap with three preset sentences and
// hand-authored attention matrices that illustrate clear linguistic
// patterns. Used in lessons (where the host steps through presets) and
// available for embedding in wiki pages.
//
// We don't run a real model in the browser — these matrices are
// illustrative fixtures designed so each one shows a recognizable
// pattern (subject-verb agreement, locality bias, pronoun resolution).

interface Props {
  presetIndex: number;
  // Optional: filter to a single attention head's matrix instead of
  // averaging across heads. Defaults to averaged view.
  highlightCell?: { row: number; col: number };
}

interface Preset {
  title: string;
  description: string;
  tokens: string[];
  // Square matrix: matrix[i][j] = how strongly token i attends to token j.
  matrix: number[][];
}

const PRESETS: Preset[] = [
  {
    title: "Subject-verb agreement",
    description: "The verb attends to its subject several tokens back.",
    tokens: ["The", "cats", "on", "the", "mat", "are", "sleeping"],
    matrix: [
      [0.9, 0.05, 0.0, 0.0, 0.0, 0.0, 0.05],
      [0.4, 0.5, 0.05, 0.0, 0.0, 0.0, 0.05],
      [0.05, 0.6, 0.3, 0.0, 0.0, 0.0, 0.05],
      [0.05, 0.4, 0.1, 0.4, 0.0, 0.0, 0.05],
      [0.05, 0.4, 0.05, 0.1, 0.35, 0.0, 0.05],
      [0.0, 0.7, 0.0, 0.0, 0.05, 0.2, 0.05],
      [0.0, 0.45, 0.05, 0.0, 0.0, 0.45, 0.05],
    ],
  },
  {
    title: "Locality bias",
    description: "Each token attends mostly to its immediate neighbors.",
    tokens: ["one", "two", "three", "four", "five", "six", "seven"],
    matrix: [
      [0.6, 0.3, 0.05, 0.02, 0.01, 0.01, 0.01],
      [0.3, 0.4, 0.25, 0.03, 0.01, 0.005, 0.005],
      [0.05, 0.3, 0.4, 0.2, 0.04, 0.005, 0.005],
      [0.02, 0.05, 0.3, 0.4, 0.2, 0.02, 0.01],
      [0.01, 0.02, 0.05, 0.3, 0.4, 0.2, 0.02],
      [0.005, 0.005, 0.02, 0.05, 0.3, 0.4, 0.22],
      [0.01, 0.01, 0.01, 0.02, 0.05, 0.3, 0.6],
    ],
  },
  {
    title: "Pronoun resolution",
    description: "The pronoun \"she\" attends back to its antecedent.",
    tokens: ["Maria", "told", "Bob", "that", "she", "was", "leaving"],
    matrix: [
      [0.8, 0.1, 0.05, 0.0, 0.0, 0.0, 0.05],
      [0.4, 0.4, 0.1, 0.05, 0.0, 0.0, 0.05],
      [0.1, 0.4, 0.4, 0.05, 0.0, 0.0, 0.05],
      [0.1, 0.2, 0.3, 0.3, 0.0, 0.0, 0.1],
      [0.7, 0.05, 0.05, 0.05, 0.1, 0.0, 0.05],
      [0.4, 0.05, 0.05, 0.05, 0.4, 0.05, 0.0],
      [0.4, 0.1, 0.05, 0.05, 0.3, 0.05, 0.05],
    ],
  },
];

export function AttentionHeatmapExplorer({ presetIndex, highlightCell }: Props) {
  const preset = PRESETS[Math.max(0, Math.min(PRESETS.length - 1, presetIndex))];
  const { tokens, matrix } = preset;
  const cellSize = 36;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2">
        <div className="text-sm font-medium">{preset.title}</div>
        <div className="text-xs text-muted-foreground">{preset.description}</div>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-block">
          {/* Column labels (key tokens) */}
          <div className="flex" style={{ marginLeft: cellSize + 4 }}>
            {tokens.map((t, j) => (
              <div
                key={j}
                className="text-[10px] font-mono text-muted-foreground text-center"
                style={{ width: cellSize, transform: "rotate(-45deg)", transformOrigin: "left bottom", height: cellSize, paddingLeft: 4 }}
              >
                {t}
              </div>
            ))}
          </div>
          {/* Rows (query tokens) */}
          {matrix.map((row, i) => (
            <div key={i} className="flex items-center mt-px">
              <div
                className="text-[10px] font-mono text-muted-foreground text-right pr-1"
                style={{ width: cellSize }}
              >
                {tokens[i]}
              </div>
              {row.map((v, j) => {
                const isHighlighted =
                  highlightCell?.row === i && highlightCell?.col === j;
                const intensity = Math.min(1, v * 1.5);
                return (
                  <div
                    key={j}
                    title={`${tokens[i]} → ${tokens[j]}: ${v.toFixed(2)}`}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: `rgba(99, 102, 241, ${intensity})`,
                      outline: isHighlighted
                        ? "2px solid var(--ring, #f59e0b)"
                        : undefined,
                    }}
                    className="text-[10px] font-mono flex items-center justify-center text-foreground/70"
                  >
                    {v >= 0.3 ? v.toFixed(1) : ""}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground mt-2">
        Rows are queries (each token's view); columns are keys (what each
        token can attend to). Brighter = stronger attention.
      </div>
    </div>
  );
}

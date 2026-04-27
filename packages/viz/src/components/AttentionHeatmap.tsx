import React, { useState, useRef, useEffect, useCallback } from "react";
import * as d3 from "d3";
import { BaseViz } from "./BaseViz";

interface AttentionHeatmapProps {
  tokens?: string[];
  weights?: number[][];
}

const DEFAULT_TOKENS = ["The", "cat", "sat", "on", "the", "mat", "and", "looked", "around"];

function generateAttentionWeights(n: number): number[][] {
  const weights: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      // Create realistic-looking patterns: tokens attend to themselves and nearby tokens
      let w = Math.random() * 0.1;
      if (i === j) w += 0.3 + Math.random() * 0.3; // self-attention
      if (Math.abs(i - j) === 1) w += 0.1 + Math.random() * 0.15; // adjacent
      if (j === 0) w += 0.05 + Math.random() * 0.1; // attend to first token
      row.push(w);
    }
    // Normalize (softmax-like)
    const sum = row.reduce((a, b) => a + b, 0);
    weights.push(row.map((v) => v / sum));
  }
  return weights;
}

export function AttentionHeatmap({ tokens: propTokens, weights: propWeights }: AttentionHeatmapProps) {
  const tokens = propTokens || DEFAULT_TOKENS;
  const [weights, setWeights] = useState(() => propWeights || generateAttentionWeights(tokens.length));
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const margin = { top: 80, right: 20, bottom: 20, left: 80 };
  const cellSize = 45;
  const width = margin.left + margin.right + tokens.length * cellSize;
  const height = margin.top + margin.bottom + tokens.length * cellSize;

  const colorScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, 1]);

  const handleReset = useCallback(() => {
    setWeights(generateAttentionWeights(tokens.length));
    setHoveredCell(null);
  }, [tokens.length]);

  return (
    <BaseViz
      title="Attention Weight Heatmap"
      description="Hover over cells to see attention weights between token pairs"
      height={height}
      onReset={handleReset}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        className="select-none"
      >
        {/* Column labels (keys) */}
        {tokens.map((token, j) => (
          <text
            key={`col-${j}`}
            x={margin.left + j * cellSize + cellSize / 2}
            y={margin.top - 10}
            textAnchor="middle"
            className="text-xs fill-foreground font-mono"
            style={{ fontSize: 11 }}
            opacity={hoveredCell ? (hoveredCell.col === j ? 1 : 0.3) : 1}
          >
            {token}
          </text>
        ))}

        {/* Row labels (queries) */}
        {tokens.map((token, i) => (
          <text
            key={`row-${i}`}
            x={margin.left - 10}
            y={margin.top + i * cellSize + cellSize / 2 + 4}
            textAnchor="end"
            className="text-xs fill-foreground font-mono"
            style={{ fontSize: 11 }}
            opacity={hoveredCell ? (hoveredCell.row === i ? 1 : 0.3) : 1}
          >
            {token}
          </text>
        ))}

        {/* Cells */}
        {weights.map((row, i) =>
          row.map((w, j) => (
            <g key={`${i}-${j}`}>
              <rect
                x={margin.left + j * cellSize}
                y={margin.top + i * cellSize}
                width={cellSize - 2}
                height={cellSize - 2}
                fill={colorScale(w)}
                rx={3}
                opacity={
                  hoveredCell
                    ? hoveredCell.row === i && hoveredCell.col === j
                      ? 1
                      : hoveredCell.row === i || hoveredCell.col === j
                      ? 0.7
                      : 0.2
                    : 0.9
                }
                stroke={hoveredCell?.row === i && hoveredCell?.col === j ? "hsl(var(--foreground))" : "none"}
                strokeWidth={2}
                onMouseEnter={() => setHoveredCell({ row: i, col: j })}
                onMouseLeave={() => setHoveredCell(null)}
                style={{ cursor: "pointer", transition: "opacity 0.15s" }}
              />
              <text
                x={margin.left + j * cellSize + cellSize / 2 - 1}
                y={margin.top + i * cellSize + cellSize / 2 + 4}
                textAnchor="middle"
                fill={w > 0.5 ? "white" : "black"}
                style={{ fontSize: 10, fontFamily: "monospace", pointerEvents: "none" }}
              >
                {w.toFixed(2)}
              </text>
            </g>
          ))
        )}

        {/* Labels */}
        <text x={width / 2} y={15} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 11 }}>
          Keys (attending to)
        </text>
        <text
          x={15}
          y={height / 2}
          textAnchor="middle"
          transform={`rotate(-90, 15, ${height / 2})`}
          className="fill-muted-foreground"
          style={{ fontSize: 11 }}
        >
          Queries (attending from)
        </text>
      </svg>

      {/* Tooltip */}
      {hoveredCell && (
        <div className="absolute bottom-2 left-2 bg-card border border-border rounded-md px-2 py-1 text-xs shadow-md">
          <span className="font-mono font-medium">"{tokens[hoveredCell.row]}"</span>
          <span className="text-muted-foreground mx-1">attends to</span>
          <span className="font-mono font-medium">"{tokens[hoveredCell.col]}"</span>
          <span className="text-muted-foreground mx-1">with weight</span>
          <span className="font-mono font-bold">{weights[hoveredCell.row][hoveredCell.col].toFixed(3)}</span>
        </div>
      )}
    </BaseViz>
  );
}

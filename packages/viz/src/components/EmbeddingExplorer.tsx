import React, { useState, useRef, useEffect, useCallback } from "react";
import { BaseViz } from "./BaseViz";

interface Point {
  word: string;
  x: number;
  y: number;
  z: number;
  category: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  animals: "#3b82f6",
  colors: "#ef4444",
  actions: "#22c55e",
  objects: "#f59e0b",
  concepts: "#8b5cf6",
};

// Simulated 3D embeddings projected to 2D (like PCA/t-SNE output)
const WORDS: Point[] = [
  { word: "cat", x: 2.1, y: 1.8, z: 0.5, category: "animals" },
  { word: "dog", x: 2.5, y: 1.5, z: 0.3, category: "animals" },
  { word: "bird", x: 1.8, y: 2.3, z: 0.8, category: "animals" },
  { word: "fish", x: 1.5, y: 2.8, z: 1.1, category: "animals" },
  { word: "horse", x: 2.8, y: 1.2, z: 0.1, category: "animals" },
  { word: "red", x: -2.0, y: -1.5, z: 0.2, category: "colors" },
  { word: "blue", x: -1.8, y: -1.8, z: 0.4, category: "colors" },
  { word: "green", x: -2.3, y: -1.2, z: 0.6, category: "colors" },
  { word: "yellow", x: -1.5, y: -2.1, z: 0.3, category: "colors" },
  { word: "run", x: 0.3, y: -2.5, z: -1.0, category: "actions" },
  { word: "walk", x: 0.5, y: -2.2, z: -0.8, category: "actions" },
  { word: "jump", x: 0.1, y: -2.8, z: -1.2, category: "actions" },
  { word: "swim", x: -0.2, y: -2.4, z: -0.5, category: "actions" },
  { word: "table", x: -0.5, y: 1.0, z: -2.0, category: "objects" },
  { word: "chair", x: -0.3, y: 0.8, z: -2.2, category: "objects" },
  { word: "book", x: -0.8, y: 1.3, z: -1.8, category: "objects" },
  { word: "king", x: 1.0, y: -0.5, z: 2.5, category: "concepts" },
  { word: "queen", x: 0.8, y: -0.3, z: 2.3, category: "concepts" },
  { word: "man", x: 1.2, y: -0.8, z: 2.0, category: "concepts" },
  { word: "woman", x: 0.6, y: -0.1, z: 1.8, category: "concepts" },
];

export function EmbeddingExplorer() {
  const [rotation, setRotation] = useState({ x: 0.3, y: 0.5 });
  const [dragging, setDragging] = useState(false);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  const [hoveredWord, setHoveredWord] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const width = 560;
  const height = 340;
  const cx = width / 2;
  const cy = height / 2;
  const scale = 50;

  // Project 3D to 2D with rotation
  function project(p: Point): { x: number; y: number; depth: number } {
    const cosY = Math.cos(rotation.y), sinY = Math.sin(rotation.y);
    const cosX = Math.cos(rotation.x), sinX = Math.sin(rotation.x);

    // Rotate around Y axis
    const x1 = p.x * cosY - p.z * sinY;
    const z1 = p.x * sinY + p.z * cosY;
    // Rotate around X axis
    const y1 = p.y * cosX - z1 * sinX;
    const z2 = p.y * sinX + z1 * cosX;

    return {
      x: cx + x1 * scale,
      y: cy - y1 * scale,
      depth: z2,
    };
  }

  const projected = WORDS.map((w) => ({ ...w, ...project(w) }))
    .sort((a, b) => a.depth - b.depth);

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    setLastMouse({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastMouse.x;
    const dy = e.clientY - lastMouse.y;
    setRotation((r) => ({
      x: r.x + dy * 0.005,
      y: r.y + dx * 0.005,
    }));
    setLastMouse({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => setDragging(false);

  const handleReset = useCallback(() => {
    setRotation({ x: 0.3, y: 0.5 });
    setHoveredWord(null);
    setSelectedCategory(null);
  }, []);

  return (
    <BaseViz
      title="Embedding Space Explorer"
      description="Drag to rotate. Semantically similar words cluster together."
      height={height + 60}
      onReset={handleReset}
    >
      <div className="h-full flex flex-col" ref={containerRef}>
        {/* Category filter */}
        <div className="flex gap-2 px-4 pt-2">
          {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              className={`px-2 py-0.5 rounded-full text-xs capitalize border transition-colors`}
              style={{
                borderColor: color,
                backgroundColor: selectedCategory === cat ? color : "transparent",
                color: selectedCategory === cat ? "white" : color,
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* 3D scatter */}
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: dragging ? "grabbing" : "grab" }}
        >
          {/* Axes */}
          <line x1={cx - 100} y1={cy} x2={cx + 100} y2={cy} stroke="hsl(var(--border))" strokeWidth={0.5} />
          <line x1={cx} y1={cy - 100} x2={cx} y2={cy + 100} stroke="hsl(var(--border))" strokeWidth={0.5} />

          {/* Points */}
          {projected.map((p) => {
            const isHighlighted = !selectedCategory || p.category === selectedCategory;
            const isHovered = hoveredWord === p.word;
            const r = isHovered ? 7 : 5;
            const opacity = isHighlighted ? (isHovered ? 1 : 0.8) : 0.15;

            return (
              <g key={p.word}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  fill={CATEGORY_COLORS[p.category]}
                  opacity={opacity}
                  onMouseEnter={() => setHoveredWord(p.word)}
                  onMouseLeave={() => setHoveredWord(null)}
                  style={{ cursor: "pointer", transition: "r 0.15s, opacity 0.15s" }}
                />
                {(isHovered || (isHighlighted && !selectedCategory)) && (
                  <text
                    x={p.x + 8}
                    y={p.y + 3}
                    className="fill-foreground"
                    style={{ fontSize: isHovered ? 12 : 9, fontFamily: "monospace" }}
                    opacity={opacity}
                  >
                    {p.word}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </BaseViz>
  );
}

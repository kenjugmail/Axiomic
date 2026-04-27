import React, { useState, useMemo } from "react";
import { BaseViz } from "./BaseViz";

export function PositionalEncoding() {
  const [maxPos, setMaxPos] = useState(50);
  const [dims, setDims] = useState(64);
  const [hoveredPos, setHoveredPos] = useState<number | null>(null);
  const [hoveredDim, setHoveredDim] = useState<number | null>(null);

  const encoding = useMemo(() => {
    const pe: number[][] = [];
    for (let pos = 0; pos < maxPos; pos++) {
      const row: number[] = [];
      for (let d = 0; d < dims; d++) {
        const i = Math.floor(d / 2);
        const freq = 1 / Math.pow(10000, (2 * i) / dims);
        if (d % 2 === 0) {
          row.push(Math.sin(pos * freq));
        } else {
          row.push(Math.cos(pos * freq));
        }
      }
      pe.push(row);
    }
    return pe;
  }, [maxPos, dims]);

  const handleReset = () => {
    setMaxPos(50);
    setDims(64);
    setHoveredPos(null);
    setHoveredDim(null);
  };

  const cellW = Math.max(3, Math.min(10, 500 / dims));
  const cellH = Math.max(3, Math.min(8, 280 / maxPos));

  return (
    <BaseViz
      title="Positional Encoding Visualization"
      description="Sinusoidal position encodings — each row is a position, each column is a dimension"
      height={400}
      onReset={handleReset}
    >
      <div className="h-full flex flex-col p-4">
        {/* Controls */}
        <div className="flex gap-6 mb-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium">Positions:</label>
            <input
              type="range"
              min="10"
              max="128"
              value={maxPos}
              onChange={(e) => setMaxPos(parseInt(e.target.value))}
              className="w-24 accent-primary"
            />
            <span className="text-xs font-mono w-8">{maxPos}</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium">Dimensions:</label>
            <input
              type="range"
              min="16"
              max="256"
              step="16"
              value={dims}
              onChange={(e) => setDims(parseInt(e.target.value))}
              className="w-24 accent-primary"
            />
            <span className="text-xs font-mono w-8">{dims}</span>
          </div>
        </div>

        {/* Heatmap */}
        <div className="flex-1 overflow-hidden">
          <svg
            width={cellW * dims + 60}
            height={cellH * maxPos + 20}
            viewBox={`0 0 ${cellW * dims + 60} ${cellH * maxPos + 20}`}
            className="w-full h-full"
            preserveAspectRatio="xMinYMin meet"
          >
            {encoding.map((row, pos) =>
              row.map((val, dim) => (
                <rect
                  key={`${pos}-${dim}`}
                  x={30 + dim * cellW}
                  y={pos * cellH}
                  width={cellW - 0.5}
                  height={cellH - 0.5}
                  fill={val > 0
                    ? `rgba(59, 130, 246, ${Math.abs(val)})`
                    : `rgba(239, 68, 68, ${Math.abs(val)})`
                  }
                  opacity={
                    hoveredPos !== null || hoveredDim !== null
                      ? (hoveredPos === pos || hoveredDim === dim ? 1 : 0.3)
                      : 1
                  }
                  onMouseEnter={() => { setHoveredPos(pos); setHoveredDim(dim); }}
                  onMouseLeave={() => { setHoveredPos(null); setHoveredDim(null); }}
                  style={{ cursor: "crosshair" }}
                />
              ))
            )}
            {/* Y-axis labels */}
            {[0, Math.floor(maxPos / 4), Math.floor(maxPos / 2), Math.floor(3 * maxPos / 4), maxPos - 1].map((p) => (
              <text key={p} x={25} y={p * cellH + cellH / 2 + 3} textAnchor="end" style={{ fontSize: 8 }} className="fill-muted-foreground">
                {p}
              </text>
            ))}
          </svg>
        </div>

        {/* Info bar */}
        <div className="flex justify-between items-center mt-1 text-xs text-muted-foreground">
          <div>
            <span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ background: "rgba(59, 130, 246, 0.8)" }} /> sin (positive)
            <span className="inline-block w-3 h-3 rounded-sm mx-1 ml-3" style={{ background: "rgba(239, 68, 68, 0.8)" }} /> cos (negative)
          </div>
          {hoveredPos !== null && hoveredDim !== null && (
            <span className="font-mono">
              pos={hoveredPos}, dim={hoveredDim}: {encoding[hoveredPos][hoveredDim].toFixed(4)}
            </span>
          )}
        </div>
      </div>
    </BaseViz>
  );
}

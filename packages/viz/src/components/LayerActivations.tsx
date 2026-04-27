import React, { useState, useMemo } from "react";
import { BaseViz } from "./BaseViz";

export function LayerActivations() {
  const [currentLayer, setCurrentLayer] = useState(0);
  const totalLayers = 12;
  const tokens = ["The", "cat", "sat", "on", "the", "mat"];
  const dims = 32; // Show 32 dimensions

  // Generate activations that evolve through layers
  const activations = useMemo(() => {
    const layers: number[][][] = [];
    // Initialize with "input embeddings"
    const initial: number[][] = tokens.map((_, ti) => {
      return Array.from({ length: dims }, (_, di) => {
        // Deterministic but interesting starting pattern
        return Math.sin(ti * 1.7 + di * 0.3) * 0.5 + Math.cos(ti * 0.8 - di * 0.5) * 0.3;
      });
    });
    layers.push(initial);

    // Each layer adds some transformation
    for (let l = 1; l <= totalLayers; l++) {
      const prev = layers[l - 1];
      const next = prev.map((tokenActivs, ti) =>
        tokenActivs.map((val, di) => {
          // Simulate attention mixing: tokens become more similar
          const neighborVal = prev[(ti + 1) % tokens.length][di];
          const mixed = val * 0.7 + neighborVal * 0.3;
          // Add nonlinearity
          const transformed = Math.tanh(mixed + Math.sin(l * 0.5 + di * 0.2) * 0.1 * l);
          // Later layers create sharper patterns
          return transformed * (1 + l * 0.05);
        })
      );
      layers.push(next);
    }
    return layers;
  }, []);

  const currentActivs = activations[currentLayer];
  const maxVal = Math.max(...currentActivs.flat().map(Math.abs));

  return (
    <BaseViz
      title="Layer-by-Layer Activation Viewer"
      description="Slide through transformer layers to see how token representations evolve"
      height={360}
      onReset={() => setCurrentLayer(0)}
    >
      <div className="h-full flex flex-col p-4">
        {/* Layer slider */}
        <div className="flex items-center gap-4 mb-3">
          <label className="text-sm font-medium whitespace-nowrap">
            Layer <span className="font-mono">{currentLayer}</span> / {totalLayers}
          </label>
          <input
            type="range"
            min="0"
            max={totalLayers}
            value={currentLayer}
            onChange={(e) => setCurrentLayer(parseInt(e.target.value))}
            className="flex-1 accent-primary"
          />
          <div className="text-xs text-muted-foreground">
            {currentLayer === 0 ? "Input" : currentLayer === totalLayers ? "Output" : "Hidden"}
          </div>
        </div>

        {/* Heatmap */}
        <div className="flex-1 flex gap-2">
          {/* Token labels */}
          <div className="flex flex-col justify-around py-1">
            {tokens.map((t, i) => (
              <span key={i} className="text-xs font-mono text-right pr-1 leading-none">{t}</span>
            ))}
          </div>

          {/* Grid */}
          <div className="flex-1">
            <svg width="100%" height="100%" viewBox={`0 0 ${dims * 12} ${tokens.length * 35}`} preserveAspectRatio="xMinYMin meet">
              {currentActivs.map((tokenActivs, ti) =>
                tokenActivs.map((val, di) => (
                  <rect
                    key={`${ti}-${di}`}
                    x={di * 12}
                    y={ti * 35}
                    width={11}
                    height={33}
                    rx={1}
                    fill={val > 0
                      ? `rgba(59, 130, 246, ${Math.min(Math.abs(val) / maxVal, 1)})`
                      : `rgba(239, 68, 68, ${Math.min(Math.abs(val) / maxVal, 1)})`
                    }
                  />
                ))
              )}
            </svg>
          </div>
        </div>

        {/* Legend and stats */}
        <div className="flex justify-between items-center mt-2 text-xs text-muted-foreground">
          <div>
            <span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ background: "rgba(59, 130, 246, 0.8)" }} /> Positive
            <span className="inline-block w-3 h-3 rounded-sm mx-1 ml-3" style={{ background: "rgba(239, 68, 68, 0.8)" }} /> Negative
          </div>
          <div className="font-mono">
            L2 norm: {Math.sqrt(currentActivs.flat().reduce((s, v) => s + v * v, 0)).toFixed(2)}
          </div>
        </div>
      </div>
    </BaseViz>
  );
}

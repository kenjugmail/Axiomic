import { useState } from "react";

// Side-by-side ReLU / GELU / Sigmoid / Tanh in pure SVG. The four
// mini-plots share a single input slider; each marks where its function
// evaluates so the user can compare shapes interactively.

const FUNCTIONS: Array<{
  name: string;
  fn: (x: number) => number;
  yMin: number;
  yMax: number;
}> = [
  { name: "ReLU", fn: (x) => Math.max(0, x), yMin: -0.5, yMax: 4 },
  {
    name: "GELU",
    // GELU approximation (Hendrycks & Gimpel) — close enough for plotting.
    fn: (x) => 0.5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x ** 3))),
    yMin: -0.5,
    yMax: 4,
  },
  { name: "Sigmoid", fn: (x) => 1 / (1 + Math.exp(-x)), yMin: -0.1, yMax: 1.1 },
  { name: "Tanh", fn: (x) => Math.tanh(x), yMin: -1.1, yMax: 1.1 },
];

const X_MIN = -4;
const X_MAX = 4;
const W = 140;
const H = 90;
const PAD = 8;

function pathFor(fn: (x: number) => number, yMin: number, yMax: number): string {
  const steps = 60;
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = X_MIN + ((X_MAX - X_MIN) * i) / steps;
    const y = fn(x);
    const sx = PAD + ((x - X_MIN) / (X_MAX - X_MIN)) * (W - 2 * PAD);
    const sy = H - PAD - ((y - yMin) / (yMax - yMin)) * (H - 2 * PAD);
    points.push(`${i === 0 ? "M" : "L"}${sx.toFixed(1)},${sy.toFixed(1)}`);
  }
  return points.join(" ");
}

interface Props {
  // Optional controlled input. Default to 0.5 if absent.
  x?: number;
  onChange?: (x: number) => void;
}

export function ActivationFunctionGallery({ x: controlledX, onChange }: Props = {}) {
  const [internalX, setInternalX] = useState(0.5);
  const x = controlledX ?? internalX;
  const setX = onChange ?? setInternalX;

  return (
    <div className="my-6 rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-2 border-b border-border bg-muted/50">
        <h4 className="text-sm font-medium font-sans">Activation functions</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          Drag the slider; each plot marks where its function evaluates.
        </p>
      </div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {FUNCTIONS.map((f) => {
            const y = f.fn(x);
            const sx = PAD + ((x - X_MIN) / (X_MAX - X_MIN)) * (W - 2 * PAD);
            const sy = H - PAD - ((y - f.yMin) / (f.yMax - f.yMin)) * (H - 2 * PAD);
            return (
              <div
                key={f.name}
                className="rounded-md border border-border bg-background p-2"
              >
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xs font-medium">{f.name}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {f.name.toLowerCase()}({x.toFixed(2)}) = {y.toFixed(3)}
                  </span>
                </div>
                <svg
                  viewBox={`0 0 ${W} ${H}`}
                  className="w-full h-auto"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <line
                    x1={PAD}
                    y1={H - PAD - ((0 - f.yMin) / (f.yMax - f.yMin)) * (H - 2 * PAD)}
                    x2={W - PAD}
                    y2={H - PAD - ((0 - f.yMin) / (f.yMax - f.yMin)) * (H - 2 * PAD)}
                    stroke="currentColor"
                    strokeWidth="0.4"
                    className="text-muted-foreground/30"
                  />
                  <line
                    x1={PAD + ((0 - X_MIN) / (X_MAX - X_MIN)) * (W - 2 * PAD)}
                    y1={PAD}
                    x2={PAD + ((0 - X_MIN) / (X_MAX - X_MIN)) * (W - 2 * PAD)}
                    y2={H - PAD}
                    stroke="currentColor"
                    strokeWidth="0.4"
                    className="text-muted-foreground/30"
                  />
                  <path
                    d={pathFor(f.fn, f.yMin, f.yMax)}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="text-primary"
                  />
                  <line
                    x1={sx}
                    y1={H - PAD}
                    x2={sx}
                    y2={sy}
                    stroke="currentColor"
                    strokeWidth="0.4"
                    strokeDasharray="2 2"
                    className="text-primary/50"
                  />
                  <circle
                    cx={sx}
                    cy={sy}
                    r="2.4"
                    fill="currentColor"
                    className="text-primary"
                  />
                </svg>
              </div>
            );
          })}
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Input</span>
            <span className="tabular-nums font-medium">x = {x.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={X_MIN}
            max={X_MAX}
            step={0.05}
            value={x}
            onChange={(e) => setX(parseFloat(e.target.value))}
            className="w-full accent-primary"
          />
        </div>
      </div>
    </div>
  );
}

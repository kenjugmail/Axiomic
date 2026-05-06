import { useState } from "react";

// 1D phase portrait. Plots dx/dt = rx − x³ on a number line; arrows
// point in the direction of flow, fixed points marked stable (filled)
// or unstable (open). r is the bifurcation parameter — sweep it to
// watch a pitchfork bifurcation pop into existence at r = 0.

const VIEW_W = 320;
const VIEW_H = 160;
const PAD = 20;
const X_MIN = -2.5;
const X_MAX = 2.5;
const Y_MIN = -3;
const Y_MAX = 3;

function f(x: number, r: number): number {
  return r * x - x * x * x;
}

function fPrime(x: number, r: number): number {
  return r - 3 * x * x;
}

function xToPx(x: number): number {
  return PAD + ((x - X_MIN) / (X_MAX - X_MIN)) * (VIEW_W - 2 * PAD);
}

function yToPx(y: number): number {
  return VIEW_H - PAD - ((y - Y_MIN) / (Y_MAX - Y_MIN)) * (VIEW_H - 2 * PAD);
}

interface Props {
  r?: number;
}

export function PhasePortrait1D({ r: rProp }: Props = {}) {
  const [r, setR] = useState(rProp ?? -0.5);

  // Curve.
  const steps = 80;
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = X_MIN + ((X_MAX - X_MIN) * i) / steps;
    const y = f(x, r);
    points.push(`${i === 0 ? "M" : "L"}${xToPx(x).toFixed(1)},${yToPx(y).toFixed(1)}`);
  }
  const path = points.join(" ");

  // Fixed points of rx − x³ = 0: x = 0 always; x = ±√r when r > 0.
  const fixedPoints: Array<{ x: number; stable: boolean }> = [];
  fixedPoints.push({ x: 0, stable: fPrime(0, r) < 0 });
  if (r > 0) {
    const root = Math.sqrt(r);
    fixedPoints.push({ x: root, stable: fPrime(root, r) < 0 });
    fixedPoints.push({ x: -root, stable: fPrime(-root, r) < 0 });
  }

  // Arrows along the x-axis indicating flow direction.
  const arrowPositions: Array<{ x: number; dir: 1 | -1 }> = [];
  for (let x = X_MIN + 0.4; x <= X_MAX - 0.4; x += 0.5) {
    // Skip arrows too close to a fixed point to avoid clutter.
    if (fixedPoints.some((fp) => Math.abs(fp.x - x) < 0.2)) continue;
    const v = f(x, r);
    arrowPositions.push({ x, dir: v > 0 ? 1 : -1 });
  }

  const axisY = yToPx(0);
  const axisX = xToPx(0);

  return (
    <div className="my-6 rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-2 border-b border-border bg-muted/50">
        <h4 className="text-sm font-medium">Phase portrait — pitchfork</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          dx/dt = r·x − x³. Sweep r through 0 and watch the bifurcation:
          one stable fixed point at the origin splits into two.
        </p>
      </div>
      <div className="p-4 space-y-3">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="w-full h-auto"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Axes */}
          <line
            x1={PAD}
            y1={axisY}
            x2={VIEW_W - PAD}
            y2={axisY}
            stroke="currentColor"
            strokeWidth="0.5"
            className="text-muted-foreground/40"
          />
          <line
            x1={axisX}
            y1={PAD}
            x2={axisX}
            y2={VIEW_H - PAD}
            stroke="currentColor"
            strokeWidth="0.5"
            className="text-muted-foreground/40"
          />
          {/* Curve */}
          <path
            d={path}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className="text-primary"
          />
          {/* Flow arrows */}
          {arrowPositions.map(({ x, dir }, i) => {
            const px = xToPx(x);
            return (
              <polygon
                key={i}
                points={
                  dir > 0
                    ? `${px - 4},${axisY - 3} ${px - 4},${axisY + 3} ${px + 2},${axisY}`
                    : `${px + 4},${axisY - 3} ${px + 4},${axisY + 3} ${px - 2},${axisY}`
                }
                fill="currentColor"
                className="text-muted-foreground"
              />
            );
          })}
          {/* Fixed points */}
          {fixedPoints.map((fp, i) => (
            <circle
              key={i}
              cx={xToPx(fp.x)}
              cy={axisY}
              r="5"
              fill={fp.stable ? "currentColor" : "transparent"}
              stroke="currentColor"
              strokeWidth="2"
              className={fp.stable ? "text-emerald-500" : "text-rose-500"}
            />
          ))}
        </svg>
        <div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">r (bifurcation parameter)</span>
            <span className="tabular-nums font-medium">{r.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={-2}
            max={2}
            step={0.01}
            value={r}
            onChange={(e) => setR(parseFloat(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-1">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              stable
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full border border-rose-500 inline-block" />
              unstable
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

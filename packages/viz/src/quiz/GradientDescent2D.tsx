import React, { useMemo } from "react";

// Controlled gradient-descent viz on a 2D anisotropic quadratic
// `f(x, y) = x² + ALPHA * y²`. The host owns the learning rate (and
// optionally the start point); the viz computes the trajectory
// analytically and renders the contours + descent path as SVG.
//
// Anisotropy makes the demo visibly meaningful: too small an LR
// converges painfully slowly along the wide axis, too large an LR
// oscillates along the narrow axis.

const ALPHA = 5;
const MAX_STEPS = 30;

interface Props {
  learningRate: number;
  // Optional fixed starting point. Defaults to a corner that demonstrates
  // both axes meaningfully.
  startX?: number;
  startY?: number;
  // Convergence target — when the trajectory's distance from origin
  // falls below this, that's "converged" (rendered with a checkmark).
  convergenceRadius?: number;
}

function loss(x: number, y: number): number {
  return x * x + ALPHA * y * y;
}

function grad(x: number, y: number): [number, number] {
  return [2 * x, 2 * ALPHA * y];
}

interface PathPoint {
  x: number;
  y: number;
  loss: number;
}

function computeTrajectory(lr: number, x0: number, y0: number): PathPoint[] {
  const path: PathPoint[] = [{ x: x0, y: y0, loss: loss(x0, y0) }];
  let x = x0;
  let y = y0;
  for (let i = 0; i < MAX_STEPS; i++) {
    const [gx, gy] = grad(x, y);
    x = x - lr * gx;
    y = y - lr * gy;
    if (!isFinite(x) || !isFinite(y) || Math.abs(x) > 1e6 || Math.abs(y) > 1e6) {
      // Diverging — stop early, render what we have.
      break;
    }
    path.push({ x, y, loss: loss(x, y) });
  }
  return path;
}

export function GradientDescent2D({
  learningRate,
  startX = 1.8,
  startY = 1.0,
  convergenceRadius = 0.05,
}: Props) {
  const path = useMemo(
    () => computeTrajectory(learningRate, startX, startY),
    [learningRate, startX, startY],
  );
  const finalLoss = path[path.length - 1]?.loss ?? Infinity;
  const converged =
    isFinite(finalLoss) &&
    Math.sqrt(path[path.length - 1].x ** 2 + path[path.length - 1].y ** 2) <
      convergenceRadius;
  const diverged = !isFinite(finalLoss) || finalLoss > 100;

  // World coordinates: x in [-2.5, 2.5], y in [-1.5, 1.5]. SVG viewport: 320×200.
  const W = 320;
  const H = 200;
  const X_MIN = -2.5,
    X_MAX = 2.5;
  const Y_MIN = -1.5,
    Y_MAX = 1.5;
  const sx = (x: number) => ((x - X_MIN) / (X_MAX - X_MIN)) * W;
  const sy = (y: number) => H - ((y - Y_MIN) / (Y_MAX - Y_MIN)) * H;

  // Contour lines for f = 0.25, 1, 2.25, 4 etc (sqrt-spaced)
  const contourLevels = [0.1, 0.5, 1.5, 3, 5];

  // Each contour of x² + ALPHA * y² = c is an ellipse with
  // semi-axes (sqrt(c), sqrt(c / ALPHA)).
  const contours = contourLevels.map((c) => ({
    level: c,
    rx: Math.sqrt(c),
    ry: Math.sqrt(c / ALPHA),
  }));

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2 text-sm">
        <span>
          Learning rate ={" "}
          <span className="font-mono font-medium">{learningRate.toFixed(3)}</span>
        </span>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            converged
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : diverged
                ? "bg-rose-500/10 text-rose-700 dark:text-rose-400"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {converged
            ? "converged"
            : diverged
              ? "diverging"
              : "still descending…"}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto bg-background rounded border border-border"
      >
        {/* Contour ellipses */}
        {contours.map((c) => (
          <ellipse
            key={c.level}
            cx={sx(0)}
            cy={sy(0)}
            rx={(c.rx / (X_MAX - X_MIN)) * W}
            ry={(c.ry / (Y_MAX - Y_MIN)) * H}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.15}
            strokeWidth={1}
          />
        ))}

        {/* Origin marker */}
        <circle cx={sx(0)} cy={sy(0)} r={3} fill="currentColor" opacity={0.4} />
        <circle
          cx={sx(0)}
          cy={sy(0)}
          r={(convergenceRadius / (X_MAX - X_MIN)) * W * 2}
          fill="none"
          stroke="rgb(16 185 129 / 0.3)"
          strokeDasharray="2 2"
        />

        {/* Trajectory polyline */}
        <polyline
          points={path
            .map((p) => `${sx(Math.max(X_MIN, Math.min(X_MAX, p.x)))},${sy(Math.max(Y_MIN, Math.min(Y_MAX, p.y)))}`)
            .join(" ")}
          fill="none"
          stroke="rgb(99 102 241)"
          strokeWidth={1.5}
        />
        {/* Step dots */}
        {path.slice(0, 12).map((p, i) =>
          Math.abs(p.x) <= X_MAX && Math.abs(p.y) <= Y_MAX ? (
            <circle
              key={i}
              cx={sx(p.x)}
              cy={sy(p.y)}
              r={i === 0 ? 4 : 2}
              fill={i === 0 ? "rgb(244 63 94)" : "rgb(99 102 241)"}
            />
          ) : null,
        )}
      </svg>

      <div className="text-[10px] text-muted-foreground mt-2 flex justify-between">
        <span>
          f(x, y) = x² + {ALPHA}y² — a stretched bowl. The narrow axis has
          steeper gradients, so a single learning rate must serve both.
        </span>
      </div>
      <div className="text-[10px] text-muted-foreground mt-1">
        After {path.length - 1} steps: loss ={" "}
        <span className="font-mono">
          {isFinite(finalLoss) ? finalLoss.toFixed(4) : "diverged"}
        </span>
      </div>
    </div>
  );
}

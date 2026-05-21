import { useEffect, useMemo, useRef, useState } from "react";

// Schelling 1971 dynamic-segregation model. NxN grid of two-color
// agents on a torus; each unhappy agent (similar-neighbor fraction
// below the tolerance threshold) moves to a random empty cell. Even
// modest tolerance preferences (e.g. 30%) produce dramatic
// macro-segregation — the canonical demonstration that aggregate
// outcomes need not mirror individual intent.

const W = 460;
const H = 320;

interface Props {
  tolerance?: number;
  gridSize?: number;
}

type Cell = 0 | 1 | 2;  // 0 empty, 1 red, 2 blue

function buildInitialGrid(N: number, fillFrac = 0.9): Cell[][] {
  const g: Cell[][] = Array.from({ length: N }, () => Array<Cell>(N).fill(0));
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (Math.random() < fillFrac) {
        g[i][j] = Math.random() < 0.5 ? 1 : 2;
      }
    }
  }
  return g;
}

function neighborFrac(g: Cell[][], i: number, j: number): { same: number; total: number } {
  const N = g.length;
  const me = g[i][j];
  if (me === 0) return { same: 0, total: 0 };
  let same = 0;
  let total = 0;
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      if (di === 0 && dj === 0) continue;
      const ni = (i + di + N) % N;
      const nj = (j + dj + N) % N;
      const n = g[ni][nj];
      if (n !== 0) {
        total++;
        if (n === me) same++;
      }
    }
  }
  return { same, total };
}

function step(g: Cell[][], tau: number): { g: Cell[][]; moved: number } {
  const N = g.length;
  const next = g.map((row) => [...row]);
  const empties: Array<[number, number]> = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (next[i][j] === 0) empties.push([i, j]);
    }
  }
  let moved = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (next[i][j] === 0) continue;
      const { same, total } = neighborFrac(next, i, j);
      const frac = total === 0 ? 1 : same / total;
      if (frac < tau && empties.length > 0) {
        // Move to a random empty cell
        const idx = Math.floor(Math.random() * empties.length);
        const [ei, ej] = empties[idx];
        next[ei][ej] = next[i][j];
        next[i][j] = 0;
        empties[idx] = [i, j];
        moved++;
      }
    }
  }
  return { g: next, moved };
}

function segregationIndex(g: Cell[][]): number {
  // Average same-color neighbor fraction across occupied cells
  const N = g.length;
  let total = 0;
  let countSame = 0;
  let countNbr = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (g[i][j] === 0) continue;
      total++;
      const { same, total: t } = neighborFrac(g, i, j);
      if (t > 0) {
        countSame += same / t;
        countNbr++;
      }
    }
  }
  return countNbr === 0 ? 0 : countSame / countNbr;
}

export function SchellingSegregation({ tolerance: ctlTau, gridSize: ctlN }: Props = {}) {
  const [intTau, setIntTau] = useState(0.3);
  const [intN] = useState(ctlN ?? 30);
  const tau = ctlTau ?? intTau;
  const N = intN;
  const [grid, setGrid] = useState<Cell[][]>(() => buildInitialGrid(N));
  const [iter, setIter] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setGrid((g) => {
          const { g: next, moved } = step(g, tau);
          if (moved === 0) setRunning(false);
          return next;
        });
        setIter((i) => i + 1);
      }, 200);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, tau]);

  const segIdx = useMemo(() => segregationIndex(grid), [grid]);

  const reset = () => {
    setGrid(buildInitialGrid(N));
    setIter(0);
    setRunning(false);
  };
  const oneStep = () => {
    setGrid((g) => step(g, tau).g);
    setIter((i) => i + 1);
  };

  const cellSize = Math.min(W / N, (H - 30) / N);
  const padding = 4;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Schelling segregation · τ = {(tau * 100).toFixed(0)}% · iter {iter} · segregation index {segIdx.toFixed(2)}</div>
        <div className="flex gap-1">
          <button onClick={() => setRunning((r) => !r)} className="px-2 py-0.5 rounded text-[10px] bg-primary text-primary-foreground hover:opacity-80">
            {running ? "Pause" : "Run"}
          </button>
          <button onClick={oneStep} disabled={running} className="px-2 py-0.5 rounded text-[10px] bg-muted hover:bg-accent disabled:opacity-50">
            Step
          </button>
          <button onClick={reset} className="px-2 py-0.5 rounded text-[10px] bg-muted hover:bg-accent">
            Reset
          </button>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Schelling segregation grid">
        <g transform={`translate(${padding}, ${padding})`}>
          {grid.map((row, i) =>
            row.map((cell, j) => {
              if (cell === 0) return null;
              return (
                <rect
                  key={`${i}-${j}`}
                  x={j * cellSize}
                  y={i * cellSize}
                  width={cellSize - 0.5}
                  height={cellSize - 0.5}
                  fill={cell === 1 ? "#ff6b6b" : "#4ecdc4"}
                />
              );
            }),
          )}
        </g>
        <text x={W / 2} y={H - 6} fill="#9aa3b8" fontSize="9" textAnchor="middle">
          {N}×{N} torus · 90% occupied · 2 groups
        </text>
      </svg>

      <div className="mt-2 text-xs">
        <label className="block">Tolerance τ (move if &lt; this fraction of neighbors are similar): {(tau * 100).toFixed(0)}%
          <input type="range" min={0} max={1} step={0.05} value={tau} onChange={(e) => setIntTau(parseFloat(e.target.value))} disabled={ctlTau !== undefined} className="w-full mt-0.5" aria-label="Tolerance" />
        </label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Schelling 1971 (Journal of Mathematical Sociology). Each
        agent demands at least τ of its 8 Moore neighbors share its
        color, else relocates. Even at τ = 30% — a mild preference
        for similarity — the steady-state shows striking macro-clusters
        because individual moves cascade (a moving red pushes another
        blue below threshold, which moves, and so on). Massey-Denton
        American Apartheid (1993) used Schelling-style dynamics to
        explain persistent US residential segregation; Boustan + Card
        + Cutler estimated empirical tipping points around 9-13%
        minority share. The model shows that aggregate segregation
        can arise even when no individual seeks it.
      </div>
    </div>
  );
}

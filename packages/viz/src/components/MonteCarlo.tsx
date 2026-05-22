import { useMemo, useState } from "react";

// Monte Carlo estimation. Scatter random points in the unit square and count
// how many land inside the quarter-circle (x² + y² ≤ 1): the fraction
// approximates the quarter-circle's area π/4, so π ≈ 4·(inside/N). The error
// shrinks like 1/√N — quadrupling the samples only halves the error, the
// signature slow convergence of stochastic methods (named for the Monte
// Carlo casino by Ulam, von Neumann & Metropolis at Los Alamos, 1940s).

const W = 460;
const H = 300;
const BOX = 240;

// Deterministic LCG so SSR + re-renders are stable.
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1103515245, s) + 12345) >>> 0;
    return s / 4294967296;
  };
}

const PRESETS = [100, 1000, 5000];

interface Props { samples?: number; }

export function MonteCarlo({ samples: ctl }: Props = {}) {
  const [intN, setIntN] = useState(1000);
  const n = ctl ?? intN;

  const { estimate, inside, pts } = useMemo(() => {
    const rng = lcg(12345);
    const pts: Array<{ x: number; y: number; inside: boolean }> = [];
    let inside = 0;
    for (let i = 0; i < n; i++) {
      const x = rng(), y = rng();
      const isIn = x * x + y * y <= 1;
      if (isIn) inside++;
      if (pts.length < 500) pts.push({ x, y, inside: isIn });
    }
    return { estimate: (4 * inside) / n, inside, pts };
  }, [n]);

  const err = Math.abs(estimate - Math.PI);
  const ox = 24, oy = 30; // box origin (top-left)
  const px = (x: number) => ox + x * BOX;
  const py = (y: number) => oy + (1 - y) * BOX;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">π ≈ {estimate.toFixed(4)} · error {err.toFixed(4)}</div>
        <div className="flex gap-1">
          {PRESETS.map((p) => (
            <button key={p} onClick={() => setIntN(p)} disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${n === p ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{p.toLocaleString()}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Monte Carlo estimate of pi">
        {/* unit square + quarter circle */}
        <rect x={ox} y={oy} width={BOX} height={BOX} fill="#0e1a3a" stroke="#334155" strokeWidth={1} />
        <path d={`M${px(0)},${py(1)} A${BOX} ${BOX} 0 0 0 ${px(1)},${py(0)} `} fill="none" stroke="#4ade80" strokeWidth={1.5} />
        {/* points (sample of up to 500) */}
        {pts.map((p, i) => (
          <circle key={i} cx={px(p.x)} cy={py(p.y)} r={1.6} fill={p.inside ? "#4ade80" : "#64748b"} opacity={0.8} />
        ))}

        {/* readout */}
        <g transform={`translate(${ox + BOX + 24},${oy + 20})`}>
          <text x={0} y={0} fill="#cbd1e6" fontSize="9">samples N = {n.toLocaleString()}</text>
          <text x={0} y={20} fill="#4ade80" fontSize="9">inside = {inside.toLocaleString()}</text>
          <text x={0} y={40} fill="#9aa3b8" fontSize="9">π ≈ 4 · inside/N</text>
          <text x={0} y={62} fill="#e5e9f5" fontSize="13" fontWeight="bold">{estimate.toFixed(4)}</text>
          <text x={0} y={82} fill="#9aa3b8" fontSize="8">true π = 3.14159</text>
          <text x={0} y={100} fill={err < 0.05 ? "#4ade80" : "#fbbf24"} fontSize="9">|error| = {err.toFixed(4)}</text>
        </g>
      </svg>

      <div className="mt-2 text-xs">
        <label className="block">samples N = {n.toLocaleString()}
          <input type="range" min={50} max={5000} step={50} value={n} onChange={(e) => setIntN(parseInt(e.target.value))} className="w-full mt-0.5" aria-label="Number of samples" />
        </label>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        The green arc is the quarter-circle of area <b>π/4</b>; a uniform
        random point lands inside it with that probability, so
        <b> 4·(inside/N)</b> estimates π. Crank N up and the estimate tightens —
        but only as <b>1/√N</b>, so 100× more samples buys just 10× the
        accuracy. That slow convergence (and its dimension-independence) is
        why Monte Carlo shines for high-dimensional integrals where grids fail.
      </div>
    </div>
  );
}

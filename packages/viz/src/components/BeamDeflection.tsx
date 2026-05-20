import { useMemo, useState } from "react";

// Interactive simply-supported beam with movable point load.
// Shows beam with deformed shape, shear diagram, bending moment
// diagram. Drag the load position + magnitude + span; everything
// rescales. Demonstrates: reactions, max moment at load, parabolic
// deflection curve, sign conventions for V + M diagrams.
//
// Beam: simply supported, length L. Point load P at distance a from
// left support (b = L - a from right).
//
// Reactions: R_A = P*b/L (upward), R_B = P*a/L (upward)
//
// For 0 <= x <= a:
//   V(x) = R_A = P*b/L
//   M(x) = R_A * x = P*b*x/L
//   y(x) = -P*b*x/(6*E*I*L) * (L^2 - b^2 - x^2)
//
// For a <= x <= L:
//   V(x) = R_A - P = -P*a/L
//   M(x) = R_A*x - P*(x - a)
//   y(x) = -P*a*(L-x)/(6*E*I*L) * (2*L*x - a^2 - x^2)
//
// EI normalized to 1 for visualization (scaled at end).

type Series = Array<{ x: number; v: number }>;

function computeBeam(L: number, P: number, a: number, samples = 80): {
  deflection: Series;
  shear: Series;
  moment: Series;
  reactionA: number;
  reactionB: number;
  maxMomentMag: number;
  maxDeflMag: number;
} {
  const b = L - a;
  const R_A = (P * b) / L;
  const R_B = (P * a) / L;
  const deflection: Series = [];
  const shear: Series = [];
  const moment: Series = [];
  for (let i = 0; i <= samples; i++) {
    const x = (L * i) / samples;
    let V: number, M: number, y: number;
    if (x <= a) {
      V = R_A;
      M = R_A * x;
      // y(x) for left region (using EI = 1; deflection is "normalized")
      y = (-P * b * x) / (6 * L) * (L * L - b * b - x * x);
    } else {
      V = R_A - P;
      M = R_A * x - P * (x - a);
      y = (-P * a * (L - x)) / (6 * L) * (2 * L * x - a * a - x * x);
    }
    deflection.push({ x, v: y });
    shear.push({ x, v: V });
    moment.push({ x, v: M });
  }
  const maxMomentMag = Math.max(...moment.map((p) => Math.abs(p.v)));
  const maxDeflMag = Math.max(...deflection.map((p) => Math.abs(p.v)));
  return { deflection, shear, moment, reactionA: R_A, reactionB: R_B, maxMomentMag, maxDeflMag };
}

const W = 380;
const ROW_H = 60;
const TOTAL_H = ROW_H * 3 + 30;
const PAD_L = 24;
const PAD_R = 12;
const PAD_T = 8;

interface Props {
  length?: number;
  load?: number;
  loadPosition?: number; // a, distance from left support
}

export function BeamDeflection({
  length: controlledL,
  load: controlledP,
  loadPosition: controlledA,
}: Props = {}) {
  const [internalL, setInternalL] = useState(10);
  const [internalP, setInternalP] = useState(100);
  const [internalA, setInternalA] = useState(4);

  const L = controlledL ?? internalL;
  const P = controlledP ?? internalP;
  // clamp a to (0, L)
  const aClamped = Math.min(Math.max(controlledA ?? internalA, 0.1), L - 0.1);
  const a = aClamped;

  const { deflection, shear, moment, reactionA, reactionB, maxMomentMag, maxDeflMag } =
    useMemo(() => computeBeam(L, P, a), [L, P, a]);

  const sx = (x: number) => PAD_L + (x / L) * (W - PAD_L - PAD_R);

  const buildPath = (series: Series, maxAbs: number, yCenter: number, height: number) => {
    if (maxAbs === 0) return `M${PAD_L},${yCenter} L${W - PAD_R},${yCenter}`;
    return series
      .map((pt, i) => {
        const x = sx(pt.x);
        const y = yCenter - (pt.v / maxAbs) * (height / 2 - 4);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  };

  const buildFilledPath = (series: Series, maxAbs: number, yCenter: number, height: number) => {
    if (maxAbs === 0) return "";
    const top = series
      .map((pt, i) => {
        const x = sx(pt.x);
        const y = yCenter - (pt.v / maxAbs) * (height / 2 - 4);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return `${top} L${sx(L).toFixed(1)},${yCenter} L${sx(0).toFixed(1)},${yCenter} Z`;
  };

  // Three rows: beam (with load + deformed shape), shear, moment.
  const beamY = PAD_T + ROW_H / 2;
  const shearY = PAD_T + ROW_H + 10 + ROW_H / 2;
  const momentY = PAD_T + 2 * (ROW_H + 10) + ROW_H / 2;

  return (
    <div className="my-6 rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-2 border-b border-border bg-muted/50">
        <h4 className="text-sm font-medium font-sans">Simply supported beam — deflection, shear, moment</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          Drag load magnitude + position + span. Reactions + max moment + deflection update.
        </p>
      </div>
      <div className="p-4 space-y-3">
        <div className="rounded-md border border-border bg-background p-2">
          <svg
            viewBox={`0 0 ${W} ${TOTAL_H}`}
            className="w-full h-auto"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* === Row 1: beam with load + deformed shape === */}
            {/* undeformed beam */}
            <line x1={PAD_L} y1={beamY} x2={W - PAD_R} y2={beamY} stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground/60" />
            {/* deformed shape — exaggerate y for visual */}
            <path
              d={buildPath(deflection, maxDeflMag, beamY, ROW_H * 0.7)}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeDasharray="3 2"
              className="text-primary"
            />
            {/* supports (triangles) */}
            <polygon
              points={`${PAD_L},${beamY + 4} ${PAD_L - 5},${beamY + 12} ${PAD_L + 5},${beamY + 12}`}
              fill="currentColor"
              className="text-muted-foreground"
            />
            <polygon
              points={`${W - PAD_R},${beamY + 4} ${W - PAD_R - 5},${beamY + 12} ${W - PAD_R + 5},${beamY + 12}`}
              fill="currentColor"
              className="text-muted-foreground"
            />
            {/* load arrow */}
            <line
              x1={sx(a)}
              y1={beamY - ROW_H * 0.6}
              x2={sx(a)}
              y2={beamY - 4}
              stroke="currentColor"
              strokeWidth="1.6"
              className="text-rose-500"
            />
            <polygon
              points={`${sx(a) - 4},${beamY - 8} ${sx(a) + 4},${beamY - 8} ${sx(a)},${beamY - 2}`}
              fill="currentColor"
              className="text-rose-500"
            />
            <text x={sx(a) + 6} y={beamY - ROW_H * 0.55} fontSize="10" className="fill-rose-500 font-medium">
              P
            </text>
            {/* x-axis labels */}
            <text x={PAD_L} y={beamY + 22} fontSize="9" className="fill-muted-foreground">x=0</text>
            <text x={W - PAD_R - 12} y={beamY + 22} fontSize="9" className="fill-muted-foreground">L</text>

            {/* row separator */}
            <line x1={PAD_L} y1={beamY + ROW_H / 2 + 4} x2={W - PAD_R} y2={beamY + ROW_H / 2 + 4} stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/30" />

            {/* === Row 2: shear === */}
            <text x={2} y={shearY - ROW_H / 2 + 10} fontSize="9" className="fill-muted-foreground">Shear V(x)</text>
            <line x1={PAD_L} y1={shearY} x2={W - PAD_R} y2={shearY} stroke="currentColor" strokeWidth="0.4" className="text-muted-foreground/40" />
            <path
              d={buildFilledPath(shear, maxMomentMag, shearY, ROW_H)}
              fill="currentColor"
              className="text-sky-500/30"
            />
            <path
              d={buildPath(shear, maxMomentMag, shearY, ROW_H)}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              className="text-sky-500"
            />

            <line x1={PAD_L} y1={shearY + ROW_H / 2 + 4} x2={W - PAD_R} y2={shearY + ROW_H / 2 + 4} stroke="currentColor" strokeWidth="0.3" className="text-muted-foreground/30" />

            {/* === Row 3: bending moment === */}
            <text x={2} y={momentY - ROW_H / 2 + 10} fontSize="9" className="fill-muted-foreground">Moment M(x)</text>
            <line x1={PAD_L} y1={momentY} x2={W - PAD_R} y2={momentY} stroke="currentColor" strokeWidth="0.4" className="text-muted-foreground/40" />
            <path
              d={buildFilledPath(moment, maxMomentMag, momentY, ROW_H)}
              fill="currentColor"
              className="text-emerald-500/30"
            />
            <path
              d={buildPath(moment, maxMomentMag, momentY, ROW_H)}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              className="text-emerald-500"
            />
            {/* mark the max moment at x=a */}
            <line x1={sx(a)} y1={momentY} x2={sx(a)} y2={momentY - (maxMomentMag / maxMomentMag) * (ROW_H / 2 - 4)} stroke="currentColor" strokeWidth="0.3" strokeDasharray="2 2" className="text-emerald-500/40" />
          </svg>
        </div>

        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Span L</span>
              <span className="tabular-nums font-medium">{L.toFixed(1)} m</span>
            </div>
            <input
              type="range"
              min={4}
              max={20}
              step={0.5}
              value={L}
              onChange={(e) => (controlledL === undefined) && setInternalL(parseFloat(e.target.value))}
              disabled={controlledL !== undefined}
              className="w-full accent-primary"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Load P</span>
              <span className="tabular-nums font-medium">{P.toFixed(0)} kN</span>
            </div>
            <input
              type="range"
              min={10}
              max={500}
              step={10}
              value={P}
              onChange={(e) => (controlledP === undefined) && setInternalP(parseFloat(e.target.value))}
              disabled={controlledP !== undefined}
              className="w-full accent-rose-500"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Load position a</span>
              <span className="tabular-nums font-medium">{a.toFixed(1)} m</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={Math.max(L - 0.1, 0.2)}
              step={0.1}
              value={Math.min(a, L - 0.1)}
              onChange={(e) => (controlledA === undefined) && setInternalA(parseFloat(e.target.value))}
              disabled={controlledA !== undefined}
              className="w-full accent-primary"
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 text-[11px] pt-1 border-t border-border">
          <div>
            <div className="text-muted-foreground">R_A</div>
            <div className="tabular-nums font-medium">{reactionA.toFixed(1)} kN</div>
          </div>
          <div>
            <div className="text-muted-foreground">R_B</div>
            <div className="tabular-nums font-medium">{reactionB.toFixed(1)} kN</div>
          </div>
          <div>
            <div className="text-muted-foreground">M_max</div>
            <div className="tabular-nums font-medium">{maxMomentMag.toFixed(1)} kN·m</div>
          </div>
          <div>
            <div className="text-muted-foreground">δ_max (rel)</div>
            <div className="tabular-nums font-medium">{maxDeflMag.toFixed(0)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

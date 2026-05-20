import { useMemo, useState } from "react";

// Interactive Carnot cycle on a P-V diagram. Drag the two reservoir
// temperatures + the compression ratio; the curve rescales + the
// efficiency η = 1 - T_C/T_H is computed. Two isotherms (PV = nRT)
// + two adiabats (PV^γ = const) bound the cycle.

const R = 8.314;        // J/(mol·K), gas constant
const N_MOLES = 1;      // 1 mol of ideal gas
const GAMMA = 5 / 3;    // monatomic ideal gas (5/3 for monatomic, 7/5 diatomic)

type Point = { v: number; p: number };

function isothermPath(
  vStart: number,
  vEnd: number,
  T: number,
  steps = 40,
): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const v = vStart + ((vEnd - vStart) * i) / steps;
    const p = (N_MOLES * R * T) / v;
    out.push({ v, p });
  }
  return out;
}

function adiabatPath(
  start: Point,
  vEnd: number,
  steps = 40,
): Point[] {
  // P V^γ = const, so P(V) = P_1 * (V_1 / V)^γ
  const out: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const v = start.v + ((vEnd - start.v) * i) / steps;
    const p = start.p * Math.pow(start.v / v, GAMMA);
    out.push({ v, p });
  }
  return out;
}

const W = 360;
const H = 240;
const PAD_L = 44;
const PAD_R = 12;
const PAD_T = 14;
const PAD_B = 32;

interface Props {
  tHot?: number;
  tCold?: number;
  vMin?: number; // volume at state 1 (start of isothermal expansion)
  vRatio?: number; // V_max / V_min during the isothermal expansion phase
}

export function CarnotCycle({
  tHot: controlledTH,
  tCold: controlledTC,
  vMin: controlledVMin,
  vRatio: controlledRatio,
}: Props = {}) {
  const [internalTH, setInternalTH] = useState(500);
  const [internalTC, setInternalTC] = useState(300);
  const [internalVMin, setInternalVMin] = useState(0.01); // 10 L
  const [internalRatio, setInternalRatio] = useState(2.5);

  const T_H = controlledTH ?? internalTH;
  const T_C = controlledTC ?? internalTC;
  const V1 = controlledVMin ?? internalVMin;
  const ratio = controlledRatio ?? internalRatio;

  const { paths, statePoints, efficiency, workPerCycle, qHot } = useMemo(() => {
    // State 1: start of isothermal expansion at T_H. V = V1.
    // State 2: end of isothermal expansion at T_H. V = V1 * ratio.
    // State 3: end of adiabatic expansion. T = T_C. V derived from PV^γ.
    // State 4: end of isothermal compression at T_C. Then adiabatic back to 1.
    const V2 = V1 * ratio;
    const P1 = (N_MOLES * R * T_H) / V1;
    const P2 = (N_MOLES * R * T_H) / V2;
    // Adiabatic from (V2, T_H) to (V3, T_C): T V^{γ-1} = const
    // T_H V2^{γ-1} = T_C V3^{γ-1} → V3 = V2 (T_H/T_C)^{1/(γ-1)}
    const V3 = V2 * Math.pow(T_H / T_C, 1 / (GAMMA - 1));
    const P3 = (N_MOLES * R * T_C) / V3;
    // Adiabatic from (V1, T_H) to (V4, T_C): symmetric
    const V4 = V1 * Math.pow(T_H / T_C, 1 / (GAMMA - 1));
    const P4 = (N_MOLES * R * T_C) / V4;

    const iso12 = isothermPath(V1, V2, T_H);
    const adi23 = adiabatPath({ v: V2, p: P2 }, V3);
    const iso34 = isothermPath(V3, V4, T_C);
    const adi41 = adiabatPath({ v: V4, p: P4 }, V1);

    const eta = 1 - T_C / T_H;
    // Q_hot absorbed during isothermal expansion at T_H: Q = nRT_H ln(V2/V1)
    const Q_H = N_MOLES * R * T_H * Math.log(V2 / V1);
    const W_net = eta * Q_H;

    return {
      paths: { iso12, adi23, iso34, adi41 },
      statePoints: [
        { v: V1, p: P1, label: "1" },
        { v: V2, p: P2, label: "2" },
        { v: V3, p: P3, label: "3" },
        { v: V4, p: P4, label: "4" },
      ],
      efficiency: eta,
      workPerCycle: W_net,
      qHot: Q_H,
    };
  }, [T_H, T_C, V1, ratio]);

  // Auto-scale axes from all points
  const allPoints = useMemo(() => {
    return [...paths.iso12, ...paths.adi23, ...paths.iso34, ...paths.adi41];
  }, [paths]);
  const vMax = Math.max(...allPoints.map((pt) => pt.v));
  const pMax = Math.max(...allPoints.map((pt) => pt.p));
  const vMinPlot = Math.min(...allPoints.map((pt) => pt.v));
  const pMinPlot = Math.min(...allPoints.map((pt) => pt.p));

  const sx = (v: number) =>
    PAD_L + ((v - vMinPlot) / (vMax - vMinPlot)) * (W - PAD_L - PAD_R);
  const sy = (p: number) =>
    H - PAD_B - ((p - pMinPlot) / (pMax - pMinPlot)) * (H - PAD_T - PAD_B);

  const buildPath = (pts: Point[]) =>
    pts
      .map((pt, i) => `${i === 0 ? "M" : "L"}${sx(pt.v).toFixed(1)},${sy(pt.p).toFixed(1)}`)
      .join(" ");

  return (
    <div className="my-6 rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-2 border-b border-border bg-muted/50">
        <h4 className="text-sm font-medium font-sans">Carnot cycle (P-V diagram)</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          Drag temperatures + expansion ratio. Efficiency η = 1 − T_C/T_H.
        </p>
      </div>
      <div className="p-4 space-y-3">
        <div className="rounded-md border border-border bg-background p-2">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-auto"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* axes */}
            <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="currentColor" strokeWidth="0.5" className="text-muted-foreground/50" />
            <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="currentColor" strokeWidth="0.5" className="text-muted-foreground/50" />
            <text x={W / 2} y={H - 8} fontSize="9" textAnchor="middle" className="fill-muted-foreground">Volume V (m³)</text>
            <text x={12} y={H / 2} fontSize="9" textAnchor="middle" transform={`rotate(-90 12 ${H / 2})`} className="fill-muted-foreground">Pressure P (Pa)</text>

            {/* cycle paths */}
            <path d={buildPath(paths.iso12)} fill="none" stroke="currentColor" strokeWidth="1.6" className="text-rose-500" />
            <path d={buildPath(paths.adi23)} fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 2" className="text-primary" />
            <path d={buildPath(paths.iso34)} fill="none" stroke="currentColor" strokeWidth="1.6" className="text-sky-500" />
            <path d={buildPath(paths.adi41)} fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 2" className="text-primary" />

            {/* state-point markers */}
            {statePoints.map((pt) => (
              <g key={pt.label}>
                <circle cx={sx(pt.v)} cy={sy(pt.p)} r="3.4" fill="currentColor" className="text-foreground" />
                <text x={sx(pt.v) + 6} y={sy(pt.p) - 4} fontSize="10" className="fill-foreground font-medium">{pt.label}</text>
              </g>
            ))}

            {/* legend */}
            <g transform={`translate(${W - 110}, ${PAD_T + 4})`}>
              <line x1="0" y1="6" x2="12" y2="6" stroke="currentColor" strokeWidth="1.6" className="text-rose-500" />
              <text x="16" y="9" fontSize="9" className="fill-muted-foreground">Isothermal (T_H)</text>
              <line x1="0" y1="20" x2="12" y2="20" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 2" className="text-primary" />
              <text x="16" y="23" fontSize="9" className="fill-muted-foreground">Adiabatic</text>
              <line x1="0" y1="34" x2="12" y2="34" stroke="currentColor" strokeWidth="1.6" className="text-sky-500" />
              <text x="16" y="37" fontSize="9" className="fill-muted-foreground">Isothermal (T_C)</text>
            </g>
          </svg>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">T_hot</span>
              <span className="tabular-nums font-medium">{T_H.toFixed(0)} K</span>
            </div>
            <input
              type="range"
              min={350}
              max={1200}
              step={10}
              value={T_H}
              onChange={(e) => (controlledTH === undefined) && setInternalTH(parseFloat(e.target.value))}
              disabled={controlledTH !== undefined}
              className="w-full accent-rose-500"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">T_cold</span>
              <span className="tabular-nums font-medium">{T_C.toFixed(0)} K</span>
            </div>
            <input
              type="range"
              min={200}
              max={Math.max(T_H - 50, 200)}
              step={10}
              value={Math.min(T_C, T_H - 50)}
              onChange={(e) => (controlledTC === undefined) && setInternalTC(parseFloat(e.target.value))}
              disabled={controlledTC !== undefined}
              className="w-full accent-sky-500"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">V_min</span>
              <span className="tabular-nums font-medium">{(V1 * 1000).toFixed(1)} L</span>
            </div>
            <input
              type="range"
              min={0.005}
              max={0.03}
              step={0.001}
              value={V1}
              onChange={(e) => (controlledVMin === undefined) && setInternalVMin(parseFloat(e.target.value))}
              disabled={controlledVMin !== undefined}
              className="w-full accent-primary"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Expansion ratio</span>
              <span className="tabular-nums font-medium">{ratio.toFixed(1)}×</span>
            </div>
            <input
              type="range"
              min={1.5}
              max={5}
              step={0.1}
              value={ratio}
              onChange={(e) => (controlledRatio === undefined) && setInternalRatio(parseFloat(e.target.value))}
              disabled={controlledRatio !== undefined}
              className="w-full accent-primary"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-[11px] pt-1 border-t border-border">
          <div>
            <div className="text-muted-foreground">Efficiency η</div>
            <div className="tabular-nums font-medium">{(efficiency * 100).toFixed(1)} %</div>
          </div>
          <div>
            <div className="text-muted-foreground">Q_H absorbed</div>
            <div className="tabular-nums font-medium">{qHot.toFixed(0)} J</div>
          </div>
          <div>
            <div className="text-muted-foreground">W_net per cycle</div>
            <div className="tabular-nums font-medium">{workPerCycle.toFixed(0)} J</div>
          </div>
        </div>
      </div>
    </div>
  );
}

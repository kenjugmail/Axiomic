import { useMemo, useState } from "react";

// Interactive pharmacokinetic concentration-vs-time curve.
// One-compartment model with first-order absorption + elimination
// + repeated dosing showing accumulation to steady state.
//
// C(t) for a single oral dose = (F D k_a / V(k_a - k_e)) * (e^{-k_e t} - e^{-k_a t})
//
// For multiple doses spaced by τ:
//   sum each prior dose's contribution at t = nτ + s.
//
// Drag dose, half-life (→ k_e), dose interval, absorption k_a.
// Watch steady-state level, peak-trough swing.

type Sample = { t: number; c: number };

const F = 1.0;        // bioavailability fraction
const V = 50;         // volume of distribution (L)

function singleDoseConcentration(
  dose: number,
  ka: number,
  ke: number,
  t: number,
): number {
  if (t < 0) return 0;
  if (Math.abs(ka - ke) < 1e-6) {
    // limit case: ka == ke (rare); use simpler form
    return (F * dose * ka * t) / V * Math.exp(-ke * t);
  }
  return ((F * dose * ka) / (V * (ka - ke))) *
    (Math.exp(-ke * t) - Math.exp(-ka * t));
}

function computeCurve(
  dose: number,
  halfLifeHr: number,
  kaPerHr: number,
  intervalHr: number,
  totalHours: number,
  samples = 200,
): { curve: Sample[]; cMax: number; cMin: number; doseCount: number } {
  const ke = Math.log(2) / halfLifeHr;
  const numDoses = Math.floor(totalHours / intervalHr) + 1;
  const out: Sample[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = (totalHours * i) / samples;
    let c = 0;
    for (let d = 0; d < numDoses; d++) {
      const dt = t - d * intervalHr;
      if (dt >= 0) c += singleDoseConcentration(dose, kaPerHr, ke, dt);
    }
    out.push({ t, c });
  }
  const cMax = Math.max(...out.map((s) => s.c));
  // After the last few doses, peaks + troughs settle to near-steady-state.
  // Trough = lowest in the last interval window.
  const tailIdx = Math.floor(samples * 0.8);
  const tail = out.slice(tailIdx);
  const cMin = Math.min(...tail.map((s) => s.c));
  return { curve: out, cMax, cMin, doseCount: numDoses };
}

const W = 380;
const H = 220;
const PAD_L = 40;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 30;

interface Props {
  dose?: number;
  halfLifeHr?: number;
  intervalHr?: number;
  kaPerHr?: number;
}

export function PKCurve({
  dose: controlledDose,
  halfLifeHr: controlledHL,
  intervalHr: controlledInt,
  kaPerHr: controlledKa,
}: Props = {}) {
  const [internalDose, setInternalDose] = useState(500);
  const [internalHL, setInternalHL] = useState(6);
  const [internalInt, setInternalInt] = useState(12);
  const [internalKa, setInternalKa] = useState(1.5);

  const dose = controlledDose ?? internalDose;
  const halfLifeHr = controlledHL ?? internalHL;
  const intervalHr = controlledInt ?? internalInt;
  const kaPerHr = controlledKa ?? internalKa;

  const totalHours = Math.max(intervalHr * 6, 48);

  const { curve, cMax, cMin } = useMemo(
    () => computeCurve(dose, halfLifeHr, kaPerHr, intervalHr, totalHours),
    [dose, halfLifeHr, kaPerHr, intervalHr, totalHours],
  );

  const yMax = cMax * 1.1;
  const sx = (t: number) =>
    PAD_L + (t / totalHours) * (W - PAD_L - PAD_R);
  const sy = (c: number) =>
    H - PAD_B - (c / yMax) * (H - PAD_T - PAD_B);

  const pathD = curve
    .map((s, i) => `${i === 0 ? "M" : "L"}${sx(s.t).toFixed(1)},${sy(s.c).toFixed(1)}`)
    .join(" ");
  const fillD = `${pathD} L${sx(totalHours).toFixed(1)},${(H - PAD_B).toFixed(1)} L${sx(0).toFixed(1)},${(H - PAD_B).toFixed(1)} Z`;

  // Vertical dose markers
  const doseMarkers: number[] = [];
  for (let t = 0; t <= totalHours + 0.01; t += intervalHr) doseMarkers.push(t);

  return (
    <div className="my-6 rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-2 border-b border-border bg-muted/50">
        <h4 className="text-sm font-medium font-sans">Plasma concentration vs time (PK)</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          One-compartment oral model. Drag dose, half-life, interval, absorption rate.
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
            <text x={W / 2} y={H - 6} fontSize="9" textAnchor="middle" className="fill-muted-foreground">Time (hours)</text>
            <text x={10} y={H / 2} fontSize="9" textAnchor="middle" transform={`rotate(-90 10 ${H / 2})`} className="fill-muted-foreground">[Drug] (mg/L)</text>

            {/* steady-state ribbon: C_min to C_max */}
            <rect
              x={PAD_L}
              y={sy(cMax)}
              width={W - PAD_L - PAD_R}
              height={sy(cMin) - sy(cMax)}
              fill="currentColor"
              className="text-primary/10"
            />
            <line x1={PAD_L} y1={sy(cMax)} x2={W - PAD_R} y2={sy(cMax)} stroke="currentColor" strokeWidth="0.4" strokeDasharray="2 2" className="text-primary/40" />
            <line x1={PAD_L} y1={sy(cMin)} x2={W - PAD_R} y2={sy(cMin)} stroke="currentColor" strokeWidth="0.4" strokeDasharray="2 2" className="text-primary/40" />

            {/* dose markers */}
            {doseMarkers.map((t, i) => (
              <line
                key={i}
                x1={sx(t)}
                y1={H - PAD_B}
                x2={sx(t)}
                y2={H - PAD_B - 6}
                stroke="currentColor"
                strokeWidth="1"
                className="text-rose-500/70"
              />
            ))}

            {/* curve */}
            <path d={fillD} fill="currentColor" className="text-primary/20" />
            <path d={pathD} fill="none" stroke="currentColor" strokeWidth="1.6" className="text-primary" />

            {/* SS labels */}
            <text x={W - PAD_R - 4} y={sy(cMax) - 3} fontSize="9" textAnchor="end" className="fill-primary">C_max</text>
            <text x={W - PAD_R - 4} y={sy(cMin) + 10} fontSize="9" textAnchor="end" className="fill-primary">C_min</text>
          </svg>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Dose</span>
              <span className="tabular-nums font-medium">{dose.toFixed(0)} mg</span>
            </div>
            <input
              type="range"
              min={50}
              max={2000}
              step={25}
              value={dose}
              onChange={(e) => (controlledDose === undefined) && setInternalDose(parseFloat(e.target.value))}
              disabled={controlledDose !== undefined}
              className="w-full accent-primary"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Half-life</span>
              <span className="tabular-nums font-medium">{halfLifeHr.toFixed(1)} h</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={48}
              step={0.5}
              value={halfLifeHr}
              onChange={(e) => (controlledHL === undefined) && setInternalHL(parseFloat(e.target.value))}
              disabled={controlledHL !== undefined}
              className="w-full accent-primary"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Dose interval</span>
              <span className="tabular-nums font-medium">{intervalHr.toFixed(0)} h</span>
            </div>
            <input
              type="range"
              min={2}
              max={48}
              step={2}
              value={intervalHr}
              onChange={(e) => (controlledInt === undefined) && setInternalInt(parseFloat(e.target.value))}
              disabled={controlledInt !== undefined}
              className="w-full accent-rose-500"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Absorption k_a</span>
              <span className="tabular-nums font-medium">{kaPerHr.toFixed(2)} /h</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={4}
              step={0.05}
              value={kaPerHr}
              onChange={(e) => (controlledKa === undefined) && setInternalKa(parseFloat(e.target.value))}
              disabled={controlledKa !== undefined}
              className="w-full accent-primary"
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 text-[11px] pt-1 border-t border-border">
          <div>
            <div className="text-muted-foreground">C_max (SS)</div>
            <div className="tabular-nums font-medium">{cMax.toFixed(2)} mg/L</div>
          </div>
          <div>
            <div className="text-muted-foreground">C_min (SS)</div>
            <div className="tabular-nums font-medium">{cMin.toFixed(2)} mg/L</div>
          </div>
          <div>
            <div className="text-muted-foreground">Peak/trough</div>
            <div className="tabular-nums font-medium">{cMin > 0 ? (cMax / cMin).toFixed(2) : "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">τ / t½</div>
            <div className="tabular-nums font-medium">{(intervalHr / halfLifeHr).toFixed(2)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

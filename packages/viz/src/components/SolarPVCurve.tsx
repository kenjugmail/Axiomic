import { useMemo, useState } from "react";

// Interactive solar-PV I-V + P-V curves. Drag irradiance + temperature
// sliders; the curves rescale + the maximum-power-point (MPP) marker
// tracks the optimum. Uses the single-diode model with a Newton-style
// inversion at each voltage step.
//
// Model:
//   I(V) = I_ph - I_0 * (exp((V + I*R_s) / (a*V_th)) - 1) - (V + I*R_s)/R_sh
// We use the simplified ideal-diode form (R_s ≈ 0, R_sh → ∞) which is
// what intro textbooks present + which captures the qualitative shape
// faithfully. Adjusted for cell temperature via V_th = nkT/q.

const Q = 1.602176634e-19;        // electron charge
const K_B = 1.380649e-23;          // Boltzmann
const T_REF = 298.15;              // 25°C reference, K
const G_REF = 1000;                // STC irradiance W/m^2
const N_CELLS = 60;                // typical residential panel
const I_SC_REF = 9.5;              // short-circuit current at STC (A)
const V_OC_REF = 0.62 * N_CELLS;   // open-circuit voltage at STC (V)
const I_0_REF = 1e-10;             // diode saturation current
const N = 1.3;                     // ideality factor

interface CurvePoint {
  v: number;
  i: number;
  p: number;
}

function computeCurve(G: number, T: number): CurvePoint[] {
  const v_th = (N * K_B * T) / Q;
  // I_ph scales with irradiance + small T term we lump into I_sc
  const i_sc = I_SC_REF * (G / G_REF) * (1 + 0.0005 * (T - T_REF));
  // V_oc has a strong negative temperature coefficient (~-2 mV/°C/cell)
  const v_oc =
    V_OC_REF * (1 + (Math.log(Math.max(G, 1) / G_REF) / 25)) +
    -0.002 * N_CELLS * (T - T_REF);
  const steps = 80;
  const out: CurvePoint[] = [];
  for (let s = 0; s <= steps; s++) {
    const v = (v_oc * s) / steps;
    // Ideal diode current at voltage v:
    //   I = I_sc - I_0 * (exp(v / (N_cells * v_th)) - 1)
    const exponent = v / (N_CELLS * v_th);
    const diodeI = I_0_REF * (Math.exp(Math.min(exponent, 80)) - 1);
    const i = Math.max(0, i_sc - diodeI);
    out.push({ v, i, p: v * i });
  }
  return out;
}

function findMPP(curve: CurvePoint[]): CurvePoint {
  let best = curve[0]!;
  for (const pt of curve) if (pt.p > best.p) best = pt;
  return best;
}

const W = 360;
const H = 200;
const PAD_L = 36;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 28;

interface Props {
  irradiance?: number;
  temperatureC?: number;
}

export function SolarPVCurve({
  irradiance: controlledG,
  temperatureC: controlledT,
}: Props = {}) {
  const [internalG, setInternalG] = useState(1000);
  const [internalT, setInternalT] = useState(25);

  const G = controlledG ?? internalG;
  const T_C = controlledT ?? internalT;
  const T_K = T_C + 273.15;

  const { curve, mpp, vScale, iScale, pScale } = useMemo(() => {
    const c = computeCurve(G, T_K);
    const m = findMPP(c);
    const vMax = Math.max(...c.map((p) => p.v), 1);
    const iMax = Math.max(...c.map((p) => p.i), 1);
    const pMax = Math.max(...c.map((p) => p.p), 1);
    return { curve: c, mpp: m, vScale: vMax, iScale: iMax, pScale: pMax };
  }, [G, T_K]);

  const sx = (v: number) => PAD_L + (v / vScale) * (W - PAD_L - PAD_R);
  const syI = (i: number) => H - PAD_B - (i / iScale) * (H - PAD_T - PAD_B);
  const syP = (p: number) => H - PAD_B - (p / pScale) * (H - PAD_T - PAD_B);

  const iPath = curve
    .map((pt, idx) => `${idx === 0 ? "M" : "L"}${sx(pt.v).toFixed(1)},${syI(pt.i).toFixed(1)}`)
    .join(" ");
  const pPath = curve
    .map((pt, idx) => `${idx === 0 ? "M" : "L"}${sx(pt.v).toFixed(1)},${syP(pt.p).toFixed(1)}`)
    .join(" ");

  const fillFraction =
    mpp.p / (curve[curve.length - 1]!.v * curve[0]!.i || 1); // ~ MPP/(V_oc*I_sc) = FF

  return (
    <div className="my-6 rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-2 border-b border-border bg-muted/50">
        <h4 className="text-sm font-medium font-sans">Solar PV I-V + P-V curves</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          Drag irradiance + cell temperature. The dot marks the maximum-power point (MPP).
        </p>
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-border bg-background p-2">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs font-medium">I-V curve</span>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                I_sc = {curve[0]!.i.toFixed(2)} A
              </span>
            </div>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full h-auto"
              preserveAspectRatio="xMidYMid meet"
            >
              {/* axes */}
              <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="currentColor" strokeWidth="0.5" className="text-muted-foreground/50" />
              <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="currentColor" strokeWidth="0.5" className="text-muted-foreground/50" />
              {/* axis labels */}
              <text x={W / 2} y={H - 6} fontSize="9" textAnchor="middle" className="fill-muted-foreground">Voltage (V)</text>
              <text x={10} y={H / 2} fontSize="9" textAnchor="middle" transform={`rotate(-90 10 ${H / 2})`} className="fill-muted-foreground">Current (A)</text>
              {/* curve */}
              <path d={iPath} fill="none" stroke="currentColor" strokeWidth="1.6" className="text-primary" />
              {/* MPP marker */}
              <line x1={sx(mpp.v)} y1={syI(mpp.i)} x2={sx(mpp.v)} y2={H - PAD_B} stroke="currentColor" strokeWidth="0.4" strokeDasharray="2 2" className="text-primary/60" />
              <circle cx={sx(mpp.v)} cy={syI(mpp.i)} r="3" fill="currentColor" className="text-primary" />
            </svg>
          </div>
          <div className="rounded-md border border-border bg-background p-2">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs font-medium">P-V curve</span>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                P_max = {mpp.p.toFixed(1)} W
              </span>
            </div>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full h-auto"
              preserveAspectRatio="xMidYMid meet"
            >
              <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="currentColor" strokeWidth="0.5" className="text-muted-foreground/50" />
              <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="currentColor" strokeWidth="0.5" className="text-muted-foreground/50" />
              <text x={W / 2} y={H - 6} fontSize="9" textAnchor="middle" className="fill-muted-foreground">Voltage (V)</text>
              <text x={10} y={H / 2} fontSize="9" textAnchor="middle" transform={`rotate(-90 10 ${H / 2})`} className="fill-muted-foreground">Power (W)</text>
              <path d={pPath} fill="none" stroke="currentColor" strokeWidth="1.6" className="text-emerald-500" />
              <line x1={sx(mpp.v)} y1={syP(mpp.p)} x2={sx(mpp.v)} y2={H - PAD_B} stroke="currentColor" strokeWidth="0.4" strokeDasharray="2 2" className="text-emerald-500/60" />
              <circle cx={sx(mpp.v)} cy={syP(mpp.p)} r="3" fill="currentColor" className="text-emerald-500" />
            </svg>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Irradiance</span>
              <span className="tabular-nums font-medium">{G.toFixed(0)} W/m²</span>
            </div>
            <input
              type="range"
              min={100}
              max={1200}
              step={25}
              value={G}
              onChange={(e) => (controlledG === undefined) && setInternalG(parseFloat(e.target.value))}
              disabled={controlledG !== undefined}
              className="w-full accent-primary"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Cell temp</span>
              <span className="tabular-nums font-medium">{T_C.toFixed(0)} °C</span>
            </div>
            <input
              type="range"
              min={-10}
              max={70}
              step={1}
              value={T_C}
              onChange={(e) => (controlledT === undefined) && setInternalT(parseFloat(e.target.value))}
              disabled={controlledT !== undefined}
              className="w-full accent-primary"
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 text-[11px] pt-1 border-t border-border">
          <div>
            <div className="text-muted-foreground">V_oc</div>
            <div className="tabular-nums font-medium">{curve[curve.length - 1]!.v.toFixed(1)} V</div>
          </div>
          <div>
            <div className="text-muted-foreground">I_sc</div>
            <div className="tabular-nums font-medium">{curve[0]!.i.toFixed(2)} A</div>
          </div>
          <div>
            <div className="text-muted-foreground">P_max</div>
            <div className="tabular-nums font-medium">{mpp.p.toFixed(1)} W</div>
          </div>
          <div>
            <div className="text-muted-foreground">Fill factor</div>
            <div className="tabular-nums font-medium">{fillFraction.toFixed(2)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

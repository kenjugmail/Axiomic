import { useMemo, useState } from "react";

// Butler-Volmer equation:
//   i = i₀ [ exp(αnFη/RT) - exp(-(1-α)nFη/RT) ]
// where η = E - E_eq is the overpotential. Drag exchange current i₀
// and transfer coefficient α; see the I-η curve. Asymptotically large
// |η| → Tafel behavior (log|i| vs η is linear with slope ±2.303RT/αnF).

const W = 460;
const H = 280;

interface Props {
  i0?: number;     // exchange current density A/cm²
  alpha?: number;  // transfer coefficient
  n?: number;      // electrons transferred
}

export function ButlerVolmerCurve({ i0: ctlI0, alpha: ctlA, n: ctlN }: Props = {}) {
  const [intI0, setIntI0] = useState(1e-3);
  const [intA, setIntA] = useState(0.5);
  const [intN, setIntN] = useState(1);
  const i0 = ctlI0 ?? intI0;
  const a = ctlA ?? intA;
  const n = ctlN ?? intN;

  const F = 96485;
  const R = 8.314;
  const T = 298;
  const f = n * F / (R * T);

  const data = useMemo(() => {
    const pts: Array<{ eta: number; i: number }> = [];
    for (let eta = -0.4; eta <= 0.4; eta += 0.005) {
      const i = i0 * (Math.exp(a * f * eta) - Math.exp(-(1 - a) * f * eta));
      pts.push({ eta, i });
    }
    return pts;
  }, [i0, a, n]);

  const baseX = 60;
  const baseY = 20;
  const plotW = W - 80;
  const plotH = H - 80;
  const iMax = i0 * Math.exp(a * f * 0.4); // approx peak
  const yMax = iMax;
  const xMin = -0.4;
  const xMax = 0.4;
  const xOf = (x: number) => baseX + ((x - xMin) / (xMax - xMin)) * plotW;
  const yOf = (y: number) => baseY + plotH / 2 - (y / yMax) * (plotH / 2);

  const path = data.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.eta).toFixed(2)},${yOf(p.i).toFixed(2)}`).join(" ");

  // Tafel slopes
  const tafelCathodic = 2.303 * R * T / ((1 - a) * n * F) * 1000; // mV/decade
  const tafelAnodic = 2.303 * R * T / (a * n * F) * 1000;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Butler-Volmer · i₀ = {i0.toExponential(1)} A/cm² · α = {a.toFixed(2)} · n = {n}</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Butler-Volmer curve">
        <rect x={baseX} y={baseY} width={plotW} height={plotH} fill="none" stroke="#475569" strokeWidth={0.5} />
        {/* x=0 vertical line */}
        <line x1={xOf(0)} y1={baseY} x2={xOf(0)} y2={baseY + plotH} stroke="#1f2937" strokeWidth={0.5} />
        {/* y=0 horizontal line */}
        <line x1={baseX} y1={baseY + plotH / 2} x2={baseX + plotW} y2={baseY + plotH / 2} stroke="#1f2937" strokeWidth={0.5} />
        {/* η ticks */}
        {[-0.3, -0.15, 0, 0.15, 0.3].map((e) => (
          <text key={`x-${e}`} x={xOf(e)} y={baseY + plotH + 10} fill="#9aa3b8" fontSize="8" textAnchor="middle">{(e * 1000).toFixed(0)}</text>
        ))}
        <text x={baseX + plotW / 2} y={baseY + plotH + 22} fill="#cbd1e6" fontSize="9" textAnchor="middle">η = E - E_eq (mV)</text>
        <text x={12} y={baseY + plotH / 2} fill="#cbd1e6" fontSize="9" textAnchor="middle" transform={`rotate(-90, 12, ${baseY + plotH / 2})`}>i (A/cm²)</text>
        <text x={xOf(0.32)} y={yOf(yMax) + 10} fill="#fbbf24" fontSize="8">anodic (+)</text>
        <text x={xOf(-0.34)} y={yOf(-yMax) - 4} fill="#fbbf24" fontSize="8">cathodic (-)</text>
        {/* The BV curve */}
        <path d={path} fill="none" stroke="#4ecdc4" strokeWidth={2} />
        {/* i₀ marker at origin */}
        <circle cx={xOf(0)} cy={yOf(0)} r={3} fill="#fbbf24" />
        <text x={xOf(0) + 6} y={yOf(0) - 4} fill="#fbbf24" fontSize="8">η=0, i=0</text>
      </svg>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <label className="block">log i₀: {Math.log10(i0).toFixed(1)}
          <input type="range" min={-9} max={-1} step={0.1} value={Math.log10(i0)} onChange={(e) => setIntI0(Math.pow(10, parseFloat(e.target.value)))} disabled={ctlI0 !== undefined} className="w-full mt-0.5" aria-label="Exchange current" />
        </label>
        <label className="block">α: {a.toFixed(2)}
          <input type="range" min={0.1} max={0.9} step={0.05} value={a} onChange={(e) => setIntA(parseFloat(e.target.value))} disabled={ctlA !== undefined} className="w-full mt-0.5" aria-label="Transfer coefficient" />
        </label>
        <label className="block col-span-2">Tafel slope anodic ≈ {tafelAnodic.toFixed(0)} mV/decade · cathodic ≈ {tafelCathodic.toFixed(0)} mV/decade</label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Butler-Volmer (1924/1930): the workhorse rate equation for
        electrochemical kinetics. Near η = 0 the I-η curve is linear
        (R_ct = RT/nFi₀ = "polarization resistance" — basis of LSV);
        far from equilibrium one branch dominates and we recover the
        Tafel law ln|i| = ln i₀ + (αnF/RT)η. Larger i₀ ⇒ faster kinetics
        (Pt ~10⁻³ A/cm² for HER, Hg ~10⁻¹² A/cm² — almost reversible vs
        irreversible). α (symmetry factor) ≈ 0.5 for one-step ET;
        deviations point to multi-step mechanisms or non-standard
        electrode-solution structure. Marcus theory extends this to
        the curvature near very large η.
      </div>
    </div>
  );
}

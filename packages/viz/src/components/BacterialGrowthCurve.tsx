import { useMemo, useState } from "react";

// Bacterial growth curve OD600 model. Lag → exponential → stationary
// → death phases. Use a logistic (Monod-coupled-to-substrate) model:
//   dN/dt = μ_max * (S/(Ks+S)) * N
//   dS/dt = -1/Y * dN/dt
// then death when S near zero. Drag μ_max (related to doubling time),
// K_s (substrate-affinity constant), Y (yield), and initial substrate.

const W = 460;
const H = 320;

interface Props {
  doublingTime?: number;
  Ks?: number;
  S0?: number;
}

export function BacterialGrowthCurve({ doublingTime: ctlD, Ks: ctlKs, S0: ctlS0 }: Props = {}) {
  const [intD, setIntD] = useState(20); // minutes
  const [intKs, setIntKs] = useState(0.5);
  const [intS0, setIntS0] = useState(10);
  const T_double = ctlD ?? intD;
  const Ks = ctlKs ?? intKs;
  const S0 = ctlS0 ?? intS0;

  const muMax = Math.log(2) / (T_double / 60); // 1/hour
  const Y = 0.5;
  const N0 = 0.001; // initial OD600
  const lagHours = 1.0;
  const deathRate = 0.5; // /hour after substrate depletion

  const curve = useMemo(() => {
    const dt = 0.05; // hours
    const tMax = 12; // hours
    const points: Array<{ t: number; N: number; S: number; phase: string }> = [];
    let N = N0;
    let S = S0;
    for (let t = 0; t <= tMax; t += dt) {
      let phase: string;
      let dN = 0;
      if (t < lagHours) {
        phase = "lag";
        dN = 0;
      } else if (S > 0.01) {
        const mu = muMax * (S / (Ks + S));
        dN = mu * N;
        phase = mu > muMax * 0.5 ? "exponential" : "stationary";
      } else {
        dN = -deathRate * N;
        phase = "death";
      }
      const dS = -dN / Y;
      points.push({ t, N, S, phase });
      N = Math.max(0.0001, N + dN * dt);
      S = Math.max(0, S + dS * dt);
    }
    return points;
  }, [muMax, Ks, S0, Y]);

  const baseX = 36;
  const baseY = 16;
  const plotW = W - baseX - 36;
  const plotH = H - baseY - 80;
  const xOf = (t: number) => baseX + (t / 12) * plotW;
  // Log-scale on Y for the classic growth curve appearance
  const yMaxLog = 1; // log10(10) = 1
  const yMinLog = -4; // log10(1e-4)
  const yOf = (N: number) => baseY + plotH - ((Math.log10(Math.max(N, 1e-5)) - yMinLog) / (yMaxLog - yMinLog)) * plotH;
  const ySOf = (S: number) => baseY + plotH - (S / (S0 * 1.1)) * plotH;

  const phaseColor = (p: string) => ({
    lag: "#475569",
    exponential: "#4ecdc4",
    stationary: "#fbbf24",
    death: "#ff6b6b",
  })[p] ?? "#475569";

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Growth curve · t_d {T_double} min · μ_max {muMax.toFixed(2)} h⁻¹ · K_s {Ks.toFixed(2)}</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Bacterial growth curve">
        <rect x={baseX} y={baseY} width={plotW} height={plotH} fill="none" stroke="#1f2937" strokeWidth={0.5} />
        {/* Y-axis (log) */}
        {[1e-4, 1e-3, 1e-2, 1e-1, 1].map((n) => (
          <g key={n}>
            <line x1={baseX - 3} y1={yOf(n)} x2={baseX} y2={yOf(n)} stroke="#475569" strokeWidth={0.5} />
            <text x={baseX - 5} y={yOf(n) + 3} fill="#9aa3b8" fontSize="8" textAnchor="end">{n < 1 ? n.toExponential(0) : "1"}</text>
          </g>
        ))}
        {/* Substrate (right axis) */}
        {[0, S0 / 2, S0].map((s) => (
          <g key={s}>
            <line x1={baseX + plotW} y1={ySOf(s)} x2={baseX + plotW + 3} y2={ySOf(s)} stroke="#a78bfa" strokeWidth={0.5} />
            <text x={baseX + plotW + 5} y={ySOf(s) + 3} fill="#a78bfa" fontSize="8">{s.toFixed(1)}</text>
          </g>
        ))}
        {/* Phase shading by color along x */}
        {curve.map((p, i) => {
          if (i === 0) return null;
          return <rect key={i} x={xOf(curve[i - 1].t)} y={baseY + plotH + 2} width={xOf(p.t) - xOf(curve[i - 1].t)} height={6} fill={phaseColor(p.phase)} />;
        })}
        {/* OD curve */}
        <path d={curve.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.t).toFixed(1)},${yOf(p.N).toFixed(1)}`).join(" ")} fill="none" stroke="#4ecdc4" strokeWidth={2} />
        {/* Substrate curve */}
        <path d={curve.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.t).toFixed(1)},${ySOf(p.S).toFixed(1)}`).join(" ")} fill="none" stroke="#a78bfa" strokeWidth={1} strokeDasharray="3,2" />
        <text x={baseX + plotW / 2} y={H - 28} fill="#cbd1e6" fontSize="10" textAnchor="middle">time (hours)</text>
        <text x={14} y={baseY + plotH / 2 - 30} fill="#4ecdc4" fontSize="9" textAnchor="middle" transform={`rotate(-90, 14, ${baseY + plotH / 2 - 30})`}>OD600 (log)</text>
        <text x={W - 14} y={baseY + plotH / 2 - 30} fill="#a78bfa" fontSize="9" textAnchor="middle" transform={`rotate(90, ${W - 14}, ${baseY + plotH / 2 - 30})`}>substrate S</text>
      </svg>

      <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
        <label className="block">t_double (min): {T_double}
          <input type="range" min={10} max={120} step={5} value={T_double} onChange={(e) => setIntD(parseInt(e.target.value))} disabled={ctlD !== undefined} className="w-full mt-0.5" aria-label="Doubling time" />
        </label>
        <label className="block">K_s: {Ks.toFixed(2)}
          <input type="range" min={0.05} max={3} step={0.05} value={Ks} onChange={(e) => setIntKs(parseFloat(e.target.value))} disabled={ctlKs !== undefined} className="w-full mt-0.5" aria-label="Ks" />
        </label>
        <label className="block">initial S: {S0.toFixed(1)}
          <input type="range" min={1} max={30} step={0.5} value={S0} onChange={(e) => setIntS0(parseFloat(e.target.value))} disabled={ctlS0 !== undefined} className="w-full mt-0.5" aria-label="S0" />
        </label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Classic batch-culture curve. <span style={{ color: "#475569" }}>Lag</span> —
        cells adjust to the medium (enzyme induction, repair); duration
        depends on inoculum size + history. <span style={{ color: "#4ecdc4" }}>Exponential</span> —
        balanced growth at μ_max (E. coli ≈ 20 min in LB at 37°C;
        Mycobacterium tuberculosis ≈ 24 h). <span style={{ color: "#fbbf24" }}>Stationary</span> —
        substrate depletion + waste accumulation; μ ≈ death rate.
        <span style={{ color: "#ff6b6b" }}>Death</span> phase — programmed +
        stochastic lysis. The chemostat (Novick-Szilard 1950, Monod
        1950) decouples growth rate from substrate by continuous
        feeding at fixed dilution rate D, yielding steady-state μ = D.
        VBNC (viable but non-culturable) cells in stationary may not
        regrow on plates yet remain metabolically active (Oliver 2010).
      </div>
    </div>
  );
}

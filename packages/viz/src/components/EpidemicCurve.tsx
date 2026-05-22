import { useMemo, useState } from "react";

// SIR / SEIR epidemic dynamics. Kermack-McKendrick 1927:
//   dS/dt = -β·S·I/N
//   dI/dt = β·S·I/N - γ·I
//   dR/dt = γ·I
// with R₀ = β/γ. SEIR adds an exposed compartment.
// Optional intervention (lockdown / vaccination) drops β at a chosen day.

const W = 460;
const H = 320;

interface Props {
  R0?: number;
  model?: "SIR" | "SEIR";
  intervention?: number;  // day; -1 disabled
  vaxCoverage?: number;   // initial fraction immune
}

interface Series {
  t: number[];
  S: number[];
  E: number[];
  I: number[];
  R: number[];
}

function simulate(model: "SIR" | "SEIR", R0: number, interventionDay: number, interventionReduction: number, vaxCoverage: number, days = 200, dt = 0.5): Series {
  const N = 1;
  const gamma = 0.1;             // recovery rate (~10-day infectious period)
  const sigma = 0.2;             // latency rate for SEIR (~5-day incubation)
  let S = (1 - vaxCoverage) - 0.001;
  let E = model === "SEIR" ? 0.001 : 0;
  let I = model === "SIR" ? 0.001 : 0;
  let R = vaxCoverage;
  const out: Series = { t: [0], S: [S], E: [E], I: [I], R: [R] };
  for (let t = dt; t <= days; t += dt) {
    const beta = (t >= interventionDay && interventionDay > 0)
      ? R0 * gamma * interventionReduction
      : R0 * gamma;
    if (model === "SEIR") {
      const dS = -beta * S * I / N;
      const dE = beta * S * I / N - sigma * E;
      const dI = sigma * E - gamma * I;
      const dR = gamma * I;
      S += dS * dt; E += dE * dt; I += dI * dt; R += dR * dt;
    } else {
      const dS = -beta * S * I / N;
      const dI = beta * S * I / N - gamma * I;
      const dR = gamma * I;
      S += dS * dt; I += dI * dt; R += dR * dt;
    }
    out.t.push(t); out.S.push(S); out.E.push(E); out.I.push(I); out.R.push(R);
  }
  return out;
}

export function EpidemicCurve({ R0: ctlR0, model: ctlModel, intervention: ctlInt, vaxCoverage: ctlVax }: Props = {}) {
  const [intR0, setIntR0] = useState(2.5);
  const [intModel, setIntModel] = useState<"SIR" | "SEIR">("SIR");
  const [intInt, setIntInt] = useState(-1);
  const [intInterventionR, setIntInterventionR] = useState(0.5);
  const [intVax, setIntVax] = useState(0);
  const R0 = ctlR0 ?? intR0;
  const model = ctlModel ?? intModel;
  const intervention = ctlInt ?? intInt;
  const vaxCoverage = ctlVax ?? intVax;

  const sim = useMemo(
    () => simulate(model, R0, intervention, intInterventionR, vaxCoverage),
    [model, R0, intervention, intInterventionR, vaxCoverage],
  );

  const peakI = Math.max(...sim.I);
  const peakDay = sim.t[sim.I.indexOf(peakI)];
  const finalR = sim.R[sim.R.length - 1];
  const herdImmunity = 1 - 1 / R0;

  const baseX = 36;
  const baseY = 16;
  const plotW = W - baseX - 16;
  const plotH = H - baseY - 100;
  const xOf = (t: number) => baseX + (t / Math.max(...sim.t)) * plotW;
  const yOf = (v: number) => baseY + plotH - v * plotH;

  const pathStr = (vals: number[]) => sim.t.map((t, i) => `${i === 0 ? "M" : "L"}${xOf(t).toFixed(1)},${yOf(vals[i]).toFixed(1)}`).join(" ");

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">{model} · R₀ = {R0.toFixed(2)} · peak {(peakI * 100).toFixed(1)}% day {peakDay.toFixed(0)} · attack rate {(finalR * 100).toFixed(0)}% · HIT {(herdImmunity * 100).toFixed(0)}%</div>
        <div className="flex gap-1">
          {(["SIR", "SEIR"] as const).map((m) => (
            <button key={m} onClick={() => setIntModel(m)} disabled={ctlModel !== undefined} className={`px-1.5 py-0.5 rounded text-[9px] ${model === m ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{m}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Epidemic curve">
        <rect x={baseX} y={baseY} width={plotW} height={plotH} fill="none" stroke="#1f2937" strokeWidth={0.5} />
        {/* Gridlines */}
        {[0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={baseX} y1={yOf(v)} x2={baseX + plotW} y2={yOf(v)} stroke="#1f2937" strokeWidth={0.3} />
            <text x={baseX - 4} y={yOf(v) + 3} fill="#9aa3b8" fontSize="8" textAnchor="end">{(v * 100).toFixed(0)}%</text>
          </g>
        ))}
        {/* Herd-immunity threshold */}
        <line x1={baseX} y1={yOf(herdImmunity)} x2={baseX + plotW} y2={yOf(herdImmunity)} stroke="#fbbf24" strokeWidth={0.8} strokeDasharray="3,3" />
        <text x={baseX + plotW - 4} y={yOf(herdImmunity) - 3} fill="#fbbf24" fontSize="8" textAnchor="end">herd immunity</text>
        {/* Intervention line */}
        {intervention > 0 && (
          <g>
            <line x1={xOf(intervention)} y1={baseY} x2={xOf(intervention)} y2={baseY + plotH} stroke="#a78bfa" strokeWidth={0.8} strokeDasharray="3,3" />
            <text x={xOf(intervention) + 3} y={baseY + 8} fill="#a78bfa" fontSize="8">intervention</text>
          </g>
        )}
        {/* Curves */}
        <path d={pathStr(sim.S)} fill="none" stroke="#60a5fa" strokeWidth={1.5} />
        <path d={pathStr(sim.I)} fill="none" stroke="#ff6b6b" strokeWidth={1.8} />
        <path d={pathStr(sim.R)} fill="none" stroke="#4ecdc4" strokeWidth={1.5} />
        {model === "SEIR" && <path d={pathStr(sim.E)} fill="none" stroke="#fbbf24" strokeWidth={1.2} />}
        <text x={baseX + plotW / 2} y={H - 78} fill="#cbd1e6" fontSize="9" textAnchor="middle">days since outbreak</text>
        <g transform={`translate(${baseX}, ${H - 64})`}>
          <line x1={0} y1={4} x2={14} y2={4} stroke="#60a5fa" strokeWidth={2} /><text x={18} y={7} fill="#cbd1e6" fontSize="9">S</text>
          {model === "SEIR" && <><line x1={42} y1={4} x2={56} y2={4} stroke="#fbbf24" strokeWidth={2} /><text x={60} y={7} fill="#cbd1e6" fontSize="9">E</text></>}
          <line x1={86} y1={4} x2={100} y2={4} stroke="#ff6b6b" strokeWidth={2} /><text x={104} y={7} fill="#cbd1e6" fontSize="9">I</text>
          <line x1={124} y1={4} x2={138} y2={4} stroke="#4ecdc4" strokeWidth={2} /><text x={142} y={7} fill="#cbd1e6" fontSize="9">R</text>
        </g>
      </svg>

      <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
        <label className="block">R₀: {R0.toFixed(2)}
          <input type="range" min={0.5} max={6} step={0.1} value={R0} onChange={(e) => setIntR0(parseFloat(e.target.value))} disabled={ctlR0 !== undefined} className="w-full mt-0.5" aria-label="R0" />
        </label>
        <label className="block">vax coverage: {(vaxCoverage * 100).toFixed(0)}%
          <input type="range" min={0} max={0.95} step={0.05} value={vaxCoverage} onChange={(e) => setIntVax(parseFloat(e.target.value))} disabled={ctlVax !== undefined} className="w-full mt-0.5" aria-label="Vaccination" />
        </label>
        <label className="block">intervention day: {intervention}
          <input type="range" min={-1} max={100} step={1} value={intervention} onChange={(e) => setIntInt(parseInt(e.target.value))} disabled={ctlInt !== undefined} className="w-full mt-0.5" aria-label="Intervention day" />
        </label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Kermack-McKendrick 1927: in SIR, dI/dt = (R₀·S - 1)·γ·I.
        Outbreak grows when R₀·S &gt; 1, declines when S falls below
        1/R₀ — the herd-immunity threshold HIT = 1 - 1/R₀. Measles
        R₀ ~12-18 → HIT ≈ 92-95%, smallpox ~5-7 → 80-86%, COVID-19
        ancestral ~2-3 → 50-67%, Delta ~5-8, Omicron higher. Final
        attack rate exceeds HIT because of overshoot (epidemic
        keeps spreading after R_e drops below 1, until enough
        infectious cases clear). Anderson-May Infectious Diseases
        of Humans 1991 is the canonical reference. SEIR adds latency
        (exposed-not-infectious) — slows the early curve, doesn't
        change final size much.
      </div>
    </div>
  );
}

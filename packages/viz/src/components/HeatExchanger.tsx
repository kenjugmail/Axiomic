import { useMemo, useState } from "react";

// Heat-exchanger flow arrangement. Two fluids exchange heat across a wall;
// the driving force is the local temperature difference ΔT. In PARALLEL
// flow both enter the same end, so ΔT is huge at the inlet and collapses as
// the streams converge toward a common temperature. In COUNTERFLOW they
// enter opposite ends, holding a more uniform ΔT along the whole length — so
// the cold outlet can exceed the hot outlet, and the log-mean ΔT (LMTD) is
// larger, making counterflow the more effective (and more common) design.

const W = 460;
const H = 300;
const TH_IN = 90, TC_IN = 20;

type Mode = "Counterflow" | "Parallel flow";
const ORDER: Mode[] = ["Counterflow", "Parallel flow"];

function lmtd(dt1: number, dt2: number): number {
  if (Math.abs(dt1 - dt2) < 1e-6) return dt1;
  return (dt1 - dt2) / Math.log(dt1 / dt2);
}

interface Props { mode?: Mode; }

export function HeatExchanger({ mode: ctl }: Props = {}) {
  const [intMode, setIntMode] = useState<Mode>("Counterflow");
  const mode = ctl ?? intMode;

  // Temperature profiles along x ∈ [0,1].
  const th = (x: number) => (mode === "Parallel flow" ? 55 + 35 * Math.exp(-3 * x) : 90 - 30 * x);
  const tc = (x: number) => (mode === "Parallel flow" ? 55 - 35 * Math.exp(-3 * x) : 50 - 30 * x);
  const dt1 = th(0) - tc(0);
  const dt2 = th(1) - tc(1);
  const meanDt = lmtd(dt1, dt2);

  const baseX = 44, baseY = 250, plotW = W - baseX - 16, plotH = 200, TMAX = 100;
  const xOf = (x: number) => baseX + x * plotW;
  const yOf = (t: number) => baseY - (t / TMAX) * plotH;
  const curve = useMemo(() => {
    const mk = (f: (x: number) => number) => Array.from({ length: 61 }, (_, i) => { const x = i / 60; return `${i === 0 ? "M" : "L"}${xOf(x).toFixed(1)},${yOf(f(x)).toFixed(1)}`; }).join(" ");
    return { hot: mk(th), cold: mk(tc) };
  }, [mode]);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">{mode} · LMTD ≈ {meanDt.toFixed(1)}°C</div>
        <div className="flex gap-1">
          {ORDER.map((m) => (
            <button key={m} onClick={() => setIntMode(m)} disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${mode === m ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{m === "Counterflow" ? "Counterflow" : "Parallel"}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Heat exchanger temperature profiles">
        <line x1={baseX} y1={baseY} x2={baseX + plotW} y2={baseY} stroke="#334155" strokeWidth={0.8} />
        <line x1={baseX} y1={baseY - plotH} x2={baseX} y2={baseY} stroke="#334155" strokeWidth={0.8} />
        {[25, 50, 75, 100].map((t) => (<g key={t}><line x1={baseX} y1={yOf(t)} x2={baseX + plotW} y2={yOf(t)} stroke="#1f2937" strokeWidth={0.3} /><text x={baseX - 4} y={yOf(t) + 3} fill="#9aa3b8" fontSize="7.5" textAnchor="end">{t}</text></g>))}
        <text x={baseX + plotW / 2} y={baseY + 14} fill="#cbd1e6" fontSize="8.5" textAnchor="middle">position along exchanger →</text>
        <text x={14} y={baseY - plotH / 2} fill="#cbd1e6" fontSize="8.5" textAnchor="middle" transform={`rotate(-90 14 ${baseY - plotH / 2})`}>temperature (°C)</text>

        {/* ΔT markers */}
        <line x1={xOf(0)} y1={yOf(th(0))} x2={xOf(0)} y2={yOf(tc(0))} stroke="#64748b" strokeWidth={0.7} strokeDasharray="2,2" />
        <text x={xOf(0) + 4} y={(yOf(th(0)) + yOf(tc(0))) / 2} fill="#94a3b8" fontSize="7">ΔT={dt1.toFixed(0)}</text>
        <line x1={xOf(1)} y1={yOf(th(1))} x2={xOf(1)} y2={yOf(tc(1))} stroke="#64748b" strokeWidth={0.7} strokeDasharray="2,2" />
        <text x={xOf(1) - 4} y={(yOf(th(1)) + yOf(tc(1))) / 2} fill="#94a3b8" fontSize="7" textAnchor="end">ΔT={dt2.toFixed(0)}</text>

        {/* curves */}
        <path d={curve.hot} fill="none" stroke="#f87171" strokeWidth={2.2} />
        <path d={curve.cold} fill="none" stroke="#38bdf8" strokeWidth={2.2} />

        {/* flow arrows */}
        <text x={xOf(0.5)} y={yOf(th(0.5)) - 6} fill="#f87171" fontSize="8" textAnchor="middle">hot →</text>
        <text x={xOf(0.5)} y={yOf(tc(0.5)) + 14} fill="#38bdf8" fontSize="8" textAnchor="middle">cold {mode === "Counterflow" ? "←" : "→"}</text>
      </svg>

      <div className="mt-1 text-[10px] text-muted-foreground">
        Heat flows across the wall at a rate set by the local <b>ΔT</b>. In
        <b> parallel flow</b> the streams start far apart and converge, so ΔT
        crashes and the cold outlet can never exceed the hot outlet. In
        <b> counterflow</b> the opposed streams hold a near-uniform ΔT, the
        cold fluid can leave hotter than the hot fluid does, and the
        <b> log-mean temperature difference (LMTD)</b> is larger — more heat
        transferred per unit area. That's why most real exchangers run
        counterflow.
      </div>
    </div>
  );
}

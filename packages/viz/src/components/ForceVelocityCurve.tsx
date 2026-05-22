import { useMemo, useState } from "react";

// Hill's force–velocity relationship for skeletal muscle (A.V. Hill,
// 1938). As the load on a muscle rises, its shortening velocity falls
// along a hyperbola: (F + a)(v + b) = (F0 + a)b, so v = b(F0 − F)/(F + a),
// where F0 is the maximum isometric force. Mechanical power P = F·v is
// zero at both ends (no velocity at F0, no force at vmax) and peaks near
// ~1/3 of F0 — which is why athletes train at intermediate loads for peak
// power. Fast (Type II) fibers reach a higher vmax than slow (Type I).

const W = 460;
const H = 340;

type Fiber = "Fast (Type II)" | "Slow (Type I)";
const FIBER: Record<Fiber, { vmax: number; k: number }> = {
  // k = a/F0 (curvature); b = vmax·k so v(0)=vmax, v(F0)=0.
  "Fast (Type II)": { vmax: 8, k: 0.25 },
  "Slow (Type I)": { vmax: 4, k: 0.25 },
};
const ORDER: Fiber[] = ["Fast (Type II)", "Slow (Type I)"];

const V_AXIS = 8; // shared velocity axis (L0/s) so fiber types compare
const P_AXIS = 0.85; // shared power axis (F0·L0/s)

interface Props {
  fiber?: Fiber;
}

export function ForceVelocityCurve({ fiber: ctl }: Props = {}) {
  const [intFiber, setIntFiber] = useState<Fiber>("Fast (Type II)");
  const [loadPct, setLoadPct] = useState(33);
  const fiber = ctl ?? intFiber;
  const { vmax, k } = FIBER[fiber];
  const b = vmax * k;

  const vAt = (F: number) => (F >= 1 ? 0 : (b * (1 - F)) / (F + k));
  const F = loadPct / 100;
  const v = vAt(F);
  const power = F * v;

  const baseX = 56;
  const baseY = 252;
  const plotW = W - baseX - 70;
  const plotH = baseY - 40;
  const xOf = (f: number) => baseX + f * plotW;
  const yV = (vel: number) => baseY - (vel / V_AXIS) * plotH;
  const yP = (p: number) => baseY - (p / P_AXIS) * plotH;

  const { vCurve, pCurve } = useMemo(() => {
    const vc: string[] = [];
    const pc: string[] = [];
    for (let i = 0; i <= 100; i++) {
      const f = i / 100;
      const vv = vAt(f);
      vc.push(`${i === 0 ? "M" : "L"}${xOf(f).toFixed(1)},${yV(vv).toFixed(1)}`);
      pc.push(`${i === 0 ? "M" : "L"}${xOf(f).toFixed(1)},${yP(f * vv).toFixed(1)}`);
    }
    return { vCurve: vc.join(" "), pCurve: pc.join(" ") };
  }, [vmax, k]);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">
          load {loadPct}% F₀ → v {v.toFixed(2)} · power {power.toFixed(3)}
        </div>
        <div className="flex gap-1">
          {ORDER.map((f) => (
            <button
              key={f}
              onClick={() => setIntFiber(f)}
              disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${
                fiber === f ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Hill force-velocity and power curves">
        {/* axes */}
        <line x1={baseX} y1={baseY} x2={baseX + plotW} y2={baseY} stroke="#334155" strokeWidth={0.8} />
        <line x1={baseX} y1={40} x2={baseX} y2={baseY} stroke="#334155" strokeWidth={0.8} />
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <text key={f} x={xOf(f)} y={baseY + 12} fill="#9aa3b8" fontSize="8" textAnchor="middle">{f}</text>
        ))}
        <text x={baseX + plotW / 2} y={baseY + 26} fill="#cbd1e6" fontSize="9" textAnchor="middle">force (fraction of F₀)</text>
        <text x={16} y={40 + plotH / 2} fill="#38bdf8" fontSize="9" textAnchor="middle" transform={`rotate(-90 16 ${40 + plotH / 2})`}>velocity (L₀/s)</text>
        <text x={W - 12} y={40 + plotH / 2} fill="#fbbf24" fontSize="9" textAnchor="middle" transform={`rotate(90 ${W - 12} ${40 + plotH / 2})`}>power (F₀·L₀/s)</text>

        {/* curves */}
        <path d={vCurve} fill="none" stroke="#38bdf8" strokeWidth={2} />
        <path d={pCurve} fill="none" stroke="#fbbf24" strokeWidth={2} strokeDasharray="5,3" />

        {/* markers at chosen load */}
        <line x1={xOf(F)} y1={40} x2={xOf(F)} y2={baseY} stroke="#64748b" strokeWidth={0.6} strokeDasharray="2,2" />
        <circle cx={xOf(F)} cy={yV(v)} r={4} fill="#38bdf8" />
        <circle cx={xOf(F)} cy={yP(power)} r={4} fill="#fbbf24" />

        {/* endpoints */}
        <circle cx={xOf(0)} cy={yV(vmax)} r={3} fill="#38bdf8" opacity={0.6} />
        <text x={xOf(0) + 6} y={yV(vmax) - 4} fill="#38bdf8" fontSize="8">vmax = {vmax}</text>
        <text x={xOf(1) - 4} y={baseY - 6} fill="#9aa3b8" fontSize="8" textAnchor="end">F₀ (isometric)</text>

        {/* legend */}
        <g transform="translate(70,48)">
          <line x1={0} y1={4} x2={16} y2={4} stroke="#38bdf8" strokeWidth={2} /><text x={20} y={7} fill="#9aa3b8" fontSize="8">force–velocity</text>
          <line x1={0} y1={18} x2={16} y2={18} stroke="#fbbf24" strokeWidth={2} strokeDasharray="4,2" /><text x={20} y={21} fill="#9aa3b8" fontSize="8">power = F·v</text>
        </g>
      </svg>

      <div className="mt-2 text-xs">
        <label className="block">
          load: {loadPct}% of F₀
          <input type="range" min={0} max={100} step={1} value={loadPct} onChange={(e) => setLoadPct(parseInt(e.target.value))} className="w-full mt-0.5" aria-label="Load as fraction of maximum force" />
        </label>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        <b>A.V. Hill</b> (Nobel laureate, 1922) fit muscle shortening to the
        hyperbola <b>(F + a)(v + b) = (F₀ + a)b</b> in 1938. Velocity is
        maximal when unloaded and zero at the isometric force <b>F₀</b>;
        <b> power = F·v</b> therefore peaks at an intermediate load (near
        ~⅓ F₀). <b>Fast (Type II)</b> fibers have a higher <b>vmax</b> than
        <b> slow (Type I)</b> fibers, shifting their whole curve up. Modern
        sport science profiles this force–velocity relationship
        (Samozino &amp; Morin) to prescribe training loads for peak power.
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";

// X-ray attenuation — the physics behind every radiograph and CT image.
// A monochromatic beam is attenuated exponentially through matter by the
// Beer–Lambert law, I = I₀ e^(−μx), where μ (the linear attenuation
// coefficient) depends on the tissue and photon energy. CT reports
// attenuation on the Hounsfield scale, HU = 1000 (μ − μ_water)/μ_water, so
// water = 0, air ≈ −1000, fat ≈ −100, and dense cortical bone ≈ +1000.
// That contrast is exactly what lets a radiologist tell bone from soft
// tissue from air.

const W = 460;
const H = 330;
const MU_WATER = 0.1976;

type Tissue = "Air" | "Fat" | "Soft tissue" | "Bone";
const TISSUE: Record<Tissue, { mu: number; color: string }> = {
  Air: { mu: 0.0002, color: "#64748b" },
  Fat: { mu: 0.171, color: "#fbbf24" },
  "Soft tissue": { mu: 0.1976, color: "#f87171" },
  Bone: { mu: 0.38, color: "#e5e9f5" },
};
const ORDER: Tissue[] = ["Air", "Fat", "Soft tissue", "Bone"];
const huOf = (mu: number) => Math.round(1000 * (mu - MU_WATER) / MU_WATER);

interface Props {
  tissue?: Tissue;
}

export function XrayAttenuation({ tissue: ctl }: Props = {}) {
  const [intTissue, setIntTissue] = useState<Tissue>("Soft tissue");
  const [thick, setThick] = useState(8);
  const tissue = ctl ?? intTissue;
  const { mu, color } = TISSUE[tissue];
  const transmit = Math.exp(-mu * thick);
  const hu = huOf(mu);

  const baseX = 50, baseY = 250, plotW = W - baseX - 90, plotH = baseY - 40, XMAX = 15;
  const xOf = (x: number) => baseX + (x / XMAX) * plotW;
  const yOf = (v: number) => baseY - v * plotH;

  const curve = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 100; i++) {
      const x = (i / 100) * XMAX;
      pts.push(`${i === 0 ? "M" : "L"}${xOf(x).toFixed(1)},${yOf(Math.exp(-mu * x)).toFixed(1)}`);
    }
    return pts.join(" ");
  }, [mu]);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">{tissue}: {(transmit * 100).toFixed(1)}% transmitted · {hu} HU</div>
        <div className="flex gap-1">
          {ORDER.map((t) => (
            <button key={t} onClick={() => setIntTissue(t)} disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${tissue === t ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{t}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="X-ray attenuation: Beer-Lambert decay">
        <line x1={baseX} y1={baseY} x2={baseX + plotW} y2={baseY} stroke="#334155" strokeWidth={0.8} />
        <line x1={baseX} y1={40} x2={baseX} y2={baseY} stroke="#334155" strokeWidth={0.8} />
        {[0, 0.5, 1].map((v) => (<g key={v}><line x1={baseX} y1={yOf(v)} x2={baseX + plotW} y2={yOf(v)} stroke="#1f2937" strokeWidth={0.3} /><text x={baseX - 4} y={yOf(v) + 3} fill="#9aa3b8" fontSize="8" textAnchor="end">{v}</text></g>))}
        {[5, 10, 15].map((x) => (<text key={x} x={xOf(x)} y={baseY + 12} fill="#9aa3b8" fontSize="8" textAnchor="middle">{x}</text>))}
        <text x={baseX + plotW / 2} y={baseY + 26} fill="#cbd1e6" fontSize="9" textAnchor="middle">depth x (cm)</text>
        <text x={16} y={40 + plotH / 2} fill="#cbd1e6" fontSize="9" textAnchor="middle" transform={`rotate(-90 16 ${40 + plotH / 2})`}>I / I₀</text>

        {/* decay curve */}
        <path d={curve} fill="none" stroke={color} strokeWidth={2.2} />
        {/* marker at thickness */}
        <line x1={xOf(thick)} y1={40} x2={xOf(thick)} y2={baseY} stroke="#38bdf8" strokeWidth={0.6} strokeDasharray="2,2" />
        <line x1={baseX} y1={yOf(transmit)} x2={xOf(thick)} y2={yOf(transmit)} stroke="#38bdf8" strokeWidth={0.6} strokeDasharray="2,2" />
        <circle cx={xOf(thick)} cy={yOf(transmit)} r={4} fill="#38bdf8" />

        {/* beam schematic */}
        <text x={baseX + plotW + 8} y={56} fill="#9aa3b8" fontSize="8">beam I₀</text>
        <line x1={baseX + plotW + 10} y1={64} x2={baseX + plotW + 78} y2={64} stroke="#38bdf8" strokeWidth={2} markerEnd="url(#xrA)" />
        <rect x={baseX + plotW + 20} y={74} width={48} height={40} rx={3} fill={color} opacity={0.5} stroke={color} strokeWidth={1} />
        <text x={baseX + plotW + 44} y={97} fill="#06121f" fontSize="7" textAnchor="middle">{tissue.split(" ")[0]}</text>
        <line x1={baseX + plotW + 10} y1={124} x2={baseX + plotW + 78} y2={124} stroke="#38bdf8" strokeWidth={Math.max(0.5, transmit * 4)} markerEnd="url(#xrA)" />
        <text x={baseX + plotW + 8} y={138} fill="#9aa3b8" fontSize="8">I = I₀·{transmit.toFixed(2)}</text>

        {/* HU badge */}
        <rect x={baseX + plotW + 10} y={170} width={78} height={40} rx={5} fill="#111a33" />
        <text x={baseX + plotW + 49} y={188} fill="#cbd1e6" fontSize="8" textAnchor="middle">Hounsfield</text>
        <text x={baseX + plotW + 49} y={203} fill={color} fontSize="11" textAnchor="middle" fontWeight="bold">{hu} HU</text>

        <defs><marker id="xrA" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#38bdf8" /></marker></defs>
      </svg>

      <div className="mt-2 text-xs">
        <label className="block">tissue thickness: {thick} cm
          <input type="range" min={0} max={15} step={1} value={thick} onChange={(e) => setThick(parseInt(e.target.value))} className="w-full mt-0.5" aria-label="Tissue thickness" />
        </label>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        <b>Beer–Lambert</b>: I = I₀·e^(−μx). A denser tissue has a larger
        <b> attenuation coefficient μ</b>, so it stops more of the beam and
        casts a brighter shadow on film (the basis of the chest X-ray).
        <b> CT</b> turns μ into a calibrated <b>Hounsfield unit</b> relative
        to water, letting <b>Godfrey Hounsfield</b>'s scanner separate
        bone (+1000), soft tissue (~+40), fat (−100), and air (−1000) — the
        contrast a radiologist reads.
      </div>
    </div>
  );
}

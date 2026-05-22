import { useMemo, useState } from "react";

// A storm hydrograph — how a watershed converts a burst of rainfall into
// streamflow over time. The rainfall (hyetograph, top) drives a discharge
// response (bottom) with a rising limb, a peak, and a long falling limb
// decaying toward baseflow. The LAG TIME (rainfall centroid → peak) and
// PEAK DISCHARGE depend on the basin: an impervious urban catchment spikes
// fast and high, a forested one responds low and slow. This response is the
// basis of the unit hydrograph (LeRoy Sherman, 1932) used in flood design.

const W = 460;
const H = 320;
const TMAX = 24; // hours

type Basin = "Urban" | "Forested" | "Flashy";
const BASIN: Record<Basin, { tp: number; n: number; base: number; peak: number }> = {
  Urban: { tp: 3, n: 6, base: 8, peak: 95 },
  Forested: { tp: 9, n: 3, base: 12, peak: 42 },
  Flashy: { tp: 2, n: 9, base: 6, peak: 115 },
};
const ORDER: Basin[] = ["Urban", "Forested", "Flashy"];
const RAIN_CENTROID = 1; // hours (rain falls 0–2h)

interface Props {
  basin?: Basin;
}

export function Hydrograph({ basin: ctl }: Props = {}) {
  const [intBasin, setIntBasin] = useState<Basin>("Urban");
  const [rain, setRain] = useState(30); // mm
  const basin = ctl ?? intBasin;
  const b = BASIN[basin];
  const peakQ = b.peak * (rain / 30);
  const lag = b.tp - RAIN_CENTROID;

  const baseX = 44, baseY = 274, plotW = W - baseX - 16, plotH = 174, QMAX = 150;
  const xOf = (t: number) => baseX + (t / TMAX) * plotW;
  const yOf = (q: number) => baseY - (q / QMAX) * plotH;

  const q = (t: number) => {
    if (t <= 0) return b.base;
    const g = Math.pow(t / b.tp, b.n) * Math.exp(b.n * (1 - t / b.tp));
    return b.base + peakQ * g;
  };

  const curve = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 200; i++) {
      const t = (i / 200) * TMAX;
      pts.push(`${i === 0 ? "M" : "L"}${xOf(t).toFixed(1)},${yOf(q(t)).toFixed(1)}`);
    }
    return pts.join(" ");
  }, [basin, rain]);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">{basin}: peak {peakQ.toFixed(0)} m³/s · lag {lag} h</div>
        <div className="flex gap-1">
          {ORDER.map((x) => (
            <button key={x} onClick={() => setIntBasin(x)} disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${basin === x ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{x}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Storm hydrograph: rainfall and discharge response">
        {/* hyetograph (rainfall, top, downward) */}
        <text x={baseX} y={26} fill="#9aa3b8" fontSize="8">rainfall</text>
        <rect x={xOf(0)} y={30} width={xOf(2) - xOf(0)} height={(rain / 60) * 44} fill="#38bdf8" opacity={0.7} />
        <text x={xOf(1)} y={86} fill="#38bdf8" fontSize="7.5" textAnchor="middle">{rain} mm</text>

        {/* discharge axes */}
        <line x1={baseX} y1={baseY} x2={baseX + plotW} y2={baseY} stroke="#334155" strokeWidth={0.8} />
        <line x1={baseX} y1={baseY - plotH} x2={baseX} y2={baseY} stroke="#334155" strokeWidth={0.8} />
        {[50, 100, 150].map((v) => (<g key={v}><line x1={baseX} y1={yOf(v)} x2={baseX + plotW} y2={yOf(v)} stroke="#1f2937" strokeWidth={0.3} /><text x={baseX - 4} y={yOf(v) + 3} fill="#9aa3b8" fontSize="7.5" textAnchor="end">{v}</text></g>))}
        {[6, 12, 18, 24].map((t) => (<text key={t} x={xOf(t)} y={baseY + 12} fill="#9aa3b8" fontSize="7.5" textAnchor="middle">{t}</text>))}
        <text x={baseX + plotW / 2} y={baseY + 26} fill="#cbd1e6" fontSize="8.5" textAnchor="middle">time (hours)</text>
        <text x={14} y={baseY - plotH / 2} fill="#cbd1e6" fontSize="8.5" textAnchor="middle" transform={`rotate(-90 14 ${baseY - plotH / 2})`}>discharge (m³/s)</text>

        {/* baseflow line */}
        <line x1={baseX} y1={yOf(b.base)} x2={baseX + plotW} y2={yOf(b.base)} stroke="#475569" strokeWidth={0.7} strokeDasharray="4,3" />
        <text x={baseX + plotW - 4} y={yOf(b.base) - 3} fill="#64748b" fontSize="7" textAnchor="end">baseflow</text>

        {/* hydrograph */}
        <path d={curve} fill="none" stroke="#4ade80" strokeWidth={2.2} />
        {/* peak marker + lag */}
        <line x1={xOf(b.tp)} y1={yOf(peakQ + b.base)} x2={xOf(b.tp)} y2={baseY} stroke="#fbbf24" strokeWidth={0.6} strokeDasharray="2,2" />
        <circle cx={xOf(b.tp)} cy={yOf(peakQ + b.base)} r={4} fill="#fbbf24" />
        <text x={xOf(b.tp) + 4} y={yOf(peakQ + b.base) - 4} fill="#fbbf24" fontSize="8">peak</text>
        <line x1={xOf(RAIN_CENTROID)} y1={yOf(peakQ + b.base) - 14} x2={xOf(b.tp)} y2={yOf(peakQ + b.base) - 14} stroke="#a78bfa" strokeWidth={0.8} markerStart="url(#hgL)" markerEnd="url(#hgR)" />
        <text x={xOf((RAIN_CENTROID + b.tp) / 2)} y={yOf(peakQ + b.base) - 18} fill="#a78bfa" fontSize="7.5" textAnchor="middle">lag {lag}h</text>

        <defs>
          <marker id="hgL" markerWidth="6" markerHeight="6" refX="1" refY="3" orient="auto"><path d="M6,0 L0,3 L6,6 Z" fill="#a78bfa" /></marker>
          <marker id="hgR" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#a78bfa" /></marker>
        </defs>
      </svg>

      <div className="mt-2 text-xs">
        <label className="block">rainfall depth: {rain} mm
          <input type="range" min={10} max={60} step={5} value={rain} onChange={(e) => setRain(parseInt(e.target.value))} className="w-full mt-0.5" aria-label="Rainfall depth" />
        </label>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        A watershed transforms a rainfall pulse into a discharge curve with a
        rising limb, a <b>peak</b>, and a slow falling limb toward
        <b> baseflow</b>. <b>Lag time</b> (rainfall centroid → peak) and peak
        height encode the basin's character: paving a catchment removes
        infiltration, so the <b>Urban</b> response is far flashier than the
        <b> Forested</b> one — the core reason urbanization worsens flooding.
        Engineers scale a <b>unit hydrograph</b> (Sherman, 1932) by storm
        depth to design culverts and detention basins.
      </div>
    </div>
  );
}

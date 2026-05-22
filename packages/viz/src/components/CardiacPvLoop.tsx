import { useState } from "react";

// The left-ventricular pressure–volume loop — cardiology's master diagram.
// One heartbeat traces a counter-clockwise loop through four phases:
// filling (mitral open), isovolumetric contraction (all valves shut),
// ejection (aortic open), and isovolumetric relaxation. The loop's width is
// the STROKE VOLUME (EDV − ESV). Raising PRELOAD stretches the ventricle and,
// by the Frank–Starling mechanism, increases stroke volume; raising AFTERLOAD
// (the pressure to eject against) leaves more blood behind, cutting it.

const W = 460;
const H = 320;

type Preset = "Normal" | "↑ Preload" | "↑ Afterload";
const STATE: Record<Preset, { edv: number; esv: number; psys: number }> = {
  Normal: { edv: 120, esv: 50, psys: 120 },
  "↑ Preload": { edv: 150, esv: 60, psys: 125 },
  "↑ Afterload": { edv: 120, esv: 72, psys: 155 },
};
const ORDER: Preset[] = ["Normal", "↑ Preload", "↑ Afterload"];
const PFILL = 8, PAO = 80;

interface Props { preset?: Preset; }

export function CardiacPvLoop({ preset: ctl }: Props = {}) {
  const [intPreset, setIntPreset] = useState<Preset>("Normal");
  const preset = ctl ?? intPreset;
  const { edv, esv, psys } = STATE[preset];
  const sv = edv - esv;
  const ef = Math.round((sv / edv) * 100);

  const baseX = 44, baseY = 270, plotW = W - baseX - 16, plotH = 220, VMAX = 180, PMAX = 180;
  const xOf = (v: number) => baseX + (v / VMAX) * plotW;
  const yOf = (p: number) => baseY - (p / PMAX) * plotH;
  // 4-corner loop: filling (bottom) → iso contraction (right) → ejection (top) → iso relaxation (left)
  const loop = `M${xOf(esv)},${yOf(PFILL)} L${xOf(edv)},${yOf(PFILL)} L${xOf(edv)},${yOf(PAO)} L${xOf(esv)},${yOf(psys)} Z`;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">{preset} · SV {sv} mL · EF {ef}%</div>
        <div className="flex gap-1">
          {ORDER.map((p) => (
            <button key={p} onClick={() => setIntPreset(p)} disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${preset === p ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{p}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Cardiac pressure-volume loop">
        <line x1={baseX} y1={baseY} x2={baseX + plotW} y2={baseY} stroke="#334155" strokeWidth={0.8} />
        <line x1={baseX} y1={baseY - plotH} x2={baseX} y2={baseY} stroke="#334155" strokeWidth={0.8} />
        {[40, 80, 120, 160].map((p) => (<g key={p}><line x1={baseX} y1={yOf(p)} x2={baseX + plotW} y2={yOf(p)} stroke="#1f2937" strokeWidth={0.3} /><text x={baseX - 4} y={yOf(p) + 3} fill="#9aa3b8" fontSize="7.5" textAnchor="end">{p}</text></g>))}
        {[50, 100, 150].map((v) => (<text key={v} x={xOf(v)} y={baseY + 12} fill="#9aa3b8" fontSize="8" textAnchor="middle">{v}</text>))}
        <text x={baseX + plotW / 2} y={baseY + 26} fill="#cbd1e6" fontSize="8.5" textAnchor="middle">LV volume (mL)</text>
        <text x={14} y={baseY - plotH / 2} fill="#cbd1e6" fontSize="8.5" textAnchor="middle" transform={`rotate(-90 14 ${baseY - plotH / 2})`}>LV pressure (mmHg)</text>

        {/* the loop */}
        <path d={loop} fill="#f87171" opacity={0.12} stroke="#f87171" strokeWidth={2.2} />
        {/* phase labels */}
        <text x={xOf((esv + edv) / 2)} y={yOf(PFILL) + 12} fill="#38bdf8" fontSize="7.5" textAnchor="middle">filling →</text>
        <text x={xOf(edv) + 4} y={yOf((PFILL + PAO) / 2)} fill="#9aa3b8" fontSize="7">iso. contraction ↑</text>
        <text x={xOf((esv + edv) / 2)} y={yOf(psys) - 4} fill="#fbbf24" fontSize="7.5" textAnchor="middle">← ejection</text>
        <text x={xOf(esv) - 4} y={yOf((PFILL + psys) / 2)} fill="#9aa3b8" fontSize="7" textAnchor="end">↓ iso. relax</text>
        {/* ESV / EDV markers */}
        <text x={xOf(esv)} y={baseY - 4} fill="#4ade80" fontSize="7" textAnchor="middle">ESV</text>
        <text x={xOf(edv)} y={baseY - 4} fill="#4ade80" fontSize="7" textAnchor="middle">EDV</text>
        {/* stroke-volume bracket */}
        <line x1={xOf(esv)} y1={yOf(PFILL) + 18} x2={xOf(edv)} y2={yOf(PFILL) + 18} stroke="#4ade80" strokeWidth={0.8} />
        <text x={xOf((esv + edv) / 2)} y={yOf(PFILL) + 28} fill="#4ade80" fontSize="7.5" textAnchor="middle">stroke volume = {sv} mL</text>
      </svg>

      <div className="mt-1 text-[10px] text-muted-foreground">
        Going counter-clockwise: the ventricle <b>fills</b> (bottom), contracts
        isovolumetrically until pressure beats the aorta, <b>ejects</b> (top),
        then relaxes. The loop's width is the <b>stroke volume</b> (EDV − ESV)
        and ejection fraction is SV/EDV. <b>↑ Preload</b> widens the loop —
        the <b>Frank–Starling</b> law (a more-stretched fiber contracts harder).
        <b> ↑ Afterload</b> raises the ceiling the heart must push against, so
        ejection stops early and stroke volume falls.
      </div>
    </div>
  );
}

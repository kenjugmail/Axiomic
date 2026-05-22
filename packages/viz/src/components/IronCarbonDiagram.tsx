import { useState } from "react";

// The iron–carbon phase diagram — the foundational map of steel metallurgy.
// Temperature (y) versus carbon content (x) shows which phases are stable:
// austenite (γ, FCC) at high temperature, ferrite (α, BCC) and cementite
// (Fe₃C) below. The EUTECTOID point (0.76 wt% C, 727 °C) is special — there
// austenite transforms entirely to PEARLITE (alternating ferrite + cementite
// lamellae) on slow cooling. Steel left of it (hypoeutectoid) cools to
// ferrite + pearlite; right of it (hypereutectoid), pearlite + cementite;
// past ~2.1% C you're into the cast irons.

const W = 460;
const H = 340;
const CMAX = 5;

const PRESETS = [
  { label: "Mild steel 0.2%", c: 0.2 },
  { label: "Eutectoid 0.76%", c: 0.76 },
  { label: "Cast iron 3%", c: 3 },
];

function microstructure(c: number): string {
  if (c < 0.022) return "ferrite (α) only";
  if (c < 0.76) return "ferrite + pearlite (hypoeutectoid steel)";
  if (c < 0.78) return "100% pearlite (eutectoid steel)";
  if (c < 2.1) return "pearlite + cementite (hypereutectoid steel)";
  return "ledeburite — cast iron";
}

interface Props {
  carbon?: number;
}

export function IronCarbonDiagram({ carbon: ctl }: Props = {}) {
  const [intC, setIntC] = useState(0.2);
  const c = ctl ?? intC;

  const baseX = 44, baseY = 256, plotW = W - baseX - 16, plotH = 210, TMIN = 600, TMAX = 1600;
  const xOf = (cc: number) => baseX + (cc / CMAX) * plotW;
  const yOf = (t: number) => baseY - ((t - TMIN) / (TMAX - TMIN)) * plotH;
  const line = (pts: [number, number][]) => pts.map(([cc, t], i) => `${i === 0 ? "M" : "L"}${xOf(cc).toFixed(1)},${yOf(t).toFixed(1)}`).join(" ");

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">{c.toFixed(2)}% C → {microstructure(c)}</div>
        <div className="flex gap-1">
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => setIntC(p.c)} disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${Math.abs(c - p.c) < 0.01 ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{p.label}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Iron-carbon phase diagram">
        {/* axes */}
        <line x1={baseX} y1={baseY} x2={baseX + plotW} y2={baseY} stroke="#334155" strokeWidth={0.8} />
        <line x1={baseX} y1={baseY - plotH} x2={baseX} y2={baseY} stroke="#334155" strokeWidth={0.8} />
        {[700, 900, 1100, 1300, 1500].map((t) => (<g key={t}><line x1={baseX} y1={yOf(t)} x2={baseX + plotW} y2={yOf(t)} stroke="#1f2937" strokeWidth={0.3} /><text x={baseX - 4} y={yOf(t) + 3} fill="#9aa3b8" fontSize="7" textAnchor="end">{t}</text></g>))}
        {[1, 2, 3, 4, 5].map((cc) => (<text key={cc} x={xOf(cc)} y={baseY + 12} fill="#9aa3b8" fontSize="7.5" textAnchor="middle">{cc}</text>))}
        <text x={baseX + plotW / 2} y={baseY + 26} fill="#cbd1e6" fontSize="8.5" textAnchor="middle">carbon content (wt %)</text>
        <text x={12} y={baseY - plotH / 2} fill="#cbd1e6" fontSize="8.5" textAnchor="middle" transform={`rotate(-90 12 ${baseY - plotH / 2})`}>temperature (°C)</text>

        {/* phase boundaries */}
        <path d={line([[0, 1538], [0.76, 1493], [2.1, 1380], [4.3, 1147], [5, 1250]])} fill="none" stroke="#f87171" strokeWidth={1.4} />
        <path d={line([[0, 912], [0.76, 727]])} fill="none" stroke="#38bdf8" strokeWidth={1.2} />
        <path d={line([[0.76, 727], [2.1, 1147]])} fill="none" stroke="#38bdf8" strokeWidth={1.2} />
        <line x1={xOf(0.022)} y1={yOf(727)} x2={xOf(5)} y2={yOf(727)} stroke="#fbbf24" strokeWidth={1.2} />
        <line x1={xOf(2.1)} y1={yOf(1147)} x2={xOf(5)} y2={yOf(1147)} stroke="#fbbf24" strokeWidth={1.2} />

        {/* eutectoid point */}
        <circle cx={xOf(0.76)} cy={yOf(727)} r={3.5} fill="#fbbf24" />
        <text x={xOf(0.76) + 5} y={yOf(727) + 12} fill="#fbbf24" fontSize="7">eutectoid 0.76%, 727°C</text>

        {/* region labels */}
        <text x={xOf(1.1)} y={yOf(1050)} fill="#cbd1e6" fontSize="9" textAnchor="middle">γ austenite</text>
        <text x={xOf(0.05)} y={yOf(800)} fill="#94a3b8" fontSize="7">α</text>
        <text x={xOf(1.6)} y={yOf(1480)} fill="#f87171" fontSize="8.5" textAnchor="middle">liquid</text>
        <text x={xOf(3.1)} y={yOf(950)} fill="#94a3b8" fontSize="7.5" textAnchor="middle">γ + Fe₃C</text>
        <text x={xOf(0.7)} y={yOf(660)} fill="#94a3b8" fontSize="7" textAnchor="middle">α + pearlite</text>
        <text x={xOf(3.2)} y={yOf(660)} fill="#94a3b8" fontSize="7" textAnchor="middle">pearlite + Fe₃C</text>

        {/* composition marker */}
        <line x1={xOf(c)} y1={baseY - plotH} x2={xOf(c)} y2={baseY} stroke="#4ade80" strokeWidth={1.4} strokeDasharray="3,2" />
        <circle cx={xOf(c)} cy={baseY} r={4} fill="#4ade80" />
      </svg>

      <div className="mt-2 text-xs">
        <label className="block">carbon content: {c.toFixed(2)} wt %
          <input type="range" min={0} max={500} step={2} value={Math.round(c * 100)} onChange={(e) => setIntC(parseInt(e.target.value) / 100)} className="w-full mt-0.5" aria-label="Carbon content" />
        </label>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        Above the boundaries, iron holds carbon in solid solution as
        <b> austenite</b> (γ). Cooling past the <b>A₃</b>/<b>Acm</b> lines
        rejects ferrite or cementite until, at the <b>eutectoid</b> (0.76% C,
        727 °C), the remaining austenite snaps into <b>pearlite</b>. A
        blacksmith's whole craft — and modern heat treatment — is reading
        this map: where you sit in carbon and how fast you cross 727 °C sets
        the microstructure, and thus hardness and toughness. Past ~2.1% C the
        eutectic gives the brittle, castable <b>cast irons</b>.
      </div>
    </div>
  );
}

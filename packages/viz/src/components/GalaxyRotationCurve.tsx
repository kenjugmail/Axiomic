import { useMemo, useState } from "react";

// Galaxy rotation curves — the cleanest evidence for dark matter. If a
// spiral galaxy's mass were just its visible stars and gas (concentrated
// toward the center), orbital speed should fall off Keplerian-style,
// v ∝ 1/√r, beyond the luminous disk. Instead, Vera Rubin & Kent Ford
// (1970s) measured curves that stay FLAT out to large radii — implying a
// massive, invisible halo whose enclosed mass keeps growing with radius
// (M(r) ∝ r). Add a dark-matter halo with the slider and watch the
// predicted curve rise to meet the observations.

const W = 460;
const H = 320;
const RMAX = 30; // kpc
const VMAX = 220; // km/s
const R0 = 4; // disk scale (kpc)

type Mode = "Visible mass" | "Observed";
const ORDER: Mode[] = ["Visible mass", "Observed"];

function vVisible(r: number): number {
  return r < R0 ? VMAX * (r / R0) : VMAX * Math.sqrt(R0 / r);
}
function vObserved(r: number): number {
  return r < R0 ? VMAX * (r / R0) : VMAX;
}

interface Props {
  mode?: Mode;
}

export function GalaxyRotationCurve({ mode: ctl }: Props = {}) {
  const [intMode, setIntMode] = useState<Mode>("Observed");
  const [halo, setHalo] = useState(0);
  const mode = ctl ?? intMode;
  const f = halo / 100;

  const baseX = 50;
  const baseY = 250;
  const plotW = W - baseX - 18;
  const plotH = baseY - 30;
  const xOf = (r: number) => baseX + (r / RMAX) * plotW;
  const yOf = (v: number) => baseY - (v / 260) * plotH;

  const { visPath, obsPath, modelPath } = useMemo(() => {
    const vis: string[] = [], obs: string[] = [], mod: string[] = [];
    for (let i = 0; i <= 120; i++) {
      const r = (i / 120) * RMAX;
      const vv = vVisible(r), vo = vObserved(r);
      const vm = vv + f * (vo - vv);
      vis.push(`${i === 0 ? "M" : "L"}${xOf(r).toFixed(1)},${yOf(vv).toFixed(1)}`);
      obs.push(`${i === 0 ? "M" : "L"}${xOf(r).toFixed(1)},${yOf(vo).toFixed(1)}`);
      mod.push(`${i === 0 ? "M" : "L"}${xOf(r).toFixed(1)},${yOf(vm).toFixed(1)}`);
    }
    return { visPath: vis.join(" "), obsPath: obs.join(" "), modelPath: mod.join(" ") };
  }, [f]);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">dark-matter halo: {halo}% {halo >= 90 ? "→ prediction matches observation" : ""}</div>
        <div className="flex gap-1">
          {ORDER.map((m) => (
            <button key={m} onClick={() => setIntMode(m)} disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${mode === m ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{m}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Galaxy rotation curve">
        <line x1={baseX} y1={baseY} x2={baseX + plotW} y2={baseY} stroke="#334155" strokeWidth={0.8} />
        <line x1={baseX} y1={30} x2={baseX} y2={baseY} stroke="#334155" strokeWidth={0.8} />
        {[100, 200].map((v) => (
          <g key={v}><line x1={baseX} y1={yOf(v)} x2={baseX + plotW} y2={yOf(v)} stroke="#1f2937" strokeWidth={0.3} /><text x={baseX - 4} y={yOf(v) + 3} fill="#9aa3b8" fontSize="8" textAnchor="end">{v}</text></g>
        ))}
        {[10, 20, 30].map((r) => (<text key={r} x={xOf(r)} y={baseY + 12} fill="#9aa3b8" fontSize="8" textAnchor="middle">{r}</text>))}
        <text x={baseX + plotW / 2} y={baseY + 26} fill="#cbd1e6" fontSize="9" textAnchor="middle">radius (kpc)</text>
        <text x={16} y={30 + plotH / 2} fill="#cbd1e6" fontSize="9" textAnchor="middle" transform={`rotate(-90 16 ${30 + plotH / 2})`}>orbital velocity (km/s)</text>

        {/* visible-mass prediction */}
        <path d={visPath} fill="none" stroke="#fbbf24" strokeWidth={mode === "Visible mass" ? 2.6 : 1.4} opacity={mode === "Visible mass" ? 1 : 0.5} />
        {/* observed */}
        <path d={obsPath} fill="none" stroke="#4ade80" strokeWidth={mode === "Observed" ? 2.6 : 1.4} opacity={mode === "Observed" ? 1 : 0.5} />
        {/* model with halo */}
        {halo > 0 && <path d={modelPath} fill="none" stroke="#38bdf8" strokeWidth={2} strokeDasharray="5,3" />}

        {/* the gap */}
        <line x1={xOf(26)} y1={yOf(vVisible(26))} x2={xOf(26)} y2={yOf(vObserved(26))} stroke="#f87171" strokeWidth={1} strokeDasharray="2,2" />
        <text x={xOf(26) - 4} y={yOf((vVisible(26) + vObserved(26)) / 2)} fill="#f87171" fontSize="7.5" textAnchor="end">missing mass</text>

        {/* legend */}
        <g transform="translate(300,44)">
          <line x1={0} y1={4} x2={16} y2={4} stroke="#fbbf24" strokeWidth={2} /><text x={20} y={7} fill="#9aa3b8" fontSize="8">stars + gas (Kepler)</text>
          <line x1={0} y1={18} x2={16} y2={18} stroke="#4ade80" strokeWidth={2} /><text x={20} y={21} fill="#9aa3b8" fontSize="8">observed (flat)</text>
          <line x1={0} y1={32} x2={16} y2={32} stroke="#38bdf8" strokeWidth={2} strokeDasharray="4,2" /><text x={20} y={35} fill="#9aa3b8" fontSize="8">+ dark halo</text>
        </g>
      </svg>

      <div className="mt-2 text-xs">
        <label className="block">dark-matter halo mass: {halo}%
          <input type="range" min={0} max={100} step={5} value={halo} onChange={(e) => setHalo(parseInt(e.target.value))} className="w-full mt-0.5" aria-label="Dark-matter halo fraction" />
        </label>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        Newtonian gravity predicts that orbital speed should fall as
        <b> v ∝ 1/√r</b> once you pass the visible disk, since almost all the
        luminous mass is interior. Real spiral galaxies instead show a
        <b> flat</b> rotation curve — speeds stay high to the edge.
        <b> Vera Rubin</b> and <b>Kent Ford</b> established this in the 1970s;
        the only fix consistent with gravity is a vast <b>dark-matter halo</b>
        with M(r) ∝ r. Slide the halo up to close the gap.
      </div>
    </div>
  );
}

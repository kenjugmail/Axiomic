import { useMemo, useState } from "react";

// What makes a volcano effusive or explosive. The master control is magma
// SILICA content, which sets VISCOSITY: silica polymerizes the melt, so a
// rhyolite is roughly a billion times more viscous than a basalt. Runny,
// low-silica basalt lets dissolved gas bubble out gently → effusive lava
// flows (Hawaiian, low VEI). Stiff, high-silica rhyolite traps gas until it
// fragments the magma → violent explosive eruptions (Plinian, high VEI).
// Viscosity rises ~10× for roughly every 5–6 % more silica.

const W = 460;
const H = 320;

type Magma = "Basaltic" | "Andesitic" | "Rhyolitic";
const SILICA: Record<Magma, number> = { Basaltic: 50, Andesitic: 60, Rhyolitic: 72 };
const ORDER: Magma[] = ["Basaltic", "Andesitic", "Rhyolitic"];

const logVisc = (s: number) => Math.max(0, Math.min(11, 0.34 * (s - 50) + 1.5));
function style(s: number): { name: string; vei: string; color: string } {
  if (s < 55) return { name: "Effusive (Hawaiian)", vei: "VEI 0–2", color: "#4ade80" };
  if (s < 64) return { name: "Mixed (Strombolian/Vulcanian)", vei: "VEI 2–4", color: "#fbbf24" };
  return { name: "Explosive (Plinian)", vei: "VEI 4–6", color: "#f87171" };
}

interface Props { magma?: Magma; }

export function EruptionExplosivity({ magma: ctl }: Props = {}) {
  const [intMagma, setIntMagma] = useState<Magma>("Basaltic");
  const [rawS, setRawS] = useState(0);
  const magma = ctl ?? intMagma;
  const silica = rawS || SILICA[magma];
  const lv = logVisc(silica);
  const st = style(silica);

  const baseX = 50, baseY = 230, plotW = W - baseX - 16, plotH = 180, SMIN = 45, SMAX = 75;
  const xOf = (s: number) => baseX + ((s - SMIN) / (SMAX - SMIN)) * plotW;
  const yOf = (l: number) => baseY - (l / 11) * plotH;
  const curve = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 60; i++) { const s = SMIN + (i / 60) * (SMAX - SMIN); pts.push(`${i === 0 ? "M" : "L"}${xOf(s).toFixed(1)},${yOf(logVisc(s)).toFixed(1)}`); }
    return pts.join(" ");
  }, []);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold" style={{ color: st.color }}>{silica}% SiO₂ · {st.name} · {st.vei}</div>
        <div className="flex gap-1">
          {ORDER.map((m) => (
            <button key={m} onClick={() => { setIntMagma(m); setRawS(0); }} disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${magma === m ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{m}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Magma silica versus viscosity and eruption style">
        <line x1={baseX} y1={baseY} x2={baseX + plotW} y2={baseY} stroke="#334155" strokeWidth={0.8} />
        <line x1={baseX} y1={baseY - plotH} x2={baseX} y2={baseY} stroke="#334155" strokeWidth={0.8} />
        {[2, 5, 8, 11].map((l) => (<g key={l}><line x1={baseX} y1={yOf(l)} x2={baseX + plotW} y2={yOf(l)} stroke="#1f2937" strokeWidth={0.3} /><text x={baseX - 4} y={yOf(l) + 3} fill="#9aa3b8" fontSize="7.5" textAnchor="end">10^{l}</text></g>))}
        {[50, 60, 70].map((s) => (<text key={s} x={xOf(s)} y={baseY + 12} fill="#9aa3b8" fontSize="8" textAnchor="middle">{s}%</text>))}
        <text x={baseX + plotW / 2} y={baseY + 26} fill="#cbd1e6" fontSize="8.5" textAnchor="middle">silica content (wt % SiO₂)</text>
        <text x={16} y={baseY - plotH / 2} fill="#cbd1e6" fontSize="8.5" textAnchor="middle" transform={`rotate(-90 16 ${baseY - plotH / 2})`}>viscosity (Pa·s)</text>

        <path d={curve} fill="none" stroke="#fb923c" strokeWidth={2.2} />
        <line x1={xOf(silica)} y1={baseY - plotH} x2={xOf(silica)} y2={baseY} stroke="#38bdf8" strokeWidth={0.6} strokeDasharray="2,2" />
        <circle cx={xOf(silica)} cy={yOf(lv)} r={5} fill="#38bdf8" />

        {/* eruption-style gauge */}
        <text x={baseX} y={baseY + 48} fill="#9aa3b8" fontSize="8">eruption style</text>
        <rect x={baseX} y={baseY + 54} width={plotW} height={10} rx={3} fill="url(#egGrad)" />
        <text x={baseX} y={baseY + 78} fill="#4ade80" fontSize="7.5">effusive · lava flows</text>
        <text x={baseX + plotW} y={baseY + 78} fill="#f87171" fontSize="7.5" textAnchor="end">explosive · ash + PDCs</text>
        <polygon points={`${xOf(silica)},${baseY + 52} ${xOf(silica) - 4},${baseY + 46} ${xOf(silica) + 4},${baseY + 46}`} fill="#e5e9f5" />
        <defs>
          <linearGradient id="egGrad" x1="0" x2="1"><stop offset="0" stopColor="#4ade80" /><stop offset="0.5" stopColor="#fbbf24" /><stop offset="1" stopColor="#f87171" /></linearGradient>
        </defs>
      </svg>

      <div className="mt-2 text-xs">
        <label className="block">silica content: {silica}% SiO₂
          <input type="range" min={45} max={75} step={1} value={silica} onChange={(e) => setRawS(parseInt(e.target.value))} className="w-full mt-0.5" aria-label="Silica content" />
        </label>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        Silica (SiO₂) links the silica tetrahedra into chains, so viscosity
        climbs by orders of magnitude from runny <b>basalt</b> (~50%) to stiff
        <b> rhyolite</b> (~72%). Low viscosity lets gas escape gently →
        <b> effusive</b> Hawaiian lava. High viscosity traps gas until the
        magma fragments → <b>explosive</b> Plinian columns and pyroclastic
        flows, high on the <b>Volcanic Explosivity Index</b>. Composition,
        set deep in the source, largely writes the eruption's script.
      </div>
    </div>
  );
}

import { useState } from "react";

// Hubble's law: distant galaxies recede at a velocity proportional to their
// distance, v = H₀ d (Edwin Hubble, 1929, building on Henrietta Leavitt's
// Cepheid distances and Vesto Slipher's redshifts; Georges Lemaître derived
// it independently in 1927). The slope H₀ is the Hubble constant, and its
// reciprocal 1/H₀ — the Hubble time — estimates the age of the universe.
// Today's "Hubble tension" is the unresolved ~9% disagreement between the
// early-universe value (Planck CMB, ~67) and the local distance-ladder
// value (SH0ES, ~73).

const W = 460;
const H = 320;
const DMAX = 600; // Mpc

const PRESETS = [
  { label: "Planck 67", v: 67 },
  { label: "SH0ES 73", v: 73 },
];

// Fixed galaxy sample (deterministic): distance + a velocity offset (km/s)
// representing peculiar motion, so points scatter realistically about v=H₀d.
const GALAXIES = [
  { d: 70, off: 420 }, { d: 150, off: -300 }, { d: 220, off: 250 },
  { d: 300, off: -450 }, { d: 380, off: 350 }, { d: 460, off: -250 },
  { d: 540, off: 300 },
];

interface Props {
  h0?: number;
}

export function HubbleExpansion({ h0: ctl }: Props = {}) {
  const [intH0, setIntH0] = useState(67);
  const h0 = ctl ?? intH0;
  const ageGyr = 978 / h0; // 1/H₀ in Gyr
  const vmax = 100 * DMAX; // axis top at H0=100

  const baseX = 54;
  const baseY = 250;
  const plotW = W - baseX - 18;
  const plotH = baseY - 28;
  const xOf = (d: number) => baseX + (d / DMAX) * plotW;
  const yOf = (v: number) => baseY - (v / vmax) * plotH;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">H₀ = {h0.toFixed(0)} km/s/Mpc → age ≈ {ageGyr.toFixed(1)} Gyr</div>
        <div className="flex gap-1">
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => setIntH0(p.v)} disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${Math.round(h0) === p.v ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{p.label}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Hubble's law: recession velocity versus distance">
        <line x1={baseX} y1={baseY} x2={baseX + plotW} y2={baseY} stroke="#334155" strokeWidth={0.8} />
        <line x1={baseX} y1={28} x2={baseX} y2={baseY} stroke="#334155" strokeWidth={0.8} />
        {[20000, 40000].map((v) => (
          <g key={v}><line x1={baseX} y1={yOf(v)} x2={baseX + plotW} y2={yOf(v)} stroke="#1f2937" strokeWidth={0.3} /><text x={baseX - 4} y={yOf(v) + 3} fill="#9aa3b8" fontSize="7.5" textAnchor="end">{v / 1000}k</text></g>
        ))}
        {[200, 400, 600].map((d) => (<text key={d} x={xOf(d)} y={baseY + 12} fill="#9aa3b8" fontSize="8" textAnchor="middle">{d}</text>))}
        <text x={baseX + plotW / 2} y={baseY + 26} fill="#cbd1e6" fontSize="9" textAnchor="middle">distance (Mpc)</text>
        <text x={16} y={28 + plotH / 2} fill="#cbd1e6" fontSize="9" textAnchor="middle" transform={`rotate(-90 16 ${28 + plotH / 2})`}>recession velocity (km/s)</text>

        {/* v = H0 d line */}
        <line x1={xOf(0)} y1={yOf(0)} x2={xOf(DMAX)} y2={yOf(h0 * DMAX)} stroke="#38bdf8" strokeWidth={2} />
        <text x={xOf(DMAX) - 6} y={yOf(h0 * DMAX) - 6} fill="#38bdf8" fontSize="8" textAnchor="end">v = H₀ d</text>

        {/* galaxies */}
        {GALAXIES.map((g, i) => {
          const v = h0 * g.d + g.off;
          return <circle key={i} cx={xOf(g.d)} cy={yOf(Math.max(0, v))} r={3.5} fill="#fbbf24" />;
        })}

        {/* age callout */}
        <rect x={baseX + 8} y={40} width={150} height={36} rx={5} fill="#111a33" />
        <text x={baseX + 83} y={56} fill="#e5e9f5" fontSize="9" textAnchor="middle">Hubble time 1/H₀</text>
        <text x={baseX + 83} y={70} fill="#4ade80" fontSize="10" textAnchor="middle" fontWeight="bold">≈ {ageGyr.toFixed(2)} Gyr</text>
      </svg>

      <div className="mt-2 text-xs">
        <label className="block">Hubble constant H₀: {h0.toFixed(0)} km/s/Mpc
          <input type="range" min={50} max={100} step={1} value={h0} onChange={(e) => setIntH0(parseInt(e.target.value))} className="w-full mt-0.5" aria-label="Hubble constant" />
        </label>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        <b>Hubble's law</b> v = H₀d (Hubble 1929; Lemaître 1927) is the
        observational backbone of the expanding universe — every galaxy
        recedes faster the farther it lies. A steeper slope (larger
        <b> H₀</b>) means faster expansion and a <b>younger</b> universe,
        since the age scales as 1/H₀. The stubborn gap between
        <b> Planck</b> (~67, from the CMB) and <b>SH0ES</b> (~73, from
        Cepheids + supernovae) is the <b>Hubble tension</b> — possibly a hint
        of physics beyond the standard ΛCDM model.
      </div>
    </div>
  );
}

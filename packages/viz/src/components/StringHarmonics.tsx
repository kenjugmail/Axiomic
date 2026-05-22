import { useMemo, useState } from "react";

// Standing waves on a string — the physics every luthier works with. A
// string fixed at both ends can only vibrate at frequencies whose half-
// wavelengths fit exactly between the ends: the harmonic series f_n = n·f₁.
// The nth harmonic has n antinodes and n+1 nodes. The fundamental sets the
// pitch; the relative strength of the higher harmonics (which a pluck near
// the bridge boosts) is what we hear as TIMBRE. Mersenne's laws fix f₁ from
// string length, tension, and mass per length: f₁ = (1/2L)·√(T/μ).

const W = 460;
const H = 300;
const F1 = 110; // Hz (fundamental, ≈ A2)

const PRESETS = [
  { label: "Fundamental", n: 1 },
  { label: "2nd harmonic", n: 2 },
  { label: "3rd harmonic", n: 3 },
];

interface Props { harmonic?: number; }

export function StringHarmonics({ harmonic: ctl }: Props = {}) {
  const [intN, setIntN] = useState(1);
  const n = ctl ?? intN;
  const freq = n * F1;
  const wavelength = (2 / n).toFixed(2); // in units of L

  const x0 = 40, x1 = W - 40, midY = 130, amp = 70;
  const span = x1 - x0;
  const px = (u: number) => x0 + u * span; // u in [0,1] along the string
  const env = (u: number) => amp * Math.sin(n * Math.PI * u);

  const { upper, lower } = useMemo(() => {
    const up: string[] = [], lo: string[] = [];
    for (let i = 0; i <= 120; i++) {
      const u = i / 120;
      up.push(`${i === 0 ? "M" : "L"}${px(u).toFixed(1)},${(midY - env(u)).toFixed(1)}`);
      lo.push(`${i === 0 ? "M" : "L"}${px(u).toFixed(1)},${(midY + env(u)).toFixed(1)}`);
    }
    return { upper: up.join(" "), lower: lo.join(" ") };
  }, [n]);

  const nodes = Array.from({ length: n + 1 }, (_, k) => k / n);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">harmonic {n} · {freq} Hz · λ = {wavelength}·L</div>
        <div className="flex gap-1">
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => setIntN(p.n)} disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${n === p.n ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{p.label}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Standing wave on a string">
        {/* fixed ends */}
        <line x1={x0} y1={midY - amp - 10} x2={x0} y2={midY + amp + 10} stroke="#64748b" strokeWidth={3} />
        <line x1={x1} y1={midY - amp - 10} x2={x1} y2={midY + amp + 10} stroke="#64748b" strokeWidth={3} />
        <line x1={x0} y1={midY} x2={x1} y2={midY} stroke="#1f2937" strokeWidth={0.5} />

        {/* standing-wave envelope */}
        <path d={`${upper} ${lower.replace("M", "L")} Z`} fill="#fbbf24" opacity={0.12} />
        <path d={upper} fill="none" stroke="#fbbf24" strokeWidth={2.2} />
        <path d={lower} fill="none" stroke="#fbbf24" strokeWidth={1} opacity={0.5} strokeDasharray="4,3" />

        {/* nodes (zeros) + antinodes */}
        {nodes.map((u, i) => (<circle key={`n${i}`} cx={px(u)} cy={midY} r={3.5} fill="#f87171" />))}
        {Array.from({ length: n }, (_, k) => (k + 0.5) / n).map((u, i) => (
          <text key={`a${i}`} x={px(u)} y={midY - amp - 14} fill="#fbbf24" fontSize="7.5" textAnchor="middle">antinode</text>
        ))}
        <text x={px(0)} y={midY + amp + 24} fill="#f87171" fontSize="7.5">● = node ({n + 1})</text>

        {/* harmonic-series ladder */}
        <g transform="translate(40,255)">
          {[1, 2, 3, 4, 5, 6].map((h) => (
            <g key={h} transform={`translate(${(h - 1) * 64},0)`}>
              <rect x={0} y={-8} width={56} height={16} rx={3} fill={h === n ? "#1e2a52" : "#111a33"} stroke={h === n ? "#fbbf24" : "#334155"} strokeWidth={h === n ? 1.4 : 0.7} />
              <text x={28} y={3} fill={h === n ? "#fbbf24" : "#9aa3b8"} fontSize="7.5" textAnchor="middle">{h * F1} Hz</text>
            </g>
          ))}
        </g>
      </svg>

      <div className="mt-2 text-xs">
        <label className="block">harmonic number n = {n}
          <input type="range" min={1} max={6} step={1} value={n} onChange={(e) => setIntN(parseInt(e.target.value))} className="w-full mt-0.5" aria-label="Harmonic number" />
        </label>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        Only wavelengths with a whole number of half-loops fit between the
        fixed ends, so the string rings at the <b>harmonic series</b>
        f_n = n·f₁ — here 110, 220, 330 Hz… The <b>fundamental</b> (n = 1)
        sets the pitch; the mix of higher harmonics gives each instrument its
        <b> timbre</b>, and plucking near the bridge brightens it by exciting
        more overtones. <b>Mersenne's laws</b> tie f₁ to length, tension, and
        thickness — the three dials a player and a luthier tune.
      </div>
    </div>
  );
}

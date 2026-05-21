import { useMemo, useState } from "react";

// 1D diatomic chain phonon dispersion. Two masses m1, m2 connected
// by springs of constant K alternating along the chain. The
// dispersion relation has two branches:
//   ω²₊ = K(1/m1 + 1/m2) + K · √((1/m1 + 1/m2)² - 4 sin²(ka)/(m1 m2))
//   ω²₋ = K(1/m1 + 1/m2) - K · √((1/m1 + 1/m2)² - 4 sin²(ka)/(m1 m2))
// Acoustic branch (ω → 0 at k = 0) + optical branch (ω finite at k=0).
// Drag the mass ratio to see the band gap open + close.

const W = 460;
const H = 320;

interface Props {
  massRatio?: number;
  K?: number;
}

export function PhononDispersion({ massRatio: ctlR, K: ctlK }: Props = {}) {
  const [intR, setIntR] = useState(2);
  const [intK] = useState(1.0);
  const r = ctlR ?? intR;  // m2 / m1
  const K = ctlK ?? intK;
  const m1 = 1;
  const m2 = r;

  // a is interatomic spacing (use a=1; BZ from -π/2 to π/2 for diatomic chain)
  const a = 1;

  const data = useMemo(() => {
    const N = 200;
    const kMin = -Math.PI / a;
    const kMax = Math.PI / a;
    const acoustic: Array<{ k: number; w: number }> = [];
    const optical: Array<{ k: number; w: number }> = [];
    const inv = 1 / m1 + 1 / m2;
    for (let i = 0; i <= N; i++) {
      const k = kMin + (i / N) * (kMax - kMin);
      const term = inv * inv - (4 * Math.sin(k * a / 2) ** 2) / (m1 * m2);
      const root = K * Math.sqrt(Math.max(0, term));
      const w2plus = K * inv + root;
      const w2minus = K * inv - root;
      acoustic.push({ k, w: Math.sqrt(Math.max(0, w2minus)) });
      optical.push({ k, w: Math.sqrt(Math.max(0, w2plus)) });
    }
    return { acoustic, optical };
  }, [m1, m2, K]);

  const wMax = Math.sqrt(K * (1 / m1 + 1 / m2)) * 1.05;
  const gapBottom = Math.sqrt(2 * K / Math.max(m1, m2));
  const gapTop = Math.sqrt(2 * K / Math.min(m1, m2));
  const gapWidth = gapTop - gapBottom;

  const baseX = 40;
  const baseY = 20;
  const plotW = W - baseX - 16;
  const plotH = H - baseY - 80;
  const xOf = (k: number) => baseX + ((k - (-Math.PI / a)) / (2 * Math.PI / a)) * plotW;
  const yOf = (w: number) => baseY + plotH - (w / wMax) * plotH;

  const pathOf = (pts: Array<{ k: number; w: number }>, color: string) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.k).toFixed(1)},${yOf(p.w).toFixed(1)}`).join(" ");

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Phonon dispersion · diatomic chain · m₂/m₁ = {r.toFixed(2)} · gap {gapWidth.toFixed(3)}</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Phonon dispersion">
        <rect x={baseX} y={baseY} width={plotW} height={plotH} fill="none" stroke="#1f2937" strokeWidth={0.5} />
        {/* Band gap shading */}
        {gapWidth > 0.001 && (
          <rect x={baseX} y={yOf(gapTop)} width={plotW} height={yOf(gapBottom) - yOf(gapTop)} fill="#ff6b6b" fillOpacity={0.08} />
        )}
        {/* Acoustic branch */}
        <path d={pathOf(data.acoustic, "#4ecdc4")} fill="none" stroke="#4ecdc4" strokeWidth={2} />
        {/* Optical branch */}
        <path d={pathOf(data.optical, "#fbbf24")} fill="none" stroke="#fbbf24" strokeWidth={2} />
        {/* Axes */}
        <line x1={xOf(0)} y1={baseY} x2={xOf(0)} y2={baseY + plotH} stroke="#475569" strokeWidth={0.4} strokeDasharray="2,2" />
        <text x={xOf(0)} y={baseY - 4} fill="#9aa3b8" fontSize="9" textAnchor="middle">Γ</text>
        <text x={xOf(Math.PI / a)} y={baseY - 4} fill="#9aa3b8" fontSize="9" textAnchor="middle">π/a</text>
        <text x={xOf(-Math.PI / a)} y={baseY - 4} fill="#9aa3b8" fontSize="9" textAnchor="middle">-π/a</text>
        <text x={baseX + plotW + 6} y={yOf(0) + 3} fill="#9aa3b8" fontSize="8">0</text>
        <text x={baseX + plotW + 6} y={yOf(wMax) + 3} fill="#9aa3b8" fontSize="8">ω_max</text>
        <text x={baseX + 4} y={yOf(data.acoustic[Math.floor(data.acoustic.length * 0.7)].w) - 4} fill="#4ecdc4" fontSize="9">acoustic</text>
        <text x={baseX + 4} y={yOf(data.optical[Math.floor(data.optical.length * 0.7)].w) - 4} fill="#fbbf24" fontSize="9">optical</text>
        <text x={baseX + plotW / 2} y={baseY + plotH + 18} fill="#cbd1e6" fontSize="10" textAnchor="middle">wave vector k</text>
        <text x={14} y={baseY + plotH / 2} fill="#cbd1e6" fontSize="10" textAnchor="middle" transform={`rotate(-90, 14, ${baseY + plotH / 2})`}>frequency ω</text>
      </svg>

      <div className="mt-2 text-xs">
        <label className="block">mass ratio m₂/m₁: {r.toFixed(2)}
          <input type="range" min={1} max={6} step={0.1} value={r} onChange={(e) => setIntR(parseFloat(e.target.value))} disabled={ctlR !== undefined} className="w-full mt-0.5" aria-label="Mass ratio" />
        </label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        1D diatomic chain (Born + von Kármán 1912): two masses m₁ +
        m₂ on alternating sites, equal spring constants K. Solving
        Newton's equations + Bloch ansatz uₙ = u₀ exp(i(kna − ωt))
        yields two branches per k. Acoustic branch (cyan): ω → 0 at
        k=0 — long-wavelength sound waves; the two atoms move in
        phase. Optical branch (yellow): finite ω at k=0 — the two
        atoms move out of phase, dipole moment oscillates (couples to
        IR/Raman). When m₁ = m₂ (r=1) the gap closes; large mass
        ratios open a wide gap. Phonon dispersion is measured by
        inelastic neutron scattering (Brockhouse Nobel 1994) +
        more recently IXS at synchrotrons. Foundation for thermal
        conductivity (Debye 1912) + electron-phonon coupling
        (BCS superconductivity Bardeen-Cooper-Schrieffer 1957).
      </div>
    </div>
  );
}

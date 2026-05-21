import { useMemo, useState } from "react";

// Band structure E(k) for a 1D Kronig-Penney-like system. Tight-binding
// model with hopping t = 1 and on-site U gives a band E(k) = -2t cos(ka)
// near the zone boundary; we add a periodic potential V(x) of depth U to
// open a gap at k = π/a. Two bands shown, separated by the band gap.
// Drag lattice constant a + potential depth U; see the gap close/open
// and band curvature change. The conduction/valence labels appear when
// a clear gap exists (insulator/semiconductor); when bands touch or
// overlap (metal) the labels disappear.

const W = 460;
const H = 280;

interface Props {
  latticeConstant?: number;
  potentialDepth?: number;
}

export function BandStructure({ latticeConstant: ctlA, potentialDepth: ctlU }: Props = {}) {
  const [intA, setIntA] = useState(1.0);
  const [intU, setIntU] = useState(5.0);
  const a = ctlA ?? intA;
  const U = ctlU ?? intU;

  const baseX = 50;
  const baseY = 20;
  const plotW = W - 70;
  const plotH = H - 70;

  const t = 1.0;
  const data = useMemo(() => {
    // E_lower(k) ~ -2t cos(ka) - U/2, E_upper(k) ~ +2t cos(ka) + U/2 near gap
    // Simplified avoided crossing
    const N = 200;
    const lower: Array<{ k: number; E: number }> = [];
    const upper: Array<{ k: number; E: number }> = [];
    for (let i = 0; i <= N; i++) {
      const k = (-Math.PI / a) + (i / N) * (2 * Math.PI / a);
      const free = -2 * t * Math.cos(k * a);
      const gapTerm = Math.sqrt(free * free + (U / 2) ** 2);
      lower.push({ k, E: -gapTerm });
      upper.push({ k, E: +gapTerm });
    }
    return { lower, upper };
  }, [a, U]);

  const eMin = -8;
  const eMax = 8;
  const kMin = -Math.PI / a;
  const kMax = Math.PI / a;
  const xOf = (k: number) => baseX + ((k - kMin) / (kMax - kMin)) * plotW;
  const yOf = (E: number) => baseY + ((eMax - E) / (eMax - eMin)) * plotH;

  const pathL = data.lower.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.k).toFixed(2)},${yOf(p.E).toFixed(2)}`).join(" ");
  const pathU = data.upper.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.k).toFixed(2)},${yOf(p.E).toFixed(2)}`).join(" ");

  const gap = 2 * Math.sqrt((U / 2) ** 2) - 0; // |E_upper(0) - E_lower(0)| at k=0
  // At k=0: free = -2t, E = ±sqrt(4t^2 + U^2/4); gap at zone boundary k=π/a where free=2t (with cosine sign convention)
  // Actually the gap occurs at k = π/a where cos(ka)=-1 → free=2t; let's compute gap at that point
  const freeAtBoundary = 2 * t;
  const gapBoundary = 2 * Math.sqrt(freeAtBoundary * freeAtBoundary + (U / 2) ** 2) - 2 * Math.abs(freeAtBoundary);
  const phase = gapBoundary > 0.3 ? "insulator/semiconductor" : "metal/semimetal";
  const phaseColor = gapBoundary > 0.3 ? "#4ecdc4" : "#ff6b6b";

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Band structure · gap = {gapBoundary.toFixed(2)} eV · <span style={{ color: phaseColor }}>{phase}</span></div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Band structure">
        <rect x={baseX} y={baseY} width={plotW} height={plotH} fill="none" stroke="#475569" strokeWidth={0.5} />
        {[-6, -3, 0, 3, 6].map((E) => (
          <g key={`y-${E}`}>
            <line x1={baseX} y1={yOf(E)} x2={baseX + plotW} y2={yOf(E)} stroke="#1f2937" strokeWidth={0.4} />
            <text x={baseX - 4} y={yOf(E) + 3} fill="#9aa3b8" fontSize="8" textAnchor="end">{E}</text>
          </g>
        ))}
        <line x1={xOf(0)} y1={baseY} x2={xOf(0)} y2={baseY + plotH} stroke="#1f2937" strokeWidth={0.4} />
        <text x={xOf(kMin)} y={baseY + plotH + 14} fill="#9aa3b8" fontSize="9" textAnchor="middle">-π/a</text>
        <text x={xOf(0)} y={baseY + plotH + 14} fill="#9aa3b8" fontSize="9" textAnchor="middle">Γ</text>
        <text x={xOf(kMax)} y={baseY + plotH + 14} fill="#9aa3b8" fontSize="9" textAnchor="middle">+π/a</text>
        <text x={baseX + plotW / 2} y={baseY + plotH + 28} fill="#cbd1e6" fontSize="10" textAnchor="middle">crystal momentum k</text>
        <text x={14} y={baseY + plotH / 2} fill="#cbd1e6" fontSize="10" textAnchor="middle" transform={`rotate(-90, 14, ${baseY + plotH / 2})`}>energy E (eV)</text>
        <path d={pathL} fill="none" stroke="#4ecdc4" strokeWidth={1.8} />
        <path d={pathU} fill="none" stroke="#ff6b6b" strokeWidth={1.8} />
        {gapBoundary > 0.3 && (
          <g>
            <text x={xOf(kMin) + 10} y={yOf(-2 * t)} fill="#4ecdc4" fontSize="9">valence</text>
            <text x={xOf(kMin) + 10} y={yOf(2 * t + gapBoundary / 2)} fill="#ff6b6b" fontSize="9">conduction</text>
          </g>
        )}
      </svg>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <label className="block">Lattice constant a: {a.toFixed(2)} Å
          <input type="range" min={0.5} max={3.0} step={0.05} value={a} onChange={(e) => setIntA(parseFloat(e.target.value))} disabled={ctlA !== undefined} className="w-full mt-0.5" aria-label="Lattice constant" />
        </label>
        <label className="block">Potential depth U: {U.toFixed(2)} eV
          <input type="range" min={0} max={10} step={0.1} value={U} onChange={(e) => setIntU(parseFloat(e.target.value))} disabled={ctlU !== undefined} className="w-full mt-0.5" aria-label="Potential depth" />
        </label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        E(k) for a 1D periodic crystal in the nearly-free-electron limit.
        Free electrons (U=0) give a parabola E = ℏ²k²/2m folded into the
        first Brillouin zone; a periodic potential opens a gap of 2|U_G|
        at the zone boundary k = π/a (Bragg reflection of Bloch waves).
        Gap → 0 = metal; gap exceeding k_B T = semiconductor/insulator. Same logic
        underlies the periodic table of materials (band insulators) and
        gives the conduction/valence band assignments. Real materials
        require tight-binding or DFT in 3D + spin + many bands.
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";

// Ramachandran plot: φ vs ψ backbone torsion angles for a protein
// residue. Ramachandran-Ramakrishnan-Sasisekharan (1963) showed that
// steric clash between backbone atoms restricts φ/ψ to a small
// fraction of the available space. The allowed regions correspond
// to the major secondary-structure classes:
//   α-helix (right-handed): φ ≈ -60°, ψ ≈ -45°
//   β-sheet:                φ ≈ -120°, ψ ≈ +120°
//   left-handed α:          φ ≈ +60°,  ψ ≈ +45°
// Drag the marker to explore; the panel reports the inferred
// secondary-structure class + whether the conformation is allowed.

const W = 460;
const H = 320;

interface Props {
  phi?: number;
  psi?: number;
}

// Distance-from-center for each canonical region (in degrees-squared).
// Soft thresholds approximate the "favored" + "allowed" contours of
// modern Ramachandran energy maps (Lovell 2003).
function classify(phi: number, psi: number): { label: string; allowed: boolean; color: string } {
  const d2 = (p: number, q: number) => (phi - p) ** 2 + (psi - q) ** 2;
  // Wrap psi for left-handed region near (+60, +45)
  if (d2(-60, -45) < 1300) return { label: "α-helix (right)", allowed: true, color: "#ff6b6b" };
  if (d2(-120, 120) < 2200) return { label: "β-sheet", allowed: true, color: "#4ecdc4" };
  if (d2(-60, 135) < 900) return { label: "polyproline II", allowed: true, color: "#a78bfa" };
  if (d2(60, 45) < 900) return { label: "α-helix (left, rare)", allowed: true, color: "#fbbf24" };
  if (d2(-180, 180) < 1200 || d2(180, 180) < 1200 || d2(-180, -180) < 1200 || d2(180, -180) < 1200) {
    return { label: "extended β / boundary", allowed: true, color: "#94a3b8" };
  }
  return { label: "disallowed (steric clash)", allowed: false, color: "#475569" };
}

export function RamachandranPlot({ phi: ctlPhi, psi: ctlPsi }: Props = {}) {
  const [intPhi, setIntPhi] = useState(-60);
  const [intPsi, setIntPsi] = useState(-45);
  const phi = ctlPhi ?? intPhi;
  const psi = ctlPsi ?? intPsi;

  const cls = useMemo(() => classify(phi, psi), [phi, psi]);

  const baseX = 50;
  const baseY = 20;
  const plotW = W - 70;
  const plotH = H - 70;
  // Map degrees (-180..180) to pixels
  const xOf = (p: number) => baseX + ((p + 180) / 360) * plotW;
  const yOf = (q: number) => baseY + ((180 - q) / 360) * plotH;

  // Pre-sampled background density. Cheap heuristic: classify a grid
  // of (φ,ψ) and color each cell by region.
  const grid = useMemo(() => {
    const cells: Array<{ x: number; y: number; w: number; h: number; color: string; opacity: number }> = [];
    const step = 12;
    for (let p = -180; p < 180; p += step) {
      for (let q = -180; q < 180; q += step) {
        const c = classify(p + step / 2, q + step / 2);
        cells.push({
          x: xOf(p),
          y: yOf(q + step),
          w: (step / 360) * plotW,
          h: (step / 360) * plotH,
          color: c.color,
          opacity: c.allowed ? 0.35 : 0.05,
        });
      }
    }
    return cells;
  }, []);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">
          Ramachandran: φ = {phi}° · ψ = {psi}° · <span style={{ color: cls.color }}>{cls.label}</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Ramachandran plot">
        {/* Background cells */}
        {grid.map((g, i) => (
          <rect key={`bg-${i}`} x={g.x} y={g.y} width={g.w + 0.5} height={g.h + 0.5} fill={g.color} opacity={g.opacity} />
        ))}
        {/* Axes */}
        <line x1={baseX} y1={baseY + plotH / 2} x2={baseX + plotW} y2={baseY + plotH / 2} stroke="#475569" strokeDasharray="2,2" strokeWidth={0.5} />
        <line x1={baseX + plotW / 2} y1={baseY} x2={baseX + plotW / 2} y2={baseY + plotH} stroke="#475569" strokeDasharray="2,2" strokeWidth={0.5} />
        <rect x={baseX} y={baseY} width={plotW} height={plotH} fill="none" stroke="#64748b" strokeWidth={1} />
        {/* Tick labels */}
        {[-180, -90, 0, 90, 180].map((t) => (
          <g key={`tx-${t}`}>
            <text x={xOf(t)} y={baseY + plotH + 14} fill="#9aa3b8" fontSize="9" textAnchor="middle">{t}°</text>
          </g>
        ))}
        {[-180, -90, 0, 90, 180].map((t) => (
          <g key={`ty-${t}`}>
            <text x={baseX - 6} y={yOf(t) + 3} fill="#9aa3b8" fontSize="9" textAnchor="end">{t}°</text>
          </g>
        ))}
        <text x={baseX + plotW / 2} y={baseY + plotH + 28} fill="#cbd1e6" fontSize="10" textAnchor="middle">φ (phi, N-Cα torsion)</text>
        <text x={14} y={baseY + plotH / 2} fill="#cbd1e6" fontSize="10" textAnchor="middle" transform={`rotate(-90, 14, ${baseY + plotH / 2})`}>ψ (psi, Cα-C torsion)</text>
        {/* Region labels */}
        <text x={xOf(-60)} y={yOf(-45)} fill="#fff" fontSize="9" textAnchor="middle" fontWeight="bold" opacity={0.85}>α</text>
        <text x={xOf(-120)} y={yOf(120)} fill="#fff" fontSize="9" textAnchor="middle" fontWeight="bold" opacity={0.85}>β</text>
        <text x={xOf(60)} y={yOf(45)} fill="#fff" fontSize="9" textAnchor="middle" fontWeight="bold" opacity={0.85}>Lα</text>
        {/* Marker */}
        <circle cx={xOf(phi)} cy={yOf(psi)} r={7} fill={cls.color} stroke="#fff" strokeWidth={1.5} />
      </svg>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <label className="block">φ (phi): {phi}°
          <input type="range" min={-180} max={180} step={5} value={phi} onChange={(e) => setIntPhi(parseInt(e.target.value))} disabled={ctlPhi !== undefined} className="w-full mt-0.5" aria-label="Phi angle" />
        </label>
        <label className="block">ψ (psi): {psi}°
          <input type="range" min={-180} max={180} step={5} value={psi} onChange={(e) => setIntPsi(parseInt(e.target.value))} disabled={ctlPsi !== undefined} className="w-full mt-0.5" aria-label="Psi angle" />
        </label>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
        <button className="px-2 py-1 rounded bg-muted hover:bg-accent" onClick={() => { setIntPhi(-60); setIntPsi(-45); }} disabled={ctlPhi !== undefined || ctlPsi !== undefined}>α-helix preset</button>
        <button className="px-2 py-1 rounded bg-muted hover:bg-accent" onClick={() => { setIntPhi(-120); setIntPsi(120); }} disabled={ctlPhi !== undefined || ctlPsi !== undefined}>β-sheet preset</button>
        <button className="px-2 py-1 rounded bg-muted hover:bg-accent" onClick={() => { setIntPhi(60); setIntPsi(45); }} disabled={ctlPhi !== undefined || ctlPsi !== undefined}>Left-α (Gly)</button>
        <button className="px-2 py-1 rounded bg-muted hover:bg-accent" onClick={() => { setIntPhi(80); setIntPsi(-60); }} disabled={ctlPhi !== undefined || ctlPsi !== undefined}>Disallowed</button>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Ramachandran-Ramakrishnan-Sasisekharan (1963): backbone N-Cα (φ)
        + Cα-C (ψ) torsions are heavily restricted by steric clash
        between non-bonded backbone atoms. Only ~25% of the (φ,ψ) plane
        is sterically accessible; that restriction defines the
        α-helix + β-sheet + polyproline-II + left-handed-α regions and
        anchors every secondary-structure prediction algorithm + every
        protein-validation metric (MolProbity, MolPdf, AlphaFold pLDDT).
        Glycine (no side chain) is the only residue commonly found in
        the left-handed region.
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";

// MacArthur consumer-resource / R* rule. Two consumers compete for two
// resources; each consumer's zero-net-growth isocline (ZNGI) is a curve
// in (R₁, R₂) space. The supply point S and consumption vectors
// determine which consumer wins. Tilman 1982 generalization of Gause's
// competitive-exclusion principle. Drag R*₁, R*₂ for each consumer + the
// supply point; see equilibrium classification (exclusion, coexistence,
// founder effect).

const W = 460;
const H = 320;

interface Props {
  consumerARstar?: [number, number];
  consumerBRstar?: [number, number];
  supplyPoint?: [number, number];
}

export function MacArthurConsumerResource({ consumerARstar: ctlA, consumerBRstar: ctlB, supplyPoint: ctlS }: Props = {}) {
  const [intA, setIntA] = useState<[number, number]>([2, 6]);
  const [intB, setIntB] = useState<[number, number]>([6, 2]);
  const [intS, setIntS] = useState<[number, number]>([5, 5]);
  const A = ctlA ?? intA;
  const B = ctlB ?? intB;
  const S = ctlS ?? intS;

  const baseX = 50;
  const baseY = 20;
  const plotW = W - 60;
  const plotH = H - 80;
  const xMax = 10;
  const yMax = 10;
  const xOf = (x: number) => baseX + (x / xMax) * plotW;
  const yOf = (y: number) => baseY + ((yMax - y) / yMax) * plotH;

  // ZNGI is L-shaped: R₁ ≥ R*₁ AND R₂ ≥ R*₂ → growth ≥ 0 (Liebig minimum)
  // We render two ZNGIs.

  const outcome = useMemo(() => {
    // Below both ZNGIs: neither survives
    if (S[0] < A[0] && S[1] < A[1] && S[0] < B[0] && S[1] < B[1]) return { label: "neither persists", color: "#94a3b8" };
    // Above only one ZNGI
    const supplyAboveA = S[0] > A[0] && S[1] > A[1];
    const supplyAboveB = S[0] > B[0] && S[1] > B[1];
    if (supplyAboveA && !supplyAboveB) return { label: "A wins (exclusion)", color: "#ff6b6b" };
    if (!supplyAboveA && supplyAboveB) return { label: "B wins (exclusion)", color: "#4ecdc4" };
    if (supplyAboveA && supplyAboveB) {
      // Determine if S is in the coexistence wedge
      // Approximate: S between the two ZNGI corners
      const inWedge = (S[0] - A[0]) * (B[1] - A[1]) - (S[1] - A[1]) * (B[0] - A[0]);
      // Coexistence if signs work out (consumption vectors orthogonal-ish)
      if (Math.abs(inWedge) < 6) return { label: "stable coexistence", color: "#a78bfa" };
      if (inWedge > 0) return { label: "founder effect (A or B)", color: "#fbbf24" };
      return { label: "coexistence", color: "#a78bfa" };
    }
    return { label: "ambiguous", color: "#94a3b8" };
  }, [A, B, S]);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">MacArthur ZNGI · <span style={{ color: outcome.color }}>{outcome.label}</span></div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Consumer-resource">
        <rect x={baseX} y={baseY} width={plotW} height={plotH} fill="none" stroke="#475569" strokeWidth={0.5} />
        {/* Grid */}
        {[0, 2, 4, 6, 8, 10].map((g) => (
          <g key={`g-${g}`}>
            <line x1={xOf(g)} y1={baseY} x2={xOf(g)} y2={baseY + plotH} stroke="#1f2937" strokeWidth={0.3} />
            <line x1={baseX} y1={yOf(g)} x2={baseX + plotW} y2={yOf(g)} stroke="#1f2937" strokeWidth={0.3} />
            <text x={xOf(g)} y={baseY + plotH + 12} fill="#9aa3b8" fontSize="8" textAnchor="middle">{g}</text>
            <text x={baseX - 4} y={yOf(g) + 3} fill="#9aa3b8" fontSize="8" textAnchor="end">{g}</text>
          </g>
        ))}
        {/* ZNGI A */}
        <polyline points={`${xOf(A[0])},${yOf(yMax)} ${xOf(A[0])},${yOf(A[1])} ${xOf(xMax)},${yOf(A[1])}`} fill="none" stroke="#ff6b6b" strokeWidth={1.8} />
        <text x={xOf(A[0]) - 4} y={yOf(yMax) + 12} fill="#ff6b6b" fontSize="9" textAnchor="end">ZNGI_A (R*=({A[0]},{A[1]}))</text>
        {/* ZNGI B */}
        <polyline points={`${xOf(B[0])},${yOf(yMax)} ${xOf(B[0])},${yOf(B[1])} ${xOf(xMax)},${yOf(B[1])}`} fill="none" stroke="#4ecdc4" strokeWidth={1.8} />
        <text x={xOf(xMax)} y={yOf(B[1]) + 12} fill="#4ecdc4" fontSize="9" textAnchor="end">ZNGI_B (R*=({B[0]},{B[1]}))</text>
        {/* Supply point S */}
        <circle cx={xOf(S[0])} cy={yOf(S[1])} r={7} fill="#fbbf24" stroke="#0b1228" strokeWidth={1.5} />
        <text x={xOf(S[0]) + 9} y={yOf(S[1]) + 3} fill="#fbbf24" fontSize="9">S</text>
        {/* Axes labels */}
        <text x={baseX + plotW / 2} y={baseY + plotH + 26} fill="#cbd1e6" fontSize="10" textAnchor="middle">resource R₁</text>
        <text x={14} y={baseY + plotH / 2} fill="#cbd1e6" fontSize="10" textAnchor="middle" transform={`rotate(-90, 14, ${baseY + plotH / 2})`}>resource R₂</text>
      </svg>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <label className="block">A: R*₁ = {A[0]}
          <input type="range" min={0} max={9} step={0.5} value={A[0]} onChange={(e) => setIntA([parseFloat(e.target.value), A[1]])} disabled={ctlA !== undefined} className="w-full mt-0.5" aria-label="A R*1" />
        </label>
        <label className="block">A: R*₂ = {A[1]}
          <input type="range" min={0} max={9} step={0.5} value={A[1]} onChange={(e) => setIntA([A[0], parseFloat(e.target.value)])} disabled={ctlA !== undefined} className="w-full mt-0.5" aria-label="A R*2" />
        </label>
        <label className="block">B: R*₁ = {B[0]}
          <input type="range" min={0} max={9} step={0.5} value={B[0]} onChange={(e) => setIntB([parseFloat(e.target.value), B[1]])} disabled={ctlB !== undefined} className="w-full mt-0.5" aria-label="B R*1" />
        </label>
        <label className="block">B: R*₂ = {B[1]}
          <input type="range" min={0} max={9} step={0.5} value={B[1]} onChange={(e) => setIntB([B[0], parseFloat(e.target.value)])} disabled={ctlB !== undefined} className="w-full mt-0.5" aria-label="B R*2" />
        </label>
        <label className="block">S: R₁ = {S[0]}
          <input type="range" min={0} max={10} step={0.5} value={S[0]} onChange={(e) => setIntS([parseFloat(e.target.value), S[1]])} disabled={ctlS !== undefined} className="w-full mt-0.5" aria-label="Supply R1" />
        </label>
        <label className="block">S: R₂ = {S[1]}
          <input type="range" min={0} max={10} step={0.5} value={S[1]} onChange={(e) => setIntS([S[0], parseFloat(e.target.value)])} disabled={ctlS !== undefined} className="w-full mt-0.5" aria-label="Supply R2" />
        </label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        MacArthur 1970 / Tilman 1982 consumer-resource model. Each
        consumer i has a zero-net-growth isocline (ZNGI) — the locus of
        resource concentrations where its growth = mortality. ZNGIs
        are L-shaped when both resources are essential (Liebig minimum
        law). The species with the lower R* on the limiting resource
        wins (R* rule, Tilman 1980). Two consumers can coexist on two
        resources iff each is limited by a different resource at
        equilibrium AND the supply point S lies in the wedge between
        their consumption vectors. Founder effect (alt. stable states)
        arises when consumption vectors are aligned poorly with supply.
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";

// Tanabe-Sugano diagram for octahedral d^n complexes. Plots normalized
// energy E/B vs ligand-field strength Δ/B with the ground state as the
// x-axis (always at E/B = 0). Energies of excited terms are tracked
// from the free-ion (Russell-Saunders) values. We render simplified
// curves for d^2, d^3, d^5, d^6, d^8 — selected by the user. The
// vertical line at the chosen Δ/B picks out predicted UV-vis
// transition energies for that complex. The d^4-d^7 diagrams show
// high-spin → low-spin crossover at a critical Δ/B.

const W = 460;
const H = 300;

interface Props {
  electronConfig?: "d2" | "d3" | "d5" | "d6" | "d8";
  DqB?: number;
}

// Approximate ground-state-anchored curves (in units of E/B vs Δ/B).
// These are illustrative — real TS diagrams come from full d^n
// configuration interaction calculations.
function curves(config: string): Array<{ label: string; points: Array<{ x: number; y: number }>; color: string; multiplicity: number }> {
  const N = 60;
  const xs = Array.from({ length: N }, (_, i) => i * 0.8);
  const lerp = (slope: number, offset: number) => xs.map((x) => ({ x, y: offset + slope * x }));
  switch (config) {
    case "d2":
      return [
        { label: "³T₁(F) [ground]", points: lerp(0, 0), color: "#4ecdc4", multiplicity: 3 },
        { label: "³T₂(F)", points: lerp(0.8, 8), color: "#fbbf24", multiplicity: 3 },
        { label: "³T₁(P)", points: lerp(1.2, 15), color: "#ff6b6b", multiplicity: 3 },
        { label: "³A₂(F)", points: lerp(1.6, 18), color: "#a78bfa", multiplicity: 3 },
        { label: "¹E", points: xs.map((x) => ({ x, y: 8 + 0.1 * x })), color: "#94a3b8", multiplicity: 1 },
      ];
    case "d3":
      return [
        { label: "⁴A₂(F) [ground]", points: lerp(0, 0), color: "#4ecdc4", multiplicity: 4 },
        { label: "⁴T₂(F)", points: lerp(0.9, 0), color: "#fbbf24", multiplicity: 4 },
        { label: "⁴T₁(F)", points: lerp(1.5, 8), color: "#ff6b6b", multiplicity: 4 },
        { label: "⁴T₁(P)", points: lerp(1.0, 22), color: "#a78bfa", multiplicity: 4 },
        { label: "²E (sharp)", points: xs.map((x) => ({ x, y: 15 + 0.05 * x })), color: "#94a3b8", multiplicity: 2 },
      ];
    case "d5":
      return [
        { label: "⁶A₁(S) [HS ground]", points: xs.map((x) => ({ x, y: x < 28 ? 0 : 40 - x * 1.2 })), color: "#4ecdc4", multiplicity: 6 },
        { label: "²T₂(I) [LS ground after CO]", points: xs.map((x) => ({ x, y: x < 28 ? 30 - x * 0.5 : 0 })), color: "#a78bfa", multiplicity: 2 },
        { label: "⁴T₁(G)", points: lerp(0.5, 12), color: "#fbbf24", multiplicity: 4 },
        { label: "⁴T₂(G)", points: lerp(0.7, 16), color: "#ff6b6b", multiplicity: 4 },
        { label: "⁴E (sharp)", points: xs.map((x) => ({ x, y: 22 + 0.1 * x })), color: "#94a3b8", multiplicity: 4 },
      ];
    case "d6":
      return [
        { label: "⁵T₂(D) [HS ground]", points: xs.map((x) => ({ x, y: x < 20 ? 0 : 30 - x * 1.5 })), color: "#4ecdc4", multiplicity: 5 },
        { label: "¹A₁(I) [LS ground]", points: xs.map((x) => ({ x, y: x < 20 ? 20 - x * 1.0 : 0 })), color: "#a78bfa", multiplicity: 1 },
        { label: "⁵E", points: lerp(0.8, 6), color: "#fbbf24", multiplicity: 5 },
        { label: "¹T₁", points: xs.map((x) => ({ x, y: x < 20 ? 18 : 8 + (x - 20) * 0.4 })), color: "#ff6b6b", multiplicity: 1 },
        { label: "¹T₂", points: xs.map((x) => ({ x, y: x < 20 ? 25 : 16 + (x - 20) * 0.6 })), color: "#94a3b8", multiplicity: 1 },
      ];
    case "d8":
      return [
        { label: "³A₂(F) [ground]", points: lerp(0, 0), color: "#4ecdc4", multiplicity: 3 },
        { label: "³T₂(F)", points: lerp(0.8, 0), color: "#fbbf24", multiplicity: 3 },
        { label: "³T₁(F)", points: lerp(1.4, 12), color: "#ff6b6b", multiplicity: 3 },
        { label: "³T₁(P)", points: lerp(1.0, 22), color: "#a78bfa", multiplicity: 3 },
        { label: "¹E (sharp)", points: xs.map((x) => ({ x, y: 8 + 0.05 * x })), color: "#94a3b8", multiplicity: 1 },
      ];
  }
  return [];
}

export function TanabeSuganoDiagram({ electronConfig: ctlConfig, DqB: ctlDq }: Props = {}) {
  const [intConfig, setIntConfig] = useState<"d2" | "d3" | "d5" | "d6" | "d8">("d3");
  const [intDq, setIntDq] = useState(2.5);
  const config = ctlConfig ?? intConfig;
  const Dq = ctlDq ?? intDq;

  const cs = useMemo(() => curves(config), [config]);

  const baseX = 50;
  const baseY = 20;
  const plotW = W - 70;
  const plotH = H - 80;
  const xMax = 45;
  const yMax = 50;
  const xOf = (x: number) => baseX + (x / xMax) * plotW;
  const yOf = (y: number) => baseY + ((yMax - y) / yMax) * plotH;

  // Predicted UV-vis transitions at chosen Dq/B
  const transitions = useMemo(() => {
    return cs.slice(1).map((c) => {
      // sample c at x = Dq*10/B (Dq input is already in units of Δ/B / 10)
      const xValue = Dq * 10;
      const pt = c.points.find((p) => Math.abs(p.x - xValue) < 0.8) ?? c.points[Math.min(c.points.length - 1, Math.round(xValue / 0.8))];
      return { label: c.label, energy: pt.y, color: c.color };
    }).filter((t) => t.energy > 0).slice(0, 4);
  }, [cs, Dq]);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Tanabe-Sugano · {config} · Δ/B = {(Dq * 10).toFixed(1)}</div>
        <div className="flex gap-1">
          {(["d2", "d3", "d5", "d6", "d8"] as const).map((c) => (
            <button key={c} onClick={() => setIntConfig(c)} disabled={ctlConfig !== undefined} className={`px-2 py-0.5 rounded text-[10px] ${config === c ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{c}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Tanabe-Sugano diagram">
        <rect x={baseX} y={baseY} width={plotW} height={plotH} fill="none" stroke="#475569" strokeWidth={0.5} />
        {[0, 10, 20, 30, 40].map((y) => (
          <g key={`y-${y}`}>
            <line x1={baseX} y1={yOf(y)} x2={baseX + plotW} y2={yOf(y)} stroke="#1f2937" strokeWidth={0.3} />
            <text x={baseX - 4} y={yOf(y) + 3} fill="#9aa3b8" fontSize="8" textAnchor="end">{y}</text>
          </g>
        ))}
        {[0, 10, 20, 30, 40].map((x) => (
          <g key={`x-${x}`}>
            <line x1={xOf(x)} y1={baseY} x2={xOf(x)} y2={baseY + plotH} stroke="#1f2937" strokeWidth={0.3} />
            <text x={xOf(x)} y={baseY + plotH + 10} fill="#9aa3b8" fontSize="8" textAnchor="middle">{x}</text>
          </g>
        ))}
        <text x={baseX + plotW / 2} y={baseY + plotH + 22} fill="#cbd1e6" fontSize="9" textAnchor="middle">Δ/B (ligand-field strength)</text>
        <text x={12} y={baseY + plotH / 2} fill="#cbd1e6" fontSize="9" textAnchor="middle" transform={`rotate(-90, 12, ${baseY + plotH / 2})`}>E/B</text>
        {/* Curves */}
        {cs.map((c, i) => (
          <g key={`c-${i}`}>
            <path d={c.points.map((p, j) => `${j === 0 ? "M" : "L"}${xOf(p.x).toFixed(2)},${yOf(p.y).toFixed(2)}`).join(" ")} fill="none" stroke={c.color} strokeWidth={1.5} strokeDasharray={c.label.includes("sharp") ? "3,2" : "0"} />
            {c.points.length > 0 && <text x={xOf(c.points[c.points.length - 1].x) - 4} y={yOf(c.points[c.points.length - 1].y) - 3} fill={c.color} fontSize="7.5" textAnchor="end">{c.label}</text>}
          </g>
        ))}
        {/* Vertical Δ/B selector */}
        <line x1={xOf(Dq * 10)} y1={baseY} x2={xOf(Dq * 10)} y2={baseY + plotH} stroke="#fff" strokeWidth={1.2} strokeDasharray="4,3" opacity={0.8} />
      </svg>

      <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[9px]">
        {transitions.map((t, i) => (
          <span key={i} style={{ color: t.color }}>{t.label}: {t.energy.toFixed(1)} B</span>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-1 gap-x-3 gap-y-2 text-xs">
        <label className="block">Δ/B (Dq/B × 10): {(Dq * 10).toFixed(1)}
          <input type="range" min={0.5} max={4.5} step={0.1} value={Dq} onChange={(e) => setIntDq(parseFloat(e.target.value))} disabled={ctlDq !== undefined} className="w-full mt-0.5" aria-label="Field strength ratio" />
        </label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Tanabe-Sugano diagrams (1954): excited-state energies relative
        to ground state E/B, plotted vs ligand-field strength Δ/B. Free-
        ion (Russell-Saunders) terms ²S+¹L split into octahedral terms
        (e.g., ³F → ³A₂, ³T₂, ³T₁). For d⁴-d⁷ a high-spin → low-spin
        crossover appears at the strong-field limit: weak-field
        ligands (H₂O, F⁻) give HS; strong-field (CN⁻, CO) give LS.
        Vertical line = Δ/B for your complex. Intersections give
        predicted UV-vis transition energies (Laporte- + spin-allowed
        bands). Race-down B Racah parameter measures interelectronic
        repulsion + nephelauxetic series tracks covalency.
      </div>
    </div>
  );
}

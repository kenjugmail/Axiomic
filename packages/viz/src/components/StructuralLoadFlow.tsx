import { useMemo, useState } from "react";

// Static analysis of three canonical structural systems: simply
// supported beam, cantilever, and a Pratt truss. Drag a point-load
// position + magnitude; see live reaction forces + bending-moment
// diagram (where applicable). Euler-Bernoulli beam theory.

const W = 460;
const H = 320;

type System = "beam" | "cantilever" | "truss";

interface Props {
  system?: System;
}

export function StructuralLoadFlow({ system: ctlSys }: Props = {}) {
  const [intSys, setIntSys] = useState<System>("beam");
  const [P, setP] = useState(10); // load magnitude (kN)
  const [a, setA] = useState(0.5); // load position (fraction of L)
  const sys = ctlSys ?? intSys;
  const L = 10; // span (m)
  const pos = a * L;

  // Reactions
  const reactions = useMemo(() => {
    if (sys === "beam") {
      // Simply supported: R_a = P(L-a)/L, R_b = P·a/L
      return { Ra: (P * (L - pos)) / L, Rb: (P * pos) / L, M_a: 0, M_b: 0 };
    }
    if (sys === "cantilever") {
      // Fixed at left: R = P, M_fixed = P·a
      return { Ra: P, Rb: 0, M_a: P * pos, M_b: 0 };
    }
    // Truss: same as simply supported for top-chord load
    return { Ra: (P * (L - pos)) / L, Rb: (P * pos) / L, M_a: 0, M_b: 0 };
  }, [sys, P, pos]);

  // Bending moment diagram
  const moments = useMemo(() => {
    const N = 100;
    const pts: Array<{ x: number; M: number }> = [];
    for (let i = 0; i <= N; i++) {
      const x = (i / N) * L;
      let M = 0;
      if (sys === "beam" || sys === "truss") {
        // M(x) = R_a·x for x < a; = R_a·x - P·(x-a) for x >= a
        M = reactions.Ra * x;
        if (x >= pos) M -= P * (x - pos);
      } else if (sys === "cantilever") {
        // M(x) = -P·(a-x) for x <= a, else 0. Convention: fix moment positive
        M = x <= pos ? P * (pos - x) : 0;
      }
      pts.push({ x, M });
    }
    return pts;
  }, [sys, P, pos, reactions]);

  const Mmax = Math.max(...moments.map((p) => Math.abs(p.M)), 0.01);

  // Plot layout
  const baseX = 40;
  const beamY = 70;
  const beamW = W - baseX - 20;
  const xOfP = (x: number) => baseX + (x / L) * beamW;
  const momentY0 = 180;
  const momentH = 80;
  const yOfM = (M: number) => momentY0 + momentH / 2 - (M / Mmax) * (momentH / 2 - 4);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">{sys} · L = {L} m · P = {P} kN at {pos.toFixed(1)} m · R<sub>a</sub> = {reactions.Ra.toFixed(2)} kN · R<sub>b</sub> = {reactions.Rb.toFixed(2)} kN · M<sub>max</sub> = {Mmax.toFixed(2)} kN·m</div>
        <div className="flex gap-1">
          {(["beam", "cantilever", "truss"] as System[]).map((s) => (
            <button key={s} onClick={() => setIntSys(s)} disabled={ctlSys !== undefined} className={`px-1.5 py-0.5 rounded text-[9px] ${sys === s ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{s}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Structural load flow">
        {/* Beam line */}
        <line x1={xOfP(0)} y1={beamY} x2={xOfP(L)} y2={beamY} stroke="#cbd1e6" strokeWidth={3} />
        {/* Truss web (Pratt) */}
        {sys === "truss" && (() => {
          const panels = 6;
          const panelL = L / panels;
          const trussH = 20;
          const elements: JSX.Element[] = [];
          for (let i = 0; i < panels; i++) {
            const x1 = xOfP(i * panelL);
            const x2 = xOfP((i + 1) * panelL);
            // Top chord
            elements.push(<line key={`t-${i}`} x1={x1} y1={beamY - trussH} x2={x2} y2={beamY - trussH} stroke="#475569" strokeWidth={1.5} />);
            // Vertical
            elements.push(<line key={`v-${i}`} x1={x1} y1={beamY} x2={x1} y2={beamY - trussH} stroke="#475569" strokeWidth={1.5} />);
            // Diagonal (Pratt: rises toward center)
            if (i < panels / 2) {
              elements.push(<line key={`d-${i}`} x1={x1} y1={beamY} x2={x2} y2={beamY - trussH} stroke="#475569" strokeWidth={1.5} />);
            } else {
              elements.push(<line key={`d-${i}`} x1={x2} y1={beamY} x2={x1} y2={beamY - trussH} stroke="#475569" strokeWidth={1.5} />);
            }
          }
          // Right vertical
          elements.push(<line key="v-last" x1={xOfP(L)} y1={beamY} x2={xOfP(L)} y2={beamY - trussH} stroke="#475569" strokeWidth={1.5} />);
          return <g>{elements}</g>;
        })()}
        {/* Supports */}
        {sys === "cantilever" ? (
          <g>
            {/* Fixed support: hatched wall */}
            <line x1={xOfP(0) - 6} y1={beamY - 12} x2={xOfP(0) - 6} y2={beamY + 12} stroke="#cbd1e6" strokeWidth={2} />
            {[-10, -4, 2, 8].map((dy) => (
              <line key={dy} x1={xOfP(0) - 12} y1={beamY + dy + 4} x2={xOfP(0) - 6} y2={beamY + dy} stroke="#cbd1e6" strokeWidth={1} />
            ))}
            {/* Moment reaction arrow */}
            <text x={xOfP(0) - 10} y={beamY - 22} fill="#ff6b6b" fontSize="9" textAnchor="end">M={reactions.M_a.toFixed(1)}</text>
          </g>
        ) : (
          <g>
            {/* Pin at left */}
            <polygon points={`${xOfP(0) - 6},${beamY + 12} ${xOfP(0) + 6},${beamY + 12} ${xOfP(0)},${beamY + 2}`} fill="#cbd1e6" />
            <line x1={xOfP(0) - 9} y1={beamY + 14} x2={xOfP(0) + 9} y2={beamY + 14} stroke="#cbd1e6" strokeWidth={1.5} />
            {/* Roller at right */}
            <circle cx={xOfP(L)} cy={beamY + 6} r={4} fill="#cbd1e6" />
            <line x1={xOfP(L) - 9} y1={beamY + 14} x2={xOfP(L) + 9} y2={beamY + 14} stroke="#cbd1e6" strokeWidth={1.5} />
          </g>
        )}
        {/* Load arrow */}
        <line x1={xOfP(pos)} y1={beamY - 26} x2={xOfP(pos)} y2={beamY - 6} stroke="#fbbf24" strokeWidth={2} markerEnd="url(#larrow)" />
        <text x={xOfP(pos)} y={beamY - 30} fill="#fbbf24" fontSize="9" textAnchor="middle">P = {P} kN</text>
        <defs>
          <marker id="larrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#fbbf24" />
          </marker>
        </defs>
        {/* Reaction arrows */}
        <line x1={xOfP(0)} y1={beamY + 30} x2={xOfP(0)} y2={beamY + 12} stroke="#4ecdc4" strokeWidth={2} markerEnd="url(#rarrow)" />
        <text x={xOfP(0)} y={beamY + 42} fill="#4ecdc4" fontSize="9" textAnchor="middle">{reactions.Ra.toFixed(1)}</text>
        {sys !== "cantilever" && (
          <g>
            <line x1={xOfP(L)} y1={beamY + 30} x2={xOfP(L)} y2={beamY + 12} stroke="#4ecdc4" strokeWidth={2} markerEnd="url(#rarrow)" />
            <text x={xOfP(L)} y={beamY + 42} fill="#4ecdc4" fontSize="9" textAnchor="middle">{reactions.Rb.toFixed(1)}</text>
          </g>
        )}
        <defs>
          <marker id="rarrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#4ecdc4" />
          </marker>
        </defs>
        {/* Moment diagram */}
        <text x={baseX} y={momentY0 - 8} fill="#9aa3b8" fontSize="9">bending moment M(x)</text>
        <line x1={baseX} y1={momentY0 + momentH / 2} x2={baseX + beamW} y2={momentY0 + momentH / 2} stroke="#1f2937" strokeWidth={0.3} />
        <path
          d={`M${xOfP(0)},${momentY0 + momentH / 2} ` + moments.map((p) => `L${xOfP(p.x).toFixed(1)},${yOfM(p.M).toFixed(1)}`).join(" ") + ` L${xOfP(L)},${momentY0 + momentH / 2} Z`}
          fill="#a78bfa"
          fillOpacity={0.25}
          stroke="#a78bfa"
          strokeWidth={1.5}
        />
        {/* Length labels */}
        <text x={baseX + beamW / 2} y={H - 8} fill="#cbd1e6" fontSize="9" textAnchor="middle">span L = {L} m</text>
      </svg>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <label className="block">load P: {P} kN
          <input type="range" min={1} max={30} step={1} value={P} onChange={(e) => setP(parseInt(e.target.value))} className="w-full mt-0.5" aria-label="Load" />
        </label>
        <label className="block">position a/L: {a.toFixed(2)}
          <input type="range" min={0.05} max={0.95} step={0.05} value={a} onChange={(e) => setA(parseFloat(e.target.value))} className="w-full mt-0.5" aria-label="Position" />
        </label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Static equilibrium: ΣF = 0 and ΣM = 0 give the reactions.
        For a <b>simply supported beam</b> with a point load P at distance
        a from the left support on span L: R<sub>a</sub> = P(L−a)/L,
        R<sub>b</sub> = Pa/L, and M<sub>max</sub> = R<sub>a</sub>·a at
        the load point. <b>Cantilever</b>: the wall takes the full shear
        (R = P) plus a fixed-end moment M = P·a — fixed-end moments
        are why cantilevers need much deeper sections than equivalent
        simply-supported spans. <b>Pratt truss</b> (Caleb Pratt 1844):
        verticals carry compression, diagonals tension — same
        equilibrium reactions as the beam but loads flow through
        axial members, ideal for steel + spans 20-80 m.
        Euler-Bernoulli beam theory (1750) gives σ = My/I for stress
        from bending; for steel I-beams the section modulus S = I/c
        sets the allowable load.
      </div>
    </div>
  );
}

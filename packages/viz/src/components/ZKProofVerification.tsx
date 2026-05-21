import { useMemo, useState } from "react";

// Schematic ZK proof verification pipeline. We show the three-phase
// non-interactive proof flow:
//   Setup (CRS) → Prover (witness + circuit → π) → Verifier (π → 0/1)
// with a Merkle-style commitment tree visualizing polynomial commitments
// (KZG/FRI). Drag scheme + circuit size; see proof size, verification
// time, and trusted-setup requirements update.

const W = 460;
const H = 320;

interface Props {
  scheme?: "groth16" | "plonk" | "stark" | "bulletproofs";
  circuitSize?: number;
}

const SCHEMES = {
  groth16: { label: "Groth16",       proofSize: 192,   verifyMs: 5,   setup: "circuit-specific", pq: false, commitment: "KZG" },
  plonk:   { label: "PLONK",         proofSize: 800,   verifyMs: 10,  setup: "universal",        pq: false, commitment: "KZG" },
  stark:   { label: "STARK",         proofSize: 80000, verifyMs: 30,  setup: "transparent",      pq: true,  commitment: "FRI" },
  bulletproofs: { label: "Bulletproofs", proofSize: 1500, verifyMs: 200, setup: "transparent",   pq: false, commitment: "IPA" },
};

export function ZKProofVerification({ scheme: ctlS, circuitSize: ctlC }: Props = {}) {
  const [intS, setIntS] = useState<keyof typeof SCHEMES>("groth16");
  const [intC, setIntC] = useState(1024);
  const scheme = ctlS ?? intS;
  const C = ctlC ?? intC;
  const info = SCHEMES[scheme];

  // Scale proof size with circuit (Groth16 constant, PLONK constant, STARK polylog)
  const actualProofSize = scheme === "groth16" ? info.proofSize
    : scheme === "plonk" ? info.proofSize
    : scheme === "stark" ? Math.round(info.proofSize * Math.log2(C / 1024 + 1) / 5)
    : Math.round(info.proofSize * Math.log2(C / 1024 + 1));
  const verifyMs = scheme === "groth16" ? info.verifyMs
    : scheme === "plonk" ? info.verifyMs * (Math.log2(C) / Math.log2(1024))
    : scheme === "stark" ? info.verifyMs * Math.log2(C) / Math.log2(1024)
    : info.verifyMs * Math.log2(C / 1024 + 1);

  // Merkle / commitment tree visualization
  const tree = useMemo(() => {
    const depth = 4;
    const nodes: Array<{ x: number; y: number; level: number; revealed: boolean }> = [];
    for (let level = 0; level <= depth; level++) {
      const count = Math.pow(2, level);
      for (let i = 0; i < count; i++) {
        const x = 60 + (i + 0.5) * (340 / count);
        const y = 60 + level * 35;
        const revealed = level >= 2 && i % 3 === 0;
        nodes.push({ x, y, level, revealed });
      }
    }
    return { nodes, depth };
  }, []);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">{info.label} · proof {actualProofSize.toLocaleString()} bytes · verify {verifyMs.toFixed(1)} ms · {info.pq ? "post-quantum" : "classical"}</div>
        <div className="flex gap-1">
          {(Object.keys(SCHEMES) as Array<keyof typeof SCHEMES>).map((s) => (
            <button key={s} onClick={() => setIntS(s)} disabled={ctlS !== undefined} className={`px-2 py-0.5 rounded text-[9px] ${scheme === s ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{SCHEMES[s].label}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="ZK proof flow">
        {/* Three phases */}
        <text x={W / 2} y={20} fill="#cbd1e6" fontSize="11" textAnchor="middle" fontWeight="bold">{info.commitment} polynomial commitment + Merkle openings</text>
        {/* Tree edges */}
        {tree.nodes.filter((n) => n.level > 0).map((n, i) => {
          const parentLevel = n.level - 1;
          const parentsAtLevel = tree.nodes.filter((nn) => nn.level === parentLevel);
          const parentIdx = Math.floor((tree.nodes.filter((nn) => nn.level === n.level).indexOf(n)) / 2);
          const parent = parentsAtLevel[parentIdx];
          if (!parent) return null;
          return <line key={`e-${i}`} x1={n.x} y1={n.y - 6} x2={parent.x} y2={parent.y + 6} stroke="#475569" strokeWidth={0.6} />;
        })}
        {/* Tree nodes */}
        {tree.nodes.map((n, i) => (
          <g key={`n-${i}`}>
            <rect x={n.x - 8} y={n.y - 6} width={16} height={12} rx={2} fill={n.revealed ? "#fbbf24" : "#1f2937"} stroke="#4ecdc4" strokeWidth={0.8} />
            <text x={n.x} y={n.y + 3} fill={n.revealed ? "#000" : "#cbd1e6"} fontSize="6.5" textAnchor="middle">{n.level === 0 ? "root" : n.revealed ? "open" : "h"}</text>
          </g>
        ))}
        {/* Phase labels at bottom */}
        <g transform={`translate(0, 230)`}>
          <rect x={30} y={0} width={120} height={50} rx={6} fill="#1f2937" stroke="#a78bfa" strokeWidth={1} />
          <text x={90} y={18} fill="#a78bfa" fontSize="10" textAnchor="middle" fontWeight="bold">Setup (CRS)</text>
          <text x={90} y={32} fill="#cbd1e6" fontSize="8" textAnchor="middle">{info.setup}</text>
          <text x={90} y={44} fill="#cbd1e6" fontSize="7" textAnchor="middle">{info.pq ? "no trusted setup" : info.setup === "transparent" ? "transparent" : "ceremony"}</text>

          <rect x={170} y={0} width={120} height={50} rx={6} fill="#1f2937" stroke="#fbbf24" strokeWidth={1} />
          <text x={230} y={18} fill="#fbbf24" fontSize="10" textAnchor="middle" fontWeight="bold">Prover</text>
          <text x={230} y={32} fill="#cbd1e6" fontSize="8" textAnchor="middle">witness + circuit</text>
          <text x={230} y={44} fill="#cbd1e6" fontSize="7" textAnchor="middle">⇒ π (proof)</text>

          <rect x={310} y={0} width={120} height={50} rx={6} fill="#1f2937" stroke="#4ecdc4" strokeWidth={1} />
          <text x={370} y={18} fill="#4ecdc4" fontSize="10" textAnchor="middle" fontWeight="bold">Verifier</text>
          <text x={370} y={32} fill="#cbd1e6" fontSize="8" textAnchor="middle">π + public inputs</text>
          <text x={370} y={44} fill="#cbd1e6" fontSize="7" textAnchor="middle">⇒ accept/reject</text>

          {/* Arrows */}
          <line x1={150} y1={25} x2={170} y2={25} stroke="#cbd1e6" strokeWidth={1} markerEnd="url(#zkArr)" />
          <line x1={290} y1={25} x2={310} y2={25} stroke="#cbd1e6" strokeWidth={1} markerEnd="url(#zkArr)" />
        </g>
        <defs>
          <marker id="zkArr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#cbd1e6" />
          </marker>
        </defs>
      </svg>

      <div className="mt-2 grid grid-cols-1 gap-x-3 gap-y-2 text-xs">
        <label className="block">Circuit size (gates): {C.toLocaleString()}
          <input type="range" min={64} max={1048576} step={64} value={C} onChange={(e) => setIntC(parseInt(e.target.value))} disabled={ctlC !== undefined} className="w-full mt-0.5" aria-label="Circuit size" />
        </label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Three-phase NIZK proof flow: a circuit-specific (Groth16) or
        universal (PLONK) setup produces a common reference string;
        the prover commits to polynomials (KZG, FRI, or IPA) +
        provides openings at random challenge points (Fiat-Shamir
        derived from a Merkle root); the verifier checks the
        openings against the commitment in O(polylog(circuit)) time.
        Groth16: smallest proofs + fastest verify but trusted setup.
        PLONK: universal setup, mid-size proofs. STARK: transparent +
        post-quantum (hash-based), much larger proofs. Bulletproofs:
        no setup, log-size proofs, slow verifier. ZK rollups (zkSync,
        StarkNet, Polygon zkEVM) batch L2 transactions into one proof.
      </div>
    </div>
  );
}

import { useState } from "react";

// A control-flow graph (CFG) — the compiler's mid-level representation of a
// function. Code is split into BASIC BLOCKS (maximal straight-line runs
// with one entry and one exit); directed edges encode the possible jumps.
// Branches fork (true/false), loops add a BACK EDGE, and where paths merge,
// SSA form inserts a φ ("phi") node to reconcile the versions of a variable
// arriving from each predecessor. Optimizations (dead-code elimination,
// constant propagation, loop analysis) all operate on this graph.

const W = 460;
const H = 290;

interface Block { id: number; label: string; x: number; y: number; kind?: "phi" | "exit"; }
interface Edge { from: number; to: number; label?: string; back?: boolean; }
interface Ex { blocks: Block[]; edges: Edge[]; }

const EXAMPLES: Record<string, Ex> = {
  "if / else": {
    blocks: [
      { id: 0, label: "x = read()", x: 230, y: 36 },
      { id: 1, label: "if x < 10", x: 230, y: 92 },
      { id: 2, label: "y = 1", x: 130, y: 150 },
      { id: 3, label: "y = 2", x: 330, y: 150 },
      { id: 4, label: "y = φ(y₁,y₂)", x: 230, y: 212, kind: "phi" },
    ],
    edges: [{ from: 0, to: 1 }, { from: 1, to: 2, label: "T" }, { from: 1, to: 3, label: "F" }, { from: 2, to: 4 }, { from: 3, to: 4 }],
  },
  "while loop": {
    blocks: [
      { id: 0, label: "i = 0", x: 200, y: 36 },
      { id: 1, label: "if i < n", x: 200, y: 100 },
      { id: 2, label: "i = i + 1", x: 200, y: 168 },
      { id: 3, label: "done", x: 350, y: 100, kind: "exit" },
    ],
    edges: [{ from: 0, to: 1 }, { from: 1, to: 2, label: "T" }, { from: 1, to: 3, label: "F" }, { from: 2, to: 1, back: true }],
  },
  "early return": {
    blocks: [
      { id: 0, label: "open(f)", x: 230, y: 36 },
      { id: 1, label: "if err", x: 230, y: 92 },
      { id: 2, label: "return −1", x: 120, y: 156 },
      { id: 3, label: "process()", x: 330, y: 156 },
      { id: 4, label: "return 0", x: 230, y: 220, kind: "exit" },
    ],
    edges: [{ from: 0, to: 1 }, { from: 1, to: 2, label: "T" }, { from: 1, to: 3, label: "F" }, { from: 3, to: 4 }, { from: 2, to: 4 }],
  },
};
const ORDER = ["if / else", "while loop", "early return"];
const BW = 96, BH = 28;

interface Props {
  example?: string;
}

export function ControlFlowGraph({ example: ctl }: Props = {}) {
  const [intEx, setIntEx] = useState("if / else");
  const key = ctl ?? intEx;
  const ex = EXAMPLES[key];
  const byId = (id: number) => ex.blocks.find((b) => b.id === id)!;
  const hasLoop = ex.edges.some((e) => e.back);

  // edge endpoint on the block border (simple: vertical or routed)
  const edgePath = (e: Edge): string => {
    const f = byId(e.from), t = byId(e.to);
    if (e.back) {
      // route back edge around the right side
      return `M${f.x + BW / 2},${f.y} C${f.x + 110},${f.y} ${t.x + 110},${t.y} ${t.x + BW / 2},${t.y + 6}`;
    }
    const fy = f.y + (t.y > f.y ? BH / 2 : -BH / 2);
    const ty = t.y + (t.y > f.y ? -BH / 2 : BH / 2);
    return `M${f.x},${fy} L${t.x},${ty}`;
  };

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">
          {ex.blocks.length} basic blocks{hasLoop ? " · back edge = loop" : ""}
        </div>
        <div className="flex gap-1">
          {ORDER.map((e) => (
            <button key={e} onClick={() => setIntEx(e)} disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${key === e ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{e}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Control-flow graph of basic blocks">
        {ex.edges.map((e, i) => (
          <g key={i}>
            <path d={edgePath(e)} fill="none" stroke={e.back ? "#fb923c" : "#475569"} strokeWidth={1.2} strokeDasharray={e.back ? "4,3" : undefined} markerEnd="url(#cfgA)" />
            {e.label && (() => {
              const f = byId(e.from), t = byId(e.to);
              return <text x={(f.x + t.x) / 2 + (e.label === "T" ? -10 : 10)} y={(f.y + t.y) / 2} fill={e.label === "T" ? "#4ade80" : "#f87171"} fontSize="8" textAnchor="middle">{e.label}</text>;
            })()}
          </g>
        ))}
        {ex.blocks.map((b) => (
          <g key={b.id}>
            <rect x={b.x - BW / 2} y={b.y - BH / 2} width={BW} height={BH} rx={4}
              fill={b.kind === "phi" ? "#1e2a52" : b.kind === "exit" ? "#0d2417" : "#0e1a3a"}
              stroke={b.kind === "phi" ? "#a78bfa" : b.kind === "exit" ? "#4ade80" : "#38bdf8"} strokeWidth={1.3} />
            <text x={b.x} y={b.y + 4} fill="#e5e9f5" fontSize="9" textAnchor="middle" fontFamily="monospace">{b.label}</text>
          </g>
        ))}
        <defs><marker id="cfgA" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#475569" /></marker></defs>
        {/* legend */}
        <g transform="translate(20,255)">
          <rect x={0} y={0} width={10} height={10} fill="#1e2a52" stroke="#a78bfa" strokeWidth={1} /><text x={14} y={9} fill="#9aa3b8" fontSize="8">φ merge (SSA)</text>
          <line x1={120} y1={5} x2={140} y2={5} stroke="#fb923c" strokeWidth={1.2} strokeDasharray="4,3" /><text x={144} y={9} fill="#9aa3b8" fontSize="8">back edge (loop)</text>
        </g>
      </svg>

      <div className="mt-1 text-[10px] text-muted-foreground">
        Each <b>basic block</b> is a run of instructions with no branches in
        except at the top and none out except at the bottom. A conditional
        forks into <b>T</b>/<b>F</b> edges; a loop introduces a <b>back
        edge</b> (orange) to a header block. Where control re-merges,
        <b> SSA form</b> adds a <b>φ-node</b> to pick the right incoming
        value. This graph is the substrate for nearly every compiler
        optimization — reachability, dominance, liveness, and loop analysis
        all read the CFG.
      </div>
    </div>
  );
}

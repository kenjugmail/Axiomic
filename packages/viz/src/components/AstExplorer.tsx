import { useState } from "react";

// From source text to syntax tree — the compiler/interpreter front end.
// A LEXER (scanner) turns characters into TOKENS (numbers, identifiers,
// operators, punctuation); a PARSER then builds an ABSTRACT SYNTAX TREE
// whose shape encodes precedence and associativity. Here "2 + 3 * 4"
// parses so that the multiplication sits BELOW the addition — the tree
// captures "× binds tighter than +" structurally, which is exactly what a
// later evaluation or code-gen pass walks.

const W = 460;
const H = 300;

interface Tok { t: string; k: "num" | "op" | "id" | "paren" | "assign"; }
interface Node { id: number; label: string; x: number; y: number; }
interface Ex { src: string; tokens: Tok[]; nodes: Node[]; edges: [number, number][]; }

const EXAMPLES: Record<string, Ex> = {
  "2 + 3 * 4": {
    src: "2 + 3 * 4",
    tokens: [{ t: "2", k: "num" }, { t: "+", k: "op" }, { t: "3", k: "num" }, { t: "*", k: "op" }, { t: "4", k: "num" }],
    nodes: [{ id: 0, label: "+", x: 230, y: 110 }, { id: 1, label: "2", x: 160, y: 180 }, { id: 2, label: "*", x: 300, y: 180 }, { id: 3, label: "3", x: 260, y: 250 }, { id: 4, label: "4", x: 340, y: 250 }],
    edges: [[0, 1], [0, 2], [2, 3], [2, 4]],
  },
  "(a + b) * c": {
    src: "(a + b) * c",
    tokens: [{ t: "(", k: "paren" }, { t: "a", k: "id" }, { t: "+", k: "op" }, { t: "b", k: "id" }, { t: ")", k: "paren" }, { t: "*", k: "op" }, { t: "c", k: "id" }],
    nodes: [{ id: 0, label: "*", x: 230, y: 110 }, { id: 1, label: "+", x: 165, y: 180 }, { id: 2, label: "c", x: 310, y: 180 }, { id: 3, label: "a", x: 120, y: 250 }, { id: 4, label: "b", x: 210, y: 250 }],
    edges: [[0, 1], [0, 2], [1, 3], [1, 4]],
  },
  "x = 5": {
    src: "x = 5",
    tokens: [{ t: "x", k: "id" }, { t: "=", k: "assign" }, { t: "5", k: "num" }],
    nodes: [{ id: 0, label: "=", x: 230, y: 120 }, { id: 1, label: "x", x: 170, y: 200 }, { id: 2, label: "5", x: 290, y: 200 }],
    edges: [[0, 1], [0, 2]],
  },
};
const ORDER = ["2 + 3 * 4", "(a + b) * c", "x = 5"];
const TCOLOR: Record<Tok["k"], string> = { num: "#38bdf8", op: "#fbbf24", id: "#4ade80", paren: "#94a3b8", assign: "#a78bfa" };

interface Props {
  expr?: string;
}

export function AstExplorer({ expr: ctl }: Props = {}) {
  const [intExpr, setIntExpr] = useState("2 + 3 * 4");
  const key = ctl ?? intExpr;
  const ex = EXAMPLES[key];
  const byId = (id: number) => ex.nodes.find((n) => n.id === id)!;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">source → tokens → AST</div>
        <div className="flex gap-1">
          {ORDER.map((e) => (
            <button key={e} onClick={() => setIntExpr(e)} disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${key === e ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{e}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Lexing and parsing into an abstract syntax tree">
        {/* source */}
        <text x={20} y={24} fill="#9aa3b8" fontSize="8.5">source</text>
        <text x={70} y={24} fill="#e5e9f5" fontSize="12" fontFamily="monospace">{ex.src}</text>

        {/* tokens */}
        <text x={20} y={50} fill="#9aa3b8" fontSize="8.5">tokens</text>
        {ex.tokens.map((tok, i) => {
          const x = 70 + i * 52;
          return (
            <g key={i}>
              <rect x={x} y={40} width={44} height={18} rx={3} fill="#0e1a3a" stroke={TCOLOR[tok.k]} strokeWidth={1} />
              <text x={x + 22} y={53} fill={TCOLOR[tok.k]} fontSize="9" textAnchor="middle" fontFamily="monospace">{tok.t}</text>
            </g>
          );
        })}

        {/* AST */}
        <text x={20} y={84} fill="#9aa3b8" fontSize="8.5">AST</text>
        {ex.edges.map(([a, b], i) => {
          const from = byId(a), to = byId(b);
          return <line key={i} x1={from.x} y1={from.y + 14} x2={to.x} y2={to.y - 14} stroke="#334155" strokeWidth={1} />;
        })}
        {ex.nodes.map((n) => {
          const isLeaf = !ex.edges.some(([a]) => a === n.id);
          return (
            <g key={n.id}>
              <circle cx={n.x} cy={n.y} r={15} fill={isLeaf ? "#0e1a3a" : "#1e2a52"} stroke={isLeaf ? "#4ade80" : "#fbbf24"} strokeWidth={1.5} />
              <text x={n.x} y={n.y + 4} fill="#e5e9f5" fontSize="11" textAnchor="middle" fontFamily="monospace">{n.label}</text>
            </g>
          );
        })}
      </svg>

      <div className="mt-1 text-[10px] text-muted-foreground">
        The <b>lexer</b> scans characters into <b>tokens</b> (a number, an
        operator, an identifier), discarding whitespace. The <b>parser</b>
        then assembles an <b>abstract syntax tree</b> whose structure encodes
        the grammar's <b>precedence</b>: in <span className="font-mono">2 + 3 * 4</span>
        the <span className="font-mono">*</span> node sits beneath the
        <span className="font-mono"> +</span>, so it evaluates first — no
        parentheses needed. Explicit parens reshape the tree (<span className="font-mono">(a + b) * c</span>).
        Every compiler and interpreter (and your IDE's syntax tooling) walks
        this tree for type-checking, optimization, and code generation.
      </div>
    </div>
  );
}

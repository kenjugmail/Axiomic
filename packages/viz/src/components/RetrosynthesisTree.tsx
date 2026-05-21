import { useMemo, useState } from "react";

// Retrosynthesis tree: a target molecule → strategic disconnections →
// precursors. We render a 2-3 level tree with the target at the top and
// progressively simpler precursors below. Click nodes to "explore" that
// branch (highlight). The "disconnection type" label on each arrow
// (C-C bond, C-N bond, FGI, etc.) shows the strategic choice.

const W = 460;
const H = 320;

interface Props {
  targetMolecule?: string;
  depth?: number;
}

interface Node {
  label: string;
  formula?: string;
  type?: string; // disconnection type leading to this node
  children?: Node[];
}

const TREES: Record<string, Node> = {
  ibuprofen: {
    label: "ibuprofen",
    formula: "C₁₃H₁₈O₂",
    children: [
      {
        label: "α-acid",
        formula: "Ar-CH(Me)-CO₂H",
        type: "FGI (CN → CO₂H)",
        children: [
          { label: "α-nitrile", formula: "Ar-CH(Me)-CN", type: "α-alkylation" },
          { label: "isobutylbenzene", formula: "iBuC₆H₅", type: "Friedel-Crafts" },
        ],
      },
      {
        label: "Heck-style", formula: "ArCH=CMe·CO₂R", type: "C=C disconnection",
        children: [
          { label: "ArBr + acrylate", formula: "Ar-Br + CH₂=C(Me)CO₂R", type: "Pd-catalyzed" },
        ],
      },
    ],
  },
  paracetamol: {
    label: "paracetamol",
    formula: "C₈H₉NO₂",
    children: [
      {
        label: "p-aminophenol",
        formula: "4-NH₂-C₆H₄-OH",
        type: "amide (C-N) disconnect",
        children: [
          { label: "nitrophenol", formula: "4-NO₂-C₆H₄-OH", type: "reduction" },
          { label: "phenol", formula: "C₆H₅OH", type: "EAS nitration" },
        ],
      },
      {
        label: "acetic anhydride", formula: "(MeCO)₂O", type: "acylating agent",
      },
    ],
  },
  aspirin: {
    label: "aspirin",
    formula: "C₉H₈O₄",
    children: [
      {
        label: "salicylic acid",
        formula: "2-OH-C₆H₄-CO₂H",
        type: "ester (Ac-O) disconnect",
        children: [
          { label: "phenol + CO₂", formula: "C₆H₅OH + CO₂", type: "Kolbe-Schmitt carboxylation" },
        ],
      },
      { label: "acetic anhydride", formula: "(MeCO)₂O", type: "acylating agent" },
    ],
  },
};

interface Layout {
  node: Node;
  x: number;
  y: number;
  parent?: Layout;
}

function layoutTree(root: Node, depth: number): Layout[] {
  const layouts: Layout[] = [];
  const place = (node: Node, x: number, y: number, parent?: Layout) => {
    const layout: Layout = { node, x, y, parent };
    layouts.push(layout);
    if (node.children && depth > 0) {
      const childCount = node.children.length;
      const spread = 200 * Math.pow(0.75, layouts.filter((l) => l.parent === parent).length);
      const start = x - spread * (childCount - 1) / 2;
      node.children.forEach((c, i) => {
        const cx = childCount === 1 ? x : start + i * spread;
        const cy = y + 90;
        place(c, cx, cy, layout);
      });
    }
  };
  place(root, W / 2, 30);
  return layouts;
}

export function RetrosynthesisTree({ targetMolecule: ctlTarget, depth: ctlDepth }: Props = {}) {
  const [intTarget, setIntTarget] = useState<keyof typeof TREES>("ibuprofen");
  const [intDepth, setIntDepth] = useState(3);
  const [selected, setSelected] = useState<number | null>(null);
  const target = (ctlTarget as keyof typeof TREES) ?? intTarget;
  const depth = ctlDepth ?? intDepth;

  const root = TREES[target] ?? TREES.ibuprofen;
  const layout = useMemo(() => layoutTree(root, depth - 1), [root, depth]);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Retrosynthesis · target: {root.label}</div>
        <div className="flex gap-1">
          {Object.keys(TREES).map((t) => (
            <button key={t} onClick={() => setIntTarget(t as keyof typeof TREES)} disabled={ctlTarget !== undefined} className={`px-2 py-0.5 rounded text-[10px] ${target === t ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{t}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Retrosynthesis tree">
        {/* Edges */}
        {layout.map((l, i) => l.parent && (
          <g key={`e-${i}`}>
            <line x1={l.parent.x} y1={l.parent.y + 18} x2={l.x} y2={l.y - 18} stroke="#475569" strokeWidth={1.5} markerEnd="url(#retroArrow)" opacity={selected === null || selected === i ? 0.9 : 0.3} />
            {l.node.type && (
              <text x={(l.parent.x + l.x) / 2 + 4} y={(l.parent.y + l.y) / 2} fill="#fbbf24" fontSize="8" opacity={selected === null || selected === i ? 0.9 : 0.3}>{l.node.type}</text>
            )}
          </g>
        ))}
        <defs>
          <marker id="retroArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" />
          </marker>
        </defs>
        {/* Nodes */}
        {layout.map((l, i) => (
          <g key={`n-${i}`} onClick={() => setSelected(i === selected ? null : i)} style={{ cursor: "pointer" }}>
            <rect x={l.x - 60} y={l.y - 18} width={120} height={36} rx={6} fill={selected === i ? "#4ecdc4" : "#1f2937"} stroke="#4ecdc4" strokeWidth={1.2} opacity={selected === null || selected === i ? 1 : 0.4} />
            <text x={l.x} y={l.y - 3} fill="#fff" fontSize="10" textAnchor="middle" fontWeight="bold">{l.node.label}</text>
            {l.node.formula && <text x={l.x} y={l.y + 10} fill="#cbd1e6" fontSize="8" textAnchor="middle">{l.node.formula}</text>}
          </g>
        ))}
      </svg>
      {selected !== null && layout[selected] && (
        <div className="mt-2 p-2 rounded bg-muted text-xs">
          <div className="font-semibold">{layout[selected].node.label}</div>
          {layout[selected].node.formula && <div className="text-[10px] text-muted-foreground">{layout[selected].node.formula}</div>}
          {layout[selected].node.type && <div className="text-[10px] mt-1">via: <span className="text-[#fbbf24]">{layout[selected].node.type}</span></div>}
        </div>
      )}
      <div className="mt-2 text-[10px] text-muted-foreground">
        Retrosynthetic analysis (Corey 1969 Nobel 1990): work backwards
        from the target via strategic bond disconnections to commercially
        available starting materials. Each arrow ⇒ marks one
        disconnection (C-C, C-N, C-O, FGI = functional-group
        interconversion). Click a node to highlight its branch. Modern
        retrosynthesis is AI-assisted (Chematica/Synthia, IBM RXN,
        ASKCOS Coley/Jensen MIT, Baran lab Synthia-trained models). The
        full tree for a drug like taxol has hundreds of disconnections;
        the art is choosing the strategic-bond + protecting-group plan
        with the highest yield × lowest cost.
      </div>
    </div>
  );
}

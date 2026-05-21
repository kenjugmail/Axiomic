import { useMemo, useState } from "react";

// Barabási-Albert preferential-attachment network growth. Start with a
// small clique; at each step, add one node + m edges connecting to
// existing nodes with probability ∝ degree. The result is a scale-free
// network with power-law degree distribution P(k) ~ k^(-3). Drag m
// (edges per new node) + steps; see graph + degree histogram.

const W = 460;
const H = 320;

interface Props {
  m?: number;       // edges added per new node
  steps?: number;   // number of growth steps
}

interface Graph {
  nodes: Array<{ id: number; x: number; y: number; degree: number }>;
  edges: Array<{ a: number; b: number }>;
}

function buildBA(m: number, steps: number): Graph {
  // Seed: complete graph on m+1 nodes
  const nodes: Array<{ id: number; x: number; y: number; degree: number }> = [];
  const edges: Array<{ a: number; b: number }> = [];
  const seed = m + 1;
  for (let i = 0; i < seed; i++) {
    nodes.push({ id: i, x: 0, y: 0, degree: 0 });
  }
  for (let i = 0; i < seed; i++) {
    for (let j = i + 1; j < seed; j++) {
      edges.push({ a: i, b: j });
      nodes[i].degree++;
      nodes[j].degree++;
    }
  }
  // Add steps new nodes
  let rng = 1234567;
  const rand = () => {
    rng = (rng * 9301 + 49297) % 233280;
    return rng / 233280;
  };
  for (let s = 0; s < steps; s++) {
    const newId = nodes.length;
    nodes.push({ id: newId, x: 0, y: 0, degree: 0 });
    const totalDegree = edges.length * 2;
    const chosen = new Set<number>();
    while (chosen.size < m) {
      let r = rand() * totalDegree;
      for (const n of nodes) {
        if (n.id === newId) continue;
        r -= n.degree;
        if (r <= 0) {
          if (!chosen.has(n.id)) {
            chosen.add(n.id);
            edges.push({ a: newId, b: n.id });
            nodes[newId].degree++;
            n.degree++;
          }
          break;
        }
      }
    }
  }
  // Layout: simple radial by degree (hubs near center)
  const maxD = Math.max(1, ...nodes.map((n) => n.degree));
  nodes.forEach((n, i) => {
    const angle = (i / nodes.length) * 2 * Math.PI;
    const r = 90 + (1 - n.degree / maxD) * 50;
    n.x = 230 + r * Math.cos(angle);
    n.y = 130 + r * Math.sin(angle);
  });
  // Apply 1 iteration of force relaxation
  for (let k = 0; k < 3; k++) {
    for (const e of edges) {
      const a = nodes[e.a];
      const b = nodes[e.b];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const target = 25;
      if (d > 1) {
        const force = (d - target) * 0.05;
        a.x += force * dx / d;
        a.y += force * dy / d;
        b.x -= force * dx / d;
        b.y -= force * dy / d;
      }
    }
  }
  return { nodes, edges };
}

export function PreferentialAttachment({ m: ctlM, steps: ctlS }: Props = {}) {
  const [intM, setIntM] = useState(3);
  const [intS, setIntS] = useState(40);
  const m = ctlM ?? intM;
  const steps = ctlS ?? intS;

  const graph = useMemo(() => buildBA(m, steps), [m, steps]);

  // Degree distribution histogram
  const hist = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const n of graph.nodes) counts[n.degree] = (counts[n.degree] || 0) + 1;
    return Object.entries(counts).map(([k, v]) => ({ k: parseInt(k), count: v })).sort((a, b) => a.k - b.k);
  }, [graph]);

  const maxDeg = Math.max(...graph.nodes.map((n) => n.degree));

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Barabási-Albert · N = {graph.nodes.length} · max degree = {maxDeg}</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Preferential attachment network">
        {/* Network panel left */}
        <text x={20} y={16} fill="#cbd1e6" fontSize="10">network</text>
        {graph.edges.map((e, i) => (
          <line key={`e-${i}`} x1={graph.nodes[e.a].x} y1={graph.nodes[e.a].y} x2={graph.nodes[e.b].x} y2={graph.nodes[e.b].y} stroke="#475569" strokeWidth={0.4} opacity={0.6} />
        ))}
        {graph.nodes.map((n) => {
          const r = 2 + (n.degree / maxDeg) * 7;
          const hub = n.degree > maxDeg * 0.4;
          return <circle key={n.id} cx={n.x} cy={n.y} r={r} fill={hub ? "#ff6b6b" : "#4ecdc4"} stroke="#0b1228" strokeWidth={0.3} />;
        })}
        {/* Degree-distribution histogram */}
        <g transform={`translate(${W - 130}, 30)`}>
          <text x={0} y={-8} fill="#cbd1e6" fontSize="9">degree dist</text>
          <line x1={0} y1={0} x2={0} y2={140} stroke="#475569" strokeWidth={0.5} />
          <line x1={0} y1={140} x2={120} y2={140} stroke="#475569" strokeWidth={0.5} />
          <text x={-2} y={140} fill="#9aa3b8" fontSize="7" textAnchor="end">0</text>
          {hist.map((h, i) => {
            const x = (h.k / Math.max(maxDeg, 1)) * 110;
            const hH = (h.count / Math.max(...hist.map((hh) => hh.count))) * 130;
            return <rect key={i} x={x} y={140 - hH} width={3} height={hH} fill="#fbbf24" opacity={0.85} />;
          })}
          <text x={60} y={155} fill="#9aa3b8" fontSize="8" textAnchor="middle">degree k</text>
          <text x={-8} y={70} fill="#9aa3b8" fontSize="8" textAnchor="middle" transform="rotate(-90, -8, 70)">P(k)</text>
        </g>
      </svg>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <label className="block">m (edges per new node): {m}
          <input type="range" min={1} max={6} step={1} value={m} onChange={(e) => setIntM(parseInt(e.target.value))} disabled={ctlM !== undefined} className="w-full mt-0.5" aria-label="m parameter" />
        </label>
        <label className="block">Steps: {steps}
          <input type="range" min={10} max={120} step={5} value={steps} onChange={(e) => setIntS(parseInt(e.target.value))} disabled={ctlS !== undefined} className="w-full mt-0.5" aria-label="Growth steps" />
        </label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Barabási-Albert preferential attachment (1999): at each step a
        new node connects with m edges to existing nodes with
        probability proportional to their degree ("rich-get-richer").
        Result is a scale-free network with P(k) ~ k^(-γ), γ = 3 in
        the BA model. Hubs (red) emerge as nodes that arrived early
        and accumulated many connections. Real scale-free networks:
        WWW, citation, sex contact, airline, protein interaction,
        gene-regulatory, ecological food webs. Heavy tail → robustness
        to random failure but fragility to targeted hub attacks
        (Albert-Jeong-Barabási 2000).
      </div>
    </div>
  );
}

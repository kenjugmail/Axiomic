import { useState } from "react";

// Shortest paths on a weighted graph. Dijkstra's algorithm (Edsger
// Dijkstra, 1959) greedily settles the nearest unvisited node and relaxes
// its edges, finding minimum-WEIGHT paths from a source. Breadth-first
// search instead finds minimum-HOP paths — correct only when every edge
// costs the same. Toggling between them on the same graph shows why edge
// weights matter: BFS reaches F in 3 hops, but Dijkstra's cheapest route
// (A→B→C→E→F) costs 10 and takes more hops. Both build a shortest-path tree
// rooted at the source.

const W = 460;
const H = 300;

interface GNode { id: string; x: number; y: number; }
const NODES: GNode[] = [
  { id: "A", x: 50, y: 90 }, { id: "B", x: 170, y: 50 }, { id: "C", x: 170, y: 170 },
  { id: "D", x: 300, y: 70 }, { id: "E", x: 300, y: 190 }, { id: "F", x: 420, y: 120 },
];
const EDGES: Array<[string, string, number]> = [
  ["A", "B", 2], ["A", "C", 5], ["B", "C", 1], ["B", "D", 7],
  ["C", "E", 3], ["D", "E", 2], ["D", "F", 3], ["E", "F", 4],
];

// Precomputed results from source A.
type Result = { dist: Record<string, number>; parent: Record<string, string> };
const DIJKSTRA: Result = {
  dist: { A: 0, B: 2, C: 3, E: 6, D: 8, F: 10 },
  parent: { B: "A", C: "B", E: "C", D: "E", F: "E" },
};
const BFS: Result = {
  dist: { A: 0, B: 1, C: 1, D: 2, E: 2, F: 3 },
  parent: { B: "A", C: "A", D: "B", E: "C", F: "D" },
};

type Algo = "Dijkstra" | "BFS";
const ORDER: Algo[] = ["Dijkstra", "BFS"];
const pos = (id: string) => NODES.find((n) => n.id === id)!;

interface Props { algo?: Algo; }

export function ShortestPath({ algo: ctl }: Props = {}) {
  const [intAlgo, setIntAlgo] = useState<Algo>("Dijkstra");
  const algo = ctl ?? intAlgo;
  const r = algo === "Dijkstra" ? DIJKSTRA : BFS;
  const treeEdges = new Set(Object.entries(r.parent).map(([c, p]) => [p, c].sort().join("-")));
  const edgeKey = (a: string, b: string) => [a, b].sort().join("-");

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">{algo} from A · F = {r.dist.F}{algo === "BFS" ? " hops" : " (weight)"}</div>
        <div className="flex gap-1">
          {ORDER.map((a) => (
            <button key={a} onClick={() => setIntAlgo(a)} disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${algo === a ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{a === "BFS" ? "BFS (hops)" : "Dijkstra"}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Shortest-path tree on a weighted graph">
        {/* edges */}
        {EDGES.map(([a, b, w]) => {
          const pa = pos(a), pb = pos(b);
          const inTree = treeEdges.has(edgeKey(a, b));
          return (
            <g key={`${a}${b}`}>
              <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={inTree ? "#4ade80" : "#334155"} strokeWidth={inTree ? 2.6 : 1.2} />
              <text x={(pa.x + pb.x) / 2} y={(pa.y + pb.y) / 2 - 3} fill={algo === "BFS" ? "#475569" : "#9aa3b8"} fontSize="8" textAnchor="middle">{algo === "BFS" ? "1" : w}</text>
            </g>
          );
        })}
        {/* nodes */}
        {NODES.map((n) => (
          <g key={n.id}>
            <circle cx={n.x} cy={n.y} r={16} fill={n.id === "A" ? "#1e2a52" : "#0e1a3a"} stroke={n.id === "A" ? "#38bdf8" : "#4ade80"} strokeWidth={1.6} />
            <text x={n.x} y={n.y - 1} fill="#e5e9f5" fontSize="10" textAnchor="middle" fontWeight="bold">{n.id}</text>
            <text x={n.x} y={n.y + 9} fill="#4ade80" fontSize="7.5" textAnchor="middle">{r.dist[n.id]}</text>
          </g>
        ))}
        <text x={50} y={H - 40} fill="#38bdf8" fontSize="8">A = source (distance 0)</text>
        <text x={50} y={H - 26} fill="#4ade80" fontSize="8">green edges = shortest-path tree · number in node = distance from A</text>
        <text x={50} y={H - 12} fill="#9aa3b8" fontSize="8">edge labels = {algo === "BFS" ? "all 1 (BFS ignores weights)" : "edge weights"}</text>
      </svg>

      <div className="mt-1 text-[10px] text-muted-foreground">
        <b>Dijkstra</b> settles nodes in increasing distance and <b>relaxes</b>
        each edge (if going through u beats the current best to v, update v),
        yielding minimum-<b>weight</b> paths — its cheapest route to F is
        A→B→C→E→F (weight 10). <b>BFS</b> explores layer by layer, so it finds
        minimum-<b>hop</b> paths (F in 3) but is blind to weight — only valid
        when edges are uniform. Switch algorithms to watch the shortest-path
        tree and the per-node distances change.
      </div>
    </div>
  );
}

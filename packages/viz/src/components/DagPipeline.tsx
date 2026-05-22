import { useState } from "react";

// A task DAG (directed acyclic graph), the execution model of workflow
// orchestrators like Apache Airflow and the stage scheduler inside Apache
// Spark. Each task runs only after ALL of its upstream dependencies
// succeed, so execution proceeds in dependency-respecting "waves" — tasks
// at the same depth run in parallel. Stepping the scheduler advances one
// wave: pending → running → success. This topological ordering is what lets
// a scheduler maximize parallelism while never violating a dependency.

const W = 480;
const H = 250;

interface Node {
  id: string;
  label: string;
  x: number;
  y: number;
  depth: number;
  deps: string[];
}
interface Dag {
  nodes: Node[];
}

const DAGS: Record<string, Dag> = {
  "Daily ETL": {
    nodes: [
      { id: "eo", label: "extract orders", x: 30, y: 40, depth: 0, deps: [] },
      { id: "eu", label: "extract users", x: 30, y: 150, depth: 0, deps: [] },
      { id: "cl", label: "clean", x: 150, y: 95, depth: 1, deps: ["eo", "eu"] },
      { id: "jn", label: "join", x: 260, y: 45, depth: 2, deps: ["cl"] },
      { id: "ag", label: "aggregate", x: 260, y: 150, depth: 2, deps: ["cl"] },
      { id: "ld", label: "load DW", x: 370, y: 95, depth: 3, deps: ["jn", "ag"] },
    ],
  },
  "ML Pipeline": {
    nodes: [
      { id: "in", label: "ingest", x: 24, y: 95, depth: 0, deps: [] },
      { id: "ft", label: "featurize", x: 130, y: 95, depth: 1, deps: ["in"] },
      { id: "sp", label: "split", x: 232, y: 95, depth: 2, deps: ["ft"] },
      { id: "tr", label: "train", x: 330, y: 45, depth: 3, deps: ["sp"] },
      { id: "bl", label: "baseline", x: 330, y: 150, depth: 3, deps: ["sp"] },
      { id: "dp", label: "deploy", x: 426, y: 95, depth: 4, deps: ["tr", "bl"] },
    ],
  },
};
const ORDER = ["Daily ETL", "ML Pipeline"];

type State = "pending" | "running" | "success";
const COLOR: Record<State, { fill: string; stroke: string; txt: string }> = {
  pending: { fill: "#111a33", stroke: "#334155", txt: "#64748b" },
  running: { fill: "#1e2a52", stroke: "#fbbf24", txt: "#fbbf24" },
  success: { fill: "#14321f", stroke: "#4ade80", txt: "#4ade80" },
};

interface Props {
  dag?: string;
}

export function DagPipeline({ dag: ctl }: Props = {}) {
  const [intDag, setIntDag] = useState("Daily ETL");
  const [tick, setTick] = useState(0);
  const sel = ctl ?? intDag;
  const { nodes } = DAGS[sel];
  const maxDepth = Math.max(...nodes.map((n) => n.depth));

  const stateOf = (n: Node): State =>
    n.depth < tick ? "success" : n.depth === tick ? "running" : "pending";
  const byId = (id: string) => nodes.find((n) => n.id === id)!;
  const done = tick > maxDepth;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">
          {sel} · {done ? "all tasks succeeded ✓" : `wave ${tick} running`}
        </div>
        <div className="flex gap-1">
          {ORDER.map((k) => (
            <button
              key={k}
              onClick={() => {
                setIntDag(k);
                setTick(0);
              }}
              disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${
                sel === k ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Task DAG scheduler">
        {/* edges */}
        {nodes.flatMap((n) =>
          n.deps.map((d) => {
            const from = byId(d);
            const active = stateOf(from) === "success";
            return (
              <line
                key={`${d}-${n.id}`}
                x1={from.x + 84}
                y1={from.y + 16}
                x2={n.x}
                y2={n.y + 16}
                stroke={active ? "#4ade80" : "#334155"}
                strokeWidth={active ? 1.4 : 0.8}
                markerEnd={active ? "url(#dagA)" : "url(#dagG)"}
              />
            );
          }),
        )}
        {/* nodes */}
        {nodes.map((n) => {
          const st = stateOf(n);
          const c = COLOR[st];
          return (
            <g key={n.id}>
              <rect x={n.x} y={n.y} width={84} height={32} rx={5} fill={c.fill} stroke={c.stroke} strokeWidth={st === "pending" ? 0.8 : 1.6} />
              <text x={n.x + 42} y={n.y + 15} fill="#e5e9f5" fontSize="8.5" textAnchor="middle">{n.label}</text>
              <text x={n.x + 42} y={n.y + 26} fill={c.txt} fontSize="7" textAnchor="middle">{st}</text>
            </g>
          );
        })}
        <defs>
          <marker id="dagA" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#4ade80" /></marker>
          <marker id="dagG" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#334155" /></marker>
        </defs>
      </svg>

      <div className="mt-2 flex gap-2">
        <button
          onClick={() => setTick((t) => Math.min(t + 1, maxDepth + 1))}
          className="px-2 py-1 rounded text-[10px] bg-muted hover:bg-accent"
        >
          Step ▶
        </button>
        <button onClick={() => setTick(0)} className="px-2 py-1 rounded text-[10px] bg-muted hover:bg-accent">
          Reset
        </button>
      </div>

      <div className="mt-1 text-[10px] text-muted-foreground">
        A task fires only once <b>every upstream dependency has succeeded</b>,
        so the scheduler runs the DAG in waves — tasks at the same depth (e.g.
        <b> join</b> and <b>aggregate</b>, or <b>train</b> and <b>baseline</b>)
        execute in parallel. This is exactly how <b>Apache Airflow</b> schedules
        operators and how <b>Apache Spark</b> orders stages across a shuffle
        boundary. Because the graph is acyclic, a topological sort always
        exists — a cycle would deadlock the scheduler.
      </div>
    </div>
  );
}

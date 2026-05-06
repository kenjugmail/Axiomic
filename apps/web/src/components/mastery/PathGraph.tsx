import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MasteryNode } from "@axiomic/types";

const LEVEL_ORDER = ["apprentice", "practitioner", "specialist", "expert", "researcher"];
const LEVEL_LABELS: Record<string, string> = {
  apprentice: "Apprentice",
  practitioner: "Practitioner",
  specialist: "Specialist",
  expert: "Expert",
  researcher: "Researcher",
};

const ACCENT_BORDER: Record<string, string> = {
  apprentice: "border-emerald-500/40",
  practitioner: "border-blue-500/40",
  specialist: "border-violet-500/40",
  expert: "border-amber-500/40",
  researcher: "border-rose-500/40",
};

interface Props {
  nodes: MasteryNode[];
  nodeMastery: Record<string, number>;
  signedIn: boolean;
  // Called when the user clicks a node card.
  onPick: (node: MasteryNode) => void;
}

interface Edge {
  fromId: string;
  toId: string;
}

// DAG view of the path: one column per level, nodes ordered within
// each column. Prerequisite edges drawn behind the cards via an SVG
// overlay that measures real card positions on layout.
export function PathGraph({ nodes, nodeMastery, signedIn, onPick }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const [edges, setEdges] = useState<
    Array<{ fromId: string; toId: string; x1: number; y1: number; x2: number; y2: number }>
  >([]);

  // Group + order: column = level index, row = node.order ascending.
  const cols = LEVEL_ORDER.map((level) => ({
    level,
    nodes: nodes
      .filter((n) => n.level === level)
      .sort((a, b) => a.order - b.order),
  })).filter((c) => c.nodes.length > 0);

  // Edge list: every prereq → dependent pair. Skipped if either side
  // is missing (cross-path or stale).
  const edgeList: Edge[] = [];
  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const n of nodes) {
    for (const pre of n.prerequisiteNodeIds) {
      if (nodeIds.has(pre)) edgeList.push({ fromId: pre, toId: n.id });
    }
  }

  // Recompute SVG line coords whenever the layout changes (window
  // resize, font load, etc.) AND once after first paint.
  const recompute = () => {
    const container = containerRef.current;
    if (!container) return;
    const cb = container.getBoundingClientRect();
    const next: typeof edges = [];
    for (const e of edgeList) {
      const a = cardRefs.current.get(e.fromId);
      const b = cardRefs.current.get(e.toId);
      if (!a || !b) continue;
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      next.push({
        fromId: e.fromId,
        toId: e.toId,
        x1: ar.right - cb.left,
        y1: ar.top + ar.height / 2 - cb.top,
        x2: br.left - cb.left,
        y2: br.top + br.height / 2 - cb.top,
      });
    }
    setEdges(next);
  };

  useLayoutEffect(() => {
    recompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  useEffect(() => {
    const onResize = () => recompute();
    window.addEventListener("resize", onResize);
    // Recompute again next tick — fonts often settle after first paint.
    const t = setTimeout(onResize, 80);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  return (
    <div ref={containerRef} className="relative overflow-x-auto">
      {/* SVG behind the cards drawing the prereq edges. Pointer
          events disabled so card clicks still go through. */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ minHeight: 1 }}
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path
              d="M 0 0 L 10 5 L 0 10 z"
              className="fill-muted-foreground/40"
            />
          </marker>
        </defs>
        {edges.map((e) => {
          // Cubic curve so edges arc rather than ziggy. Control
          // points sit at ~30% of the dx, vertically aligned with
          // the endpoints.
          const dx = Math.max(40, (e.x2 - e.x1) * 0.5);
          return (
            <path
              key={`${e.fromId}-${e.toId}`}
              d={`M ${e.x1} ${e.y1} C ${e.x1 + dx} ${e.y1}, ${e.x2 - dx} ${e.y2}, ${e.x2} ${e.y2}`}
              fill="none"
              strokeWidth="1.5"
              className="stroke-muted-foreground/30"
              markerEnd="url(#arrow)"
            />
          );
        })}
      </svg>

      <div
        className="grid gap-6 relative"
        style={{
          gridTemplateColumns: `repeat(${cols.length}, minmax(180px, 1fr))`,
        }}
      >
        {cols.map(({ level, nodes: levelNodes }) => (
          <div key={level} className="space-y-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground text-center">
              {LEVEL_LABELS[level]}
            </div>
            {levelNodes.map((n) => {
              const mastery = nodeMastery[n.id] ?? 0;
              const completed = mastery >= 100;
              return (
                <button
                  key={n.id}
                  ref={(el) => {
                    if (el) cardRefs.current.set(n.id, el);
                    else cardRefs.current.delete(n.id);
                  }}
                  onClick={() => onPick(n)}
                  className={`w-full text-left p-3 rounded-lg border-2 bg-card transition-all ${
                    completed
                      ? "border-emerald-500/60 bg-emerald-500/5"
                      : `${ACCENT_BORDER[n.level] ?? "border-border"} hover:scale-[1.02]`
                  }`}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <h4 className="font-medium text-xs leading-tight flex-1">
                      {n.title}
                    </h4>
                    {completed && <span className="text-xs">✓</span>}
                  </div>
                  {signedIn && (
                    <div className="mt-2">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            completed ? "bg-emerald-500" : "bg-primary"
                          }`}
                          style={{ width: `${mastery}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-0.5">
                        <span>{mastery}/100</span>
                        {n.estimatedMinutes && <span>~{n.estimatedMinutes}m</span>}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

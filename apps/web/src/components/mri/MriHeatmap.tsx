// Sprint 33 — Knowledge MRI heatmap.
//
// One row per mastery path. Cells are nodes, colored by status with
// overlays for active misconceptions and unresolved mistakes. Click a
// cell to open the drill panel.

import type { KnowledgeMriNode, KnowledgeMriPath } from "@axiomic/types";

interface Props {
  paths: KnowledgeMriPath[];
  selectedNodeId: string | null;
  onSelectNode: (node: KnowledgeMriNode, pathSlug: string) => void;
}

const STATUS_BG: Record<KnowledgeMriNode["status"], string> = {
  mastered: "bg-emerald-500/20 hover:bg-emerald-500/30",
  in_progress: "bg-amber-500/20 hover:bg-amber-500/30",
  untouched: "bg-muted hover:bg-muted/80",
};

const STATUS_BORDER: Record<KnowledgeMriNode["status"], string> = {
  mastered: "border-emerald-500/40",
  in_progress: "border-amber-500/40",
  untouched: "border-border",
};

const STATUS_TEXT: Record<KnowledgeMriNode["status"], string> = {
  mastered: "text-emerald-700 dark:text-emerald-300",
  in_progress: "text-amber-700 dark:text-amber-300",
  untouched: "text-muted-foreground",
};

function isStaleByDate(iso: string | null): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return Date.now() - t > 30 * 24 * 60 * 60 * 1000;
}

export function MriHeatmap({ paths, selectedNodeId, onSelectNode }: Props) {
  if (paths.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No mastery paths yet.</p>
    );
  }
  return (
    <div className="space-y-5">
      {paths.map((p) => (
        <section key={p.slug}>
          <header className="flex items-baseline justify-between mb-2">
            <h3 className="text-sm font-semibold tracking-tight">{p.title}</h3>
            <div className="text-[10px] text-muted-foreground tabular-nums">
              {p.summary.completedNodes}/{p.summary.totalNodes} mastered
              {p.summary.activeDiagnoses > 0 && (
                <>
                  {" · "}
                  <span className="text-rose-600 dark:text-rose-400">
                    {p.summary.activeDiagnoses} misconception
                    {p.summary.activeDiagnoses === 1 ? "" : "s"}
                  </span>
                </>
              )}
            </div>
          </header>
          <div className="overflow-x-auto -mx-1 px-1">
            <div className="flex gap-1.5 min-w-min pb-1">
              {p.nodes.map((n) => {
                const stale = isStaleByDate(n.lastTouchedAt);
                const isSelected = n.nodeId === selectedNodeId;
                return (
                  <button
                    key={n.nodeId}
                    type="button"
                    onClick={() => onSelectNode(n, p.slug)}
                    title={`${n.title} — ${n.status}${
                      n.activeDiagnoses > 0 ? ` · ${n.activeDiagnoses} misconception` : ""
                    }${
                      n.unresolvedMistakes > 0 ? ` · ${n.unresolvedMistakes} mistake${n.unresolvedMistakes === 1 ? "" : "s"}` : ""
                    }`}
                    className={`relative shrink-0 w-16 sm:w-20 h-12 rounded-md border ${STATUS_BG[n.status]} ${
                      isSelected
                        ? "border-primary ring-2 ring-primary/30"
                        : STATUS_BORDER[n.status]
                    } ${stale ? "opacity-60" : ""} text-left p-1.5 transition-colors`}
                  >
                    <div
                      className={`text-[9px] uppercase tracking-wider ${STATUS_TEXT[n.status]} truncate`}
                    >
                      {n.level}
                    </div>
                    <div className="text-[10px] font-medium truncate leading-tight">
                      {n.pageTitle ?? n.title}
                    </div>
                    {n.activeDiagnoses > 0 && (
                      <span
                        className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-rose-500"
                        aria-label={`${n.activeDiagnoses} active misconceptions`}
                      />
                    )}
                    {n.unresolvedMistakes > 0 && n.activeDiagnoses === 0 && (
                      <span
                        className="absolute bottom-0.5 left-1.5 right-1.5 h-0.5 bg-amber-500/70 rounded-full"
                        aria-label={`${n.unresolvedMistakes} unresolved mistakes`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

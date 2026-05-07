import { Link } from "react-router-dom";
import type { MasterySummaryResponse, MasteryLevel } from "@axiomic/types";

const LEVELS: MasteryLevel[] = [
  "apprentice",
  "practitioner",
  "specialist",
  "expert",
  "researcher",
];

const PATH_ACCENTS = [
  "bg-accent-indigo",
  "bg-accent-emerald",
  "bg-accent-rose",
  "bg-accent-amber",
  "bg-accent-sky",
  "bg-accent-violet",
];

// Compact horizontal "skill tree" — one row per path the user has any
// nodes in, five level cells per row. Each cell shows completed / total
// for that level on that path; cells with completion get an accent fill
// keyed off the path. A visual badge of pride that shows mastery
// breadth at a glance.
export function SkillTree({
  summary,
}: {
  summary: MasterySummaryResponse;
}) {
  if (summary.paths.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No mastery progress yet.</p>
    );
  }

  return (
    <div className="space-y-3">
      {summary.paths.map((path, i) => {
        const accent = PATH_ACCENTS[i % PATH_ACCENTS.length];
        const pct =
          path.totalNodes > 0
            ? Math.round((path.completedNodes / path.totalNodes) * 100)
            : 0;
        return (
          <Link
            key={path.pathSlug}
            to={`/paths/${path.pathSlug}`}
            className="block rounded-lg border border-border hover:bg-accent/30 transition-colors duration-fast p-3"
          >
            <div className="flex items-center justify-between mb-2 gap-2">
              <div className="min-w-0 flex items-center gap-2">
                <span className={`block w-1.5 h-4 rounded-sm ${accent}`} />
                <h3 className="text-sm font-medium truncate">
                  {path.pathTitle}
                </h3>
              </div>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {path.completedNodes} / {path.totalNodes} · {pct}%
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1">
              {LEVELS.map((level) => {
                const cell = path.levels?.[level];
                if (!cell || cell.total === 0) {
                  return (
                    <div
                      key={level}
                      className="rounded-sm bg-muted/40 px-1.5 py-1 text-[9px] uppercase tracking-wider text-muted-foreground/60 text-center"
                    >
                      —
                    </div>
                  );
                }
                const filled = cell.completed === cell.total;
                const partial = cell.completed > 0 && !filled;
                return (
                  <div
                    key={level}
                    className={`rounded-sm px-1.5 py-1 text-[9px] uppercase tracking-wider text-center ${
                      filled
                        ? `${accent} text-background`
                        : partial
                          ? "bg-primary/10 text-foreground"
                          : "bg-muted text-muted-foreground"
                    }`}
                    title={`${level}: ${cell.completed}/${cell.total}`}
                  >
                    <div className="font-mono tabular-nums text-[10px]">
                      {cell.completed}/{cell.total}
                    </div>
                    <div className="opacity-70">{level.slice(0, 3)}</div>
                  </div>
                );
              })}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

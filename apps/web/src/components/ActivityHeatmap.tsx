import type { ActivityHeatmapCell } from "@axiomic/types";

// GitHub-style activity heatmap. The server returns 84 cells (12 weeks)
// in chronological order; we render 12 columns × 7 rows where each
// column is a calendar week. The earliest day's column position is
// computed from its weekday so the rightmost column always ends on
// today.

interface Props {
  cells: ActivityHeatmapCell[];
  streak: number;
}

function intensity(count: number): string {
  if (count === 0) return "bg-muted";
  if (count <= 1) return "bg-emerald-300/40 dark:bg-emerald-700/40";
  if (count <= 3) return "bg-emerald-400/60 dark:bg-emerald-600/60";
  if (count <= 6) return "bg-emerald-500/80 dark:bg-emerald-500/80";
  return "bg-emerald-600 dark:bg-emerald-400";
}

export function ActivityHeatmap({ cells, streak }: Props) {
  if (cells.length === 0) return null;

  // Pack cells into 12 columns × 7 rows. The first cell's weekday
  // determines its row offset within the first column.
  const firstDay = new Date(cells[0].day + "T00:00:00Z");
  const firstWeekday = firstDay.getUTCDay(); // 0..6, Sun..Sat

  const columns: (ActivityHeatmapCell | null)[][] = [];
  let col: (ActivityHeatmapCell | null)[] = Array(firstWeekday).fill(null);

  for (const cell of cells) {
    col.push(cell);
    if (col.length === 7) {
      columns.push(col);
      col = [];
    }
  }
  if (col.length > 0) {
    while (col.length < 7) col.push(null);
    columns.push(col);
  }

  const totalActiveDays = cells.filter((c) => c.count > 0).length;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-medium">Activity</div>
          <div className="text-xs text-muted-foreground">
            {totalActiveDays} active day{totalActiveDays === 1 ? "" : "s"} in the last 12 weeks
          </div>
        </div>
        <div className="flex items-center gap-2">
          {streak > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-700 dark:text-orange-400">
              🔥 {streak}-day streak
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-flex gap-[3px]">
          {columns.map((week, ci) => (
            <div key={ci} className="flex flex-col gap-[3px]">
              {week.map((cell, ri) =>
                cell === null ? (
                  <div key={ri} className="w-3 h-3" />
                ) : (
                  <div
                    key={ri}
                    title={`${cell.day}: ${cell.count} event${cell.count === 1 ? "" : "s"}`}
                    className={`w-3 h-3 rounded-sm ${intensity(cell.count)}`}
                  />
                ),
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground">
        <span>Less</span>
        <div className="w-3 h-3 rounded-sm bg-muted" />
        <div className="w-3 h-3 rounded-sm bg-emerald-300/40 dark:bg-emerald-700/40" />
        <div className="w-3 h-3 rounded-sm bg-emerald-400/60 dark:bg-emerald-600/60" />
        <div className="w-3 h-3 rounded-sm bg-emerald-500/80" />
        <div className="w-3 h-3 rounded-sm bg-emerald-600 dark:bg-emerald-400" />
        <span>More</span>
      </div>
    </div>
  );
}

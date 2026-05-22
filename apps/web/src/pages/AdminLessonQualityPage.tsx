// Lesson quality dashboard. Reads /admin/lesson-quality (same rubric as
// `bun run audit:lessons`, scored server-side from the DB) and renders a
// sortable, searchable table of every lesson-kind node, worst-first.
// Each row deep-links into the lesson editor + viewer so an author can
// jump straight from a low score to fixing it.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ListChecks, RefreshCw } from "lucide-react";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";

interface LessonRow {
  nodeSlug: string;
  pathSlug: string;
  pathTitle: string;
  title: string;
  level: string;
  slideCount: number;
  textSlideCount: number;
  questionSubkindCount: number;
  totalBodyWords: number;
  nameDropCount: number;
  hasViz: boolean;
  composite: number;
  flags: string[];
  // Composite change since the last snapshot; null if the lesson wasn't
  // in that snapshot (or no snapshot has been captured yet).
  delta?: number | null;
}

interface QualityResponse {
  lessons: LessonRow[];
  summary: {
    total: number;
    scored: number;
    missing: number;
    avg: number;
    median: number;
    flaggedCount: number;
    lastSnapshotAt?: string | null;
  };
}

interface SnapshotPoint {
  runAt: string;
  count: number;
  avg: number;
}

type SortKey =
  | "composite"
  | "totalBodyWords"
  | "nameDropCount"
  | "textSlideCount"
  | "questionSubkindCount";

type PathSortKey = "avg" | "median" | "worst" | "count" | "flaggedPct" | "noVizPct";

interface PathRollup {
  pathSlug: string;
  pathTitle: string;
  count: number;
  avg: number;
  median: number;
  worst: number;
  flaggedPct: number;
  noVizPct: number;
}

function median(sortedAsc: number[]): number {
  return sortedAsc.length ? sortedAsc[Math.floor(sortedAsc.length / 2)] : 0;
}

function scoreClasses(c: number): string {
  if (c >= 80) return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
  if (c >= 60) return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  return "bg-rose-500/15 text-rose-600 dark:text-rose-400";
}

// Composite change since the last snapshot: ▲ green (improved), ▼ rose
// (regressed), "—" when there's no prior snapshot for this lesson.
function DeltaBadge({ delta }: { delta: number | null | undefined }) {
  if (delta == null) return <span className="text-muted-foreground">—</span>;
  if (delta === 0)
    return <span className="text-muted-foreground tabular-nums">0</span>;
  const up = delta > 0;
  return (
    <span
      className={`tabular-nums font-medium ${
        up
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-rose-600 dark:text-rose-400"
      }`}
    >
      {up ? "▲" : "▼"}
      {Math.abs(delta)}
    </span>
  );
}

// Corpus avg-composite trend across snapshot batches.
function Sparkline({ points }: { points: SnapshotPoint[] }) {
  if (points.length < 2) return null;
  const W = 160, H = 36, pad = 4;
  const avgs = points.map((p) => p.avg);
  const min = Math.min(...avgs), max = Math.max(...avgs);
  const span = Math.max(1, max - min);
  const x = (i: number) => pad + (i / (points.length - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - min) / span) * (H - 2 * pad);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.avg).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Average composite trend" className="text-primary">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} />
      <circle cx={x(points.length - 1)} cy={y(points[points.length - 1].avg)} r={2.5} fill="currentColor" />
    </svg>
  );
}

// Flags that mean "no content at all" get a louder treatment.
const SEVERE = new Set(["INVALID_JSON", "NO_LESSON_DATA"]);

function FlagChip({ flag }: { flag: string }) {
  const severe = SEVERE.has(flag);
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-mono ${
        severe
          ? "bg-rose-500/20 text-rose-700 dark:text-rose-300"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {flag}
    </span>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

export function AdminLessonQualityPage() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<QualityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("composite");
  const [sortAsc, setSortAsc] = useState(true);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"lesson" | "path">("lesson");
  const [pathSortKey, setPathSortKey] = useState<PathSortKey>("avg");
  const [pathSortAsc, setPathSortAsc] = useState(true);
  const [history, setHistory] = useState<SnapshotPoint[]>([]);

  const load = async () => {
    setError(null);
    try {
      const r = await fetch("/api/v1/admin/lesson-quality", {
        credentials: "include",
      });
      if (!r.ok) {
        if (r.status === 403) {
          setError("Admin access required.");
          return;
        }
        throw new Error(`Failed (${r.status})`);
      }
      setData((await r.json()) as QualityResponse);
      const hr = await fetch("/api/v1/admin/lesson-quality/history", {
        credentials: "include",
      });
      if (hr.ok) {
        const hj = (await hr.json()) as { snapshots?: SnapshotPoint[] };
        setHistory(hj.snapshots ?? []);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const filtered = q
      ? data.lessons.filter(
          (l) =>
            l.title.toLowerCase().includes(q) ||
            l.pathSlug.toLowerCase().includes(q) ||
            l.nodeSlug.toLowerCase().includes(q),
        )
      : data.lessons;
    return [...filtered].sort((a, b) =>
      sortAsc ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey],
    );
  }, [data, sortKey, sortAsc, query]);

  // Per-path rollup, computed client-side from the same rows. Surfaces
  // whole-path weakness (a path can have a fine average but a brutal
  // worst node). Default sort: avg ascending (weakest paths first).
  const pathRows = useMemo<PathRollup[]>(() => {
    if (!data) return [];
    const groups = new Map<string, LessonRow[]>();
    for (const l of data.lessons) {
      const arr = groups.get(l.pathSlug);
      if (arr) arr.push(l);
      else groups.set(l.pathSlug, [l]);
    }
    const out: PathRollup[] = [];
    for (const [pathSlug, ls] of groups) {
      const comps = ls.map((x) => x.composite).sort((a, b) => a - b);
      const sum = comps.reduce((s, x) => s + x, 0);
      const flagged = ls.filter((x) => x.flags.length > 0).length;
      const noViz = ls.filter((x) => !x.hasViz).length;
      out.push({
        pathSlug,
        pathTitle: ls[0].pathTitle,
        count: ls.length,
        avg: Math.round(sum / ls.length),
        median: median(comps),
        worst: comps[0],
        flaggedPct: Math.round((100 * flagged) / ls.length),
        noVizPct: Math.round((100 * noViz) / ls.length),
      });
    }
    return out.sort((a, b) =>
      pathSortAsc
        ? a[pathSortKey] - b[pathSortKey]
        : b[pathSortKey] - a[pathSortKey],
    );
  }, [data, pathSortKey, pathSortAsc]);

  // Biggest composite movers since the last snapshot — what improved or
  // regressed most. Computed from the per-lesson delta the endpoint returns.
  const movers = useMemo(() => {
    const withDelta = (data?.lessons ?? []).filter(
      (l) => l.delta != null && l.delta !== 0,
    ) as (LessonRow & { delta: number })[];
    const up = withDelta.filter((l) => l.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3);
    const down = withDelta.filter((l) => l.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3);
    return { up, down };
  }, [data]);

  if (user && user.role !== "admin") {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Admin access required.
        </div>
      </div>
    );
  }

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      // Default to ascending for score (worst-first), descending for the
      // "more is better" metrics.
      setSortAsc(key === "composite");
    }
  };

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortAsc ? " ▲" : " ▼") : "";

  const SortableTh = ({
    label,
    sortKeyName,
  }: {
    label: string;
    sortKeyName: SortKey;
  }) => (
    <th
      className="px-2 py-2 text-right font-medium cursor-pointer select-none hover:text-foreground"
      onClick={() => toggleSort(sortKeyName)}
    >
      {label}
      {arrow(sortKeyName)}
    </th>
  );

  const togglePathSort = (key: PathSortKey) => {
    if (key === pathSortKey) {
      setPathSortAsc((v) => !v);
    } else {
      setPathSortKey(key);
      // Ascending for the score-like keys (weakest first); descending
      // for "more is worse" percentages + count.
      setPathSortAsc(key === "avg" || key === "median" || key === "worst");
    }
  };

  const PathSortableTh = ({
    label,
    sortKeyName,
  }: {
    label: string;
    sortKeyName: PathSortKey;
  }) => (
    <th
      className="px-2 py-2 text-right font-medium cursor-pointer select-none hover:text-foreground"
      onClick={() => togglePathSort(sortKeyName)}
    >
      {label}
      {pathSortKey === sortKeyName ? (pathSortAsc ? " ▲" : " ▼") : ""}
    </th>
  );

  // Jump from a path row into the lesson view, filtered to that path.
  const drillIntoPath = (pathSlug: string) => {
    setQuery(pathSlug);
    setView("lesson");
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="flex items-baseline justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
            <ListChecks className="w-6 h-6 text-primary" strokeWidth={2} />
            Lesson quality
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every lesson scored on the same rubric as{" "}
            <code className="text-xs">bun run audit:lessons</code>. Sorted
            worst-first — click a column to re-sort.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </header>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive mb-4">
          {error}
        </div>
      )}

      {data === null && !error && <Skeleton className="h-64" />}

      {data && (
        <>
          <section className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 mb-6">
            <SummaryCard label="Avg composite" value={`${data.summary.avg} / 100`} />
            <SummaryCard label="Median" value={data.summary.median} />
            <SummaryCard label="Lessons scored" value={data.summary.scored} />
            <SummaryCard label="Flagged" value={data.summary.flaggedCount} />
            <SummaryCard label="Missing content" value={data.summary.missing} />
          </section>

          {(history.length >= 2 || movers.up.length > 0 || movers.down.length > 0) && (
            <section className="grid gap-3 sm:grid-cols-2 mb-6">
              <div className="rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground mb-1">
                  Avg composite trend · {history.length} snapshot{history.length === 1 ? "" : "s"}
                </div>
                {history.length >= 2 ? (
                  <div className="flex items-center gap-3">
                    <Sparkline points={history} />
                    <div className="text-sm tabular-nums">
                      {history[0].avg} →{" "}
                      <span className="font-semibold">{history[history.length - 1].avg}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    Capture 2+ snapshots (<code>bun run snapshot:quality</code>) to see a trend.
                  </div>
                )}
              </div>
              <div className="rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground mb-1">
                  Biggest movers since last snapshot
                </div>
                {movers.up.length === 0 && movers.down.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No changes recorded yet.</div>
                ) : (
                  <div className="flex flex-col gap-0.5 text-xs">
                    {movers.up.map((l) => (
                      <div key={`u-${l.pathSlug}/${l.nodeSlug}`} className="flex justify-between gap-2">
                        <span className="truncate">{l.title}</span>
                        <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">▲{l.delta}</span>
                      </div>
                    ))}
                    {movers.down.map((l) => (
                      <div key={`d-${l.pathSlug}/${l.nodeSlug}`} className="flex justify-between gap-2">
                        <span className="truncate">{l.title}</span>
                        <span className="text-rose-600 dark:text-rose-400 tabular-nums">▼{Math.abs(l.delta)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
              {(["lesson", "path"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 ${
                    view === v
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent/40"
                  }`}
                >
                  {v === "lesson" ? "By lesson" : "By path"}
                </button>
              ))}
            </div>
            {view === "lesson" && (
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by title, path, or node slug…"
                className="w-full sm:w-80 px-3 py-1.5 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            )}
            <span className="text-xs text-muted-foreground">
              {view === "lesson"
                ? `${rows.length} lessons`
                : `${pathRows.length} paths`}
            </span>
            {view === "lesson" && (
              <span className="text-xs text-muted-foreground">
                {data.summary.lastSnapshotAt
                  ? `Δ vs snapshot ${new Date(data.summary.lastSnapshotAt).toLocaleDateString()}`
                  : "no snapshot yet — run bun run snapshot:quality"}
              </span>
            )}
          </div>

          {view === "lesson" && (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-xs">
                <tr>
                  <SortableTh label="Score" sortKeyName="composite" />
                  <th className="px-2 py-2 text-right font-medium">Δ</th>
                  <th className="px-2 py-2 text-left font-medium">Lesson</th>
                  <SortableTh label="Words" sortKeyName="totalBodyWords" />
                  <SortableTh label="Names" sortKeyName="nameDropCount" />
                  <SortableTh label="Text" sortKeyName="textSlideCount" />
                  <SortableTh label="Q-kinds" sortKeyName="questionSubkindCount" />
                  <th className="px-2 py-2 text-center font-medium">Viz</th>
                  <th className="px-2 py-2 text-left font-medium">Flags</th>
                  <th className="px-2 py-2 text-right font-medium">Edit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr
                    key={`${l.pathSlug}/${l.nodeSlug}`}
                    className="border-t border-border hover:bg-accent/20"
                  >
                    <td className="px-2 py-2">
                      <span
                        className={`inline-block rounded px-2 py-0.5 font-semibold tabular-nums ${scoreClasses(
                          l.composite,
                        )}`}
                      >
                        {l.composite}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <DeltaBadge delta={l.delta} />
                    </td>
                    <td className="px-2 py-2">
                      <Link
                        to={`/paths/${l.pathSlug}/lessons/${l.nodeSlug}`}
                        className="font-medium hover:underline"
                      >
                        {l.title}
                      </Link>
                      <div className="text-[11px] text-muted-foreground">
                        {l.pathTitle} · {l.level}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {l.totalBodyWords}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {l.nameDropCount}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {l.textSlideCount}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {l.questionSubkindCount}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {l.hasViz ? (
                        <span className="text-emerald-500">✓</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        {l.flags.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          l.flags.map((f) => <FlagChip key={f} flag={f} />)
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Link
                        to={`/paths/${l.pathSlug}/lessons/${l.nodeSlug}/edit`}
                        className="text-xs text-primary hover:underline whitespace-nowrap"
                      >
                        Edit →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}

          {view === "path" && (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground text-xs">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium">Path</th>
                    <PathSortableTh label="Avg" sortKeyName="avg" />
                    <PathSortableTh label="Median" sortKeyName="median" />
                    <PathSortableTh label="Worst" sortKeyName="worst" />
                    <PathSortableTh label="Lessons" sortKeyName="count" />
                    <PathSortableTh label="% flagged" sortKeyName="flaggedPct" />
                    <PathSortableTh label="% no-viz" sortKeyName="noVizPct" />
                  </tr>
                </thead>
                <tbody>
                  {pathRows.map((p) => (
                    <tr
                      key={p.pathSlug}
                      onClick={() => drillIntoPath(p.pathSlug)}
                      className="border-t border-border hover:bg-accent/20 cursor-pointer"
                    >
                      <td className="px-2 py-2">
                        <span className="font-medium">{p.pathTitle}</span>
                        <div className="text-[11px] text-muted-foreground">
                          {p.pathSlug}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <span
                          className={`inline-block rounded px-2 py-0.5 font-semibold tabular-nums ${scoreClasses(
                            p.avg,
                          )}`}
                        >
                          {p.avg}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{p.median}</td>
                      <td className="px-2 py-2 text-right">
                        <span
                          className={`inline-block rounded px-2 py-0.5 font-semibold tabular-nums ${scoreClasses(
                            p.worst,
                          )}`}
                        >
                          {p.worst}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{p.count}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {p.flaggedPct}%
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {p.noVizPct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

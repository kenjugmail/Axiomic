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
  };
}

type SortKey =
  | "composite"
  | "totalBodyWords"
  | "nameDropCount"
  | "textSlideCount"
  | "questionSubkindCount";

function scoreClasses(c: number): string {
  if (c >= 80) return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
  if (c >= 60) return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  return "bg-rose-500/15 text-rose-600 dark:text-rose-400";
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

          <div className="mb-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by title, path, or node slug…"
              className="w-full sm:w-80 px-3 py-1.5 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="text-xs text-muted-foreground ml-3">
              {rows.length} shown
            </span>
          </div>

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-xs">
                <tr>
                  <SortableTh label="Score" sortKeyName="composite" />
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
        </>
      )}
    </div>
  );
}

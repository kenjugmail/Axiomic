// Phase 23B — instructor gradebook matrix. Single view of every
// enrolled student × every task, with status / score / late /
// auto-graded badges. Critical for any class > 5 people; closes
// the GC parity gap on this front.
//
// Data: one fetch via api.classes.gradebook(slug). The endpoint
// pre-fills missing cells server-side so this page is a thin
// renderer.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BookCheck, Download, Filter } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { Skeleton } from "../components/ui";
import { useAuthStore } from "../stores/auth";

type GradebookData = Awaited<ReturnType<typeof api.classes.gradebook>>;
type Cell = GradebookData["cells"][number];

export function ClassGradebookPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<GradebookData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missingOnly, setMissingOnly] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    api.classes
      .gradebook(slug)
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Failed to load",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const cellByPair = useMemo(() => {
    const m = new Map<string, Cell>();
    if (!data) return m;
    for (const c of data.cells) m.set(`${c.taskId}::${c.userId}`, c);
    return m;
  }, [data]);

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Sign in to view the gradebook.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Link
          to={`/classes/${slug}`}
          className="text-sm text-primary hover:underline"
        >
          ← Back to class
        </Link>
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const visibleStudents = missingOnly
    ? data.students.filter((s) =>
        data.tasks.some(
          (t) => cellByPair.get(`${t.id}::${s.userId}`)?.status === "missing",
        ),
      )
    : data.students;

  const csv = () => {
    const header = ["Student", ...data.tasks.map((t) => t.title)];
    const lines = [header.join(",")];
    for (const s of data.students) {
      const cells = data.tasks.map((t) => {
        const c = cellByPair.get(`${t.id}::${s.userId}`);
        if (!c || c.status === "missing") return "missing";
        if (c.score != null && c.maxScore != null) {
          return `${c.score}/${c.maxScore}${c.wasLate ? " (late)" : ""}`;
        }
        return c.status;
      });
      lines.push(
        [JSON.stringify(s.displayName ?? s.username), ...cells].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gradebook-${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <Link
        to={`/classes/${slug}`}
        className="text-sm text-primary hover:underline"
      >
        ← Back to class
      </Link>
      <header className="mt-3 mb-6 flex items-baseline justify-between gap-3 flex-wrap">
        <h1 className="font-display text-2xl font-semibold tracking-tight inline-flex items-center gap-2">
          <BookCheck className="w-6 h-6 text-primary" />
          Gradebook
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMissingOnly((v) => !v)}
            className={`text-xs px-3 py-1.5 rounded-md border inline-flex items-center gap-1.5 ${
              missingOnly
                ? "border-primary text-primary bg-primary/10"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            {missingOnly ? "Showing students with missing" : "All students"}
          </button>
          <button
            type="button"
            onClick={csv}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
        </div>
      </header>

      {data.tasks.length === 0 || data.students.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {data.tasks.length === 0
            ? "No tasks created yet."
            : "No students enrolled yet."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table
            data-testid="gradebook-table"
            className="w-full text-xs border-collapse"
          >
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr>
                <th className="text-left px-3 py-2 sticky left-0 bg-muted/80 backdrop-blur z-20 border-r border-border">
                  Student
                </th>
                {data.tasks.map((t) => (
                  <th
                    key={t.id}
                    className="text-left px-3 py-2 align-bottom whitespace-nowrap border-r border-border"
                  >
                    <Link
                      to={`/classes/${slug}/tasks/${t.id}`}
                      className="font-medium hover:text-primary"
                    >
                      {t.title}
                    </Link>
                    {t.topic && (
                      <div className="text-[10px] text-muted-foreground">
                        {t.topic}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleStudents.map((s) => (
                <tr key={s.userId} className="border-t border-border">
                  <td className="px-3 py-2 sticky left-0 bg-card border-r border-border">
                    <Link
                      to={`/profile/${s.username}`}
                      className="hover:text-primary"
                    >
                      {s.displayName ?? `@${s.username}`}
                    </Link>
                  </td>
                  {data.tasks.map((t) => {
                    const c = cellByPair.get(`${t.id}::${s.userId}`);
                    return (
                      <td
                        key={t.id}
                        className="px-3 py-2 border-r border-border"
                      >
                        <GradeCell cell={c} classSlug={slug} taskId={t.id} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GradeCell({
  cell,
  classSlug,
  taskId,
}: {
  cell: Cell | undefined;
  classSlug: string;
  taskId: string;
}) {
  if (!cell || cell.status === "missing") {
    return (
      <span className="text-muted-foreground">—</span>
    );
  }
  const label =
    cell.score != null && cell.maxScore != null
      ? `${cell.score}/${cell.maxScore}`
      : cell.status;
  const tone =
    cell.status === "passed"
      ? "text-emerald-700 dark:text-emerald-400"
      : cell.status === "failed"
        ? "text-rose-700 dark:text-rose-400"
        : "text-amber-700 dark:text-amber-400";
  return (
    <Link
      to={`/classes/${classSlug}/tasks/${taskId}`}
      className={`inline-flex items-center gap-1 hover:underline ${tone}`}
    >
      <span className="font-mono">{label}</span>
      {cell.wasLate && (
        <span className="text-[9px] uppercase tracking-wider text-amber-600">
          late
        </span>
      )}
      {cell.aiGenerated && (
        <span
          title="Auto-graded by AI"
          className="text-[9px] uppercase tracking-wider text-violet-600"
        >
          ai
        </span>
      )}
    </Link>
  );
}

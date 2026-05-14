// Phase 24C — month-grid calendar view of class tasks plotted by
// dueAt. Color-coded by kind (reading sky / homework violet /
// material slate). Click a cell's task to jump back to the task
// detail. Reuses class detail's tasks[] — no new endpoint.
//
// iCal subscription deferred to a follow-up (tz + recurring-events
// handling deserves its own phase).

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import type { ClassDetailResponse } from "@axiomic/types";
import { api, ApiError } from "../lib/api";
import { Skeleton } from "../components/ui";

const KIND_COLOR: Record<string, string> = {
  reading:
    "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  homework:
    "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
};

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function ClassCalendarPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [data, setData] = useState<ClassDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<Date>(startOfMonth(new Date()));

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    api.classes
      .get(slug)
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(
            e instanceof ApiError
              ? e.message
              : e instanceof Error
                ? e.message
                : "Failed to load",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Group tasks by yyyy-mm-dd for fast cell lookups.
  const byDate = useMemo(() => {
    const m = new Map<string, ClassDetailResponse["tasks"]>();
    if (!data) return m;
    for (const t of data.tasks) {
      if (!t.dueAt) continue;
      const key = t.dueAt.slice(0, 10);
      const arr = m.get(key) ?? [];
      arr.push(t);
      m.set(key, arr);
    }
    return m;
  }, [data]);

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
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const monthStart = startOfMonth(cursor);
  const monthLabel = monthStart.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  // Build a 6-row × 7-col grid starting on Sunday of the week
  // containing monthStart. Six rows always covers any month.
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const cells: Array<{ date: Date; inMonth: boolean }> = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push({
      date: d,
      inMonth: d.getMonth() === monthStart.getMonth(),
    });
  }
  const todayKey = ymd(new Date());

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Link
        to={`/classes/${slug}`}
        className="text-sm text-primary hover:underline"
      >
        ← Back to class
      </Link>
      <header className="mt-3 mb-4 flex items-baseline justify-between gap-3 flex-wrap">
        <h1 className="font-display text-2xl font-semibold tracking-tight inline-flex items-center gap-2">
          <Calendar className="w-6 h-6 text-primary" />
          {data.class.title} · calendar
        </h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCursor((c) => addMonths(c, -1))}
            className="px-2 py-1.5 rounded-md border border-border hover:bg-accent/40"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setCursor(startOfMonth(new Date()))}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setCursor((c) => addMonths(c, 1))}
            className="px-2 py-1.5 rounded-md border border-border hover:bg-accent/40"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="ml-2 text-sm font-medium">{monthLabel}</span>
        </div>
      </header>

      <div className="grid grid-cols-7 gap-px bg-border rounded-md overflow-hidden">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-2 py-1.5 text-center"
          >
            {d}
          </div>
        ))}
        {cells.map(({ date, inMonth }, i) => {
          const key = ymd(date);
          const tasks = byDate.get(key) ?? [];
          const isToday = key === todayKey;
          return (
            <div
              key={i}
              className={`min-h-[88px] p-1.5 text-xs bg-background ${
                inMonth ? "" : "opacity-40"
              }`}
            >
              <div
                className={`text-[10px] mb-1 ${
                  isToday
                    ? "inline-block px-1.5 rounded bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground"
                }`}
              >
                {date.getDate()}
              </div>
              <div className="space-y-1">
                {tasks.map((t) => (
                  <Link
                    key={t.id}
                    to={`/classes/${slug}/tasks/${t.id}`}
                    className={`block truncate rounded border px-1.5 py-0.5 ${
                      KIND_COLOR[t.kind] ??
                      "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30"
                    }`}
                    title={t.title}
                  >
                    {t.title}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

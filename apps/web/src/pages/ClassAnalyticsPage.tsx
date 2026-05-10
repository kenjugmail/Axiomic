// S93 — Instructor analytics dashboard.
//
// Four widgets stitched together:
//   1. XPOverTime — bar chart of class XP earned per day (last 30).
//   2. TaskCompletionGrid — per-task submission + pass rate.
//   3. AttendanceTrend — session-by-session present/late/absent.
//   4. StalledStudentsList — students who haven't earned XP in 7+
//      days, sorted by most-stalled first.
//
// All charts hand-rolled with divs + flex/grid; no chart library.
// The data sets are small (≤30 days, ≤50 students) so we can stay
// dependency-light and the bundle stays lean.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertCircle, BarChart3, ListChecks, CalendarCheck, UserMinus } from "lucide-react";
import type { ClassAnalyticsResponse } from "@axiomic/types";
import { api } from "../lib/api";
import { Skeleton } from "../components/ui";

export function ClassAnalyticsPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [data, setData] = useState<ClassAnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.classes
      .analytics(slug)
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e) => { if (!cancelled) setError(e?.message ?? "Failed"); });
    return () => { cancelled = true; };
  }, [slug]);

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Link to={`/classes/${slug}`} className="text-sm text-primary hover:underline mt-4 inline-block">
          Back to class
        </Link>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <Skeleton variant="card" className="h-48" />
        <Skeleton variant="card" className="h-72" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="text-xs text-muted-foreground mb-3">
        <Link to="/classes" className="hover:text-foreground">Classes</Link>
        {" / "}
        <Link to={`/classes/${slug}`} className="hover:text-foreground">{slug}</Link>
        {" / analytics"}
      </div>
      <h1 className="font-display text-2xl font-semibold tracking-tight mb-1">
        Class analytics
      </h1>
      <p className="text-xs text-muted-foreground mb-6">
        {data.totalEnrolled} enrolled · {data.windowDays}-day window
      </p>

      <Section title="XP earned per day" icon={<BarChart3 className="w-4 h-4" />}>
        <XpByDayChart days={data.xpByDay} />
      </Section>

      <Section title="Task completion" icon={<ListChecks className="w-4 h-4" />}>
        <TaskCompletionGrid items={data.taskCompletions} />
      </Section>

      <Section title="Attendance" icon={<CalendarCheck className="w-4 h-4" />}>
        <AttendanceTrend rows={data.attendanceRate} />
      </Section>

      <Section
        title={`Stalled students (no XP in ${data.stalledThresholdDays}+ days)`}
        icon={<UserMinus className="w-4 h-4" />}
      >
        <StalledStudentsList rows={data.stalledStudents} />
      </Section>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
        {icon}
        {title}
      </h2>
      <div className="rounded-md border border-border p-4">{children}</div>
    </section>
  );
}

// Hand-rolled bar chart. Each day is a vertical bar; height scales
// with totalXp / max. Hover surfaces the day + raw counts.
function XpByDayChart({ days }: { days: ClassAnalyticsResponse["xpByDay"] }) {
  const max = Math.max(1, ...days.map((d) => d.totalXp));
  const totalEarned = days.reduce((acc, d) => acc + d.totalXp, 0);

  if (totalEarned === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No XP earned in this class in the last {days.length} days.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-end gap-0.5 h-32 mb-2">
        {days.map((d) => (
          <div
            key={d.day}
            className="flex-1 bg-primary/20 hover:bg-primary/40 transition-colors rounded-sm relative group"
            style={{ height: `${(d.totalXp / max) * 100}%`, minHeight: d.totalXp > 0 ? 2 : 0 }}
            title={`${d.day}: ${d.totalXp} XP across ${d.distinctUserCount} student${d.distinctUserCount === 1 ? "" : "s"}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>{days[0]?.day}</span>
        <span>{totalEarned.toLocaleString()} XP total</span>
        <span>{days[days.length - 1]?.day}</span>
      </div>
    </div>
  );
}

function TaskCompletionGrid({ items }: { items: ClassAnalyticsResponse["taskCompletions"] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">No tasks yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((t) => {
        const pct = t.totalEnrolled > 0 ? Math.round((t.submittedCount / t.totalEnrolled) * 100) : 0;
        const passPct = t.totalEnrolled > 0 ? Math.round((t.gradedPassCount / t.totalEnrolled) * 100) : 0;
        return (
          <li key={t.taskId} className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-16">
              {t.kind}
            </span>
            <span className="text-sm flex-1 min-w-0 truncate">{t.title}</span>
            <span className="text-xs tabular-nums text-muted-foreground w-32 text-right">
              {t.submittedCount}/{t.totalEnrolled} submitted
            </span>
            <div className="w-32 h-2 bg-muted rounded-full overflow-hidden flex">
              <div className="h-full bg-emerald-500" style={{ width: `${passPct}%` }} title={`${t.gradedPassCount} graded pass`} />
              <div className="h-full bg-primary/40" style={{ width: `${Math.max(0, pct - passPct)}%` }} title={`${t.submittedCount - t.gradedPassCount} ungraded`} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function AttendanceTrend({ rows }: { rows: ClassAnalyticsResponse["attendanceRate"] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">No attendance recorded yet.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {rows.slice(0, 14).map((r) => {
        const total = r.presentCount + r.lateCount + r.absentCount + r.excusedCount;
        const presentPct = total > 0 ? Math.round((r.presentCount / total) * 100) : 0;
        const latePct = total > 0 ? Math.round((r.lateCount / total) * 100) : 0;
        const excusedPct = total > 0 ? Math.round((r.excusedCount / total) * 100) : 0;
        return (
          <li key={r.sessionDate} className="flex items-center gap-3">
            <span className="text-xs tabular-nums text-muted-foreground w-24">{r.sessionDate}</span>
            <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden flex" title={`${r.presentCount} present · ${r.lateCount} late · ${r.absentCount} absent · ${r.excusedCount} excused`}>
              <div className="h-full bg-emerald-500" style={{ width: `${presentPct}%` }} />
              <div className="h-full bg-amber-500" style={{ width: `${latePct}%` }} />
              <div className="h-full bg-blue-500" style={{ width: `${excusedPct}%` }} />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground w-16 text-right">
              {r.presentCount + r.lateCount}/{total}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function StalledStudentsList({ rows }: { rows: ClassAnalyticsResponse["stalledStudents"] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Nobody's stalled — every enrolled student has earned class XP recently.
      </p>
    );
  }
  return (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li
          key={r.userId}
          className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-accent/30"
        >
          <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <Link to={`/u/${r.username}`} className="text-sm hover:underline flex-1 min-w-0 truncate">
            {r.displayName || r.username}
          </Link>
          <span className="text-xs tabular-nums text-muted-foreground">
            {r.daysSinceLastActivity == null
              ? "never active"
              : `${r.daysSinceLastActivity}d idle`}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground w-20 text-right">
            {r.totalXp} XP
          </span>
        </li>
      ))}
    </ul>
  );
}

// S86 — Instructor's per-session attendance check-in grid.
//
// Pick a date, mark each student present/absent/late/excused, save.
// Re-saving the same date updates statuses; XP grants from
// present/late are idempotent server-side.

import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import type {
  AttendanceStatus,
  ClassRosterEntry,
} from "@axiomic/types";
import { api } from "../../lib/api";
import { toast } from "../../stores/toast";

interface AttendanceGridProps {
  classSlug: string;
  roster: ClassRosterEntry[];
}

const STATUS_OPTIONS: Array<{ value: AttendanceStatus; label: string; color: string }> = [
  { value: "present", label: "Present", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  { value: "late", label: "Late", color: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  { value: "absent", label: "Absent", color: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  { value: "excused", label: "Excused", color: "bg-muted text-muted-foreground" },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AttendanceGrid({ classSlug, roster }: AttendanceGridProps) {
  const [sessionDate, setSessionDate] = useState<string>(todayIso());
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);
  const students = useMemo(
    () => roster.filter((m) => m.role !== "observer"),
    [roster],
  );

  useEffect(() => {
    // Hydrate statuses from any prior recording for this date.
    let cancelled = false;
    setStatuses({});
    api.classes
      .getAttendance(classSlug, sessionDate)
      .then((r) => {
        if (cancelled) return;
        const next: Record<string, AttendanceStatus> = {};
        for (const e of r.entries) next[e.userId] = e.status as AttendanceStatus;
        setStatuses(next);
      })
      .catch(() => {
        // Non-fatal — fresh session just stays empty.
      });
    return () => {
      cancelled = true;
    };
  }, [classSlug, sessionDate]);

  const save = async () => {
    const entries = students
      .filter((s) => statuses[s.userId])
      .map((s) => ({ userId: s.userId, status: statuses[s.userId] }));
    if (entries.length === 0) {
      toast.error("Mark at least one student before saving.");
      return;
    }
    setSaving(true);
    try {
      const res = await api.classes.recordAttendance(classSlug, {
        sessionDate,
        entries,
      });
      const granted = res.xpGrants.length;
      toast.success(
        granted > 0
          ? `Attendance saved (${granted} XP grant${granted === 1 ? "" : "s"})`
          : "Attendance saved (no new XP)",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const markAll = (status: AttendanceStatus) => {
    const next: Record<string, AttendanceStatus> = {};
    for (const s of students) next[s.userId] = status;
    setStatuses(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs">
          <span className="text-muted-foreground mr-2">Session</span>
          <input
            type="date"
            value={sessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
            className="text-sm px-2 py-1 rounded-md border border-border bg-background"
          />
        </label>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
            Mark all
          </span>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => markAll(opt.value)}
              className={`text-xs px-2 py-1 rounded ${opt.color} hover:opacity-80`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {students.length === 0 ? (
        <p className="text-sm text-muted-foreground">No students enrolled yet.</p>
      ) : (
        <ul className="space-y-1">
          {students.map((s) => {
            const cur = statuses[s.userId];
            return (
              <li
                key={s.userId}
                className="flex items-center gap-3 px-3 py-2 rounded-md border border-border"
              >
                <span className="text-sm flex-1 truncate">
                  {s.displayName || s.username}
                </span>
                <div className="flex gap-1">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setStatuses({ ...statuses, [s.userId]: opt.value })
                      }
                      className={`text-xs px-2 py-1 rounded ${
                        cur === opt.value
                          ? opt.color
                          : "border border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 inline-flex items-center gap-1.5"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? "Saving…" : "Save attendance"}
        </button>
      </div>
    </div>
  );
}

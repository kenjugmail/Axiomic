// S86 — Class detail page.
//
// Tabs:
//   - Tasks: list of readings + homework, with student CTAs to mark
//     done / submit, and an instructor "Add task" affordance.
//   - Leaderboard: XP-ranked roster with pet renderings.
//   - Roster: instructor-only roster management (promote to TA).
//   - Attendance: instructor-only check-in grid.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ListChecks,
  Trophy,
  Users,
  CalendarCheck,
  Plus,
  KeyRound,
  ExternalLink,
  Clock,
  Sparkles,
} from "lucide-react";
import type {
  ClassDetailResponse,
  ClassLeaderboardResponse,
  ClassTaskKind,
  ClassRole,
  ClassRosterEntry,
  LeaderboardWindow,
} from "@axiomic/types";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { Leaderboard } from "../components/class/Leaderboard";
import { AttendanceGrid } from "../components/class/AttendanceGrid";
import { CompetitionsList } from "../components/class/CompetitionsList";
import { ClassQuestionWidget } from "../components/class/ClassQuestionWidget";
import { toast } from "../stores/toast";

type Tab = "tasks" | "leaderboard" | "competitions" | "roster" | "attendance";

export function ClassPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const { user } = useAuthStore();
  const [data, setData] = useState<ClassDetailResponse | null>(null);
  const [leaderboard, setLeaderboard] = useState<ClassLeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("tasks");
  const [creatingTask, setCreatingTask] = useState(false);

  const reload = async () => {
    const r = await api.classes.get(slug);
    setData(r);
  };

  const reloadLeaderboard = async (windowName?: LeaderboardWindow) => {
    const r = await api.classes.leaderboard(slug, windowName);
    setLeaderboard(r);
  };

  useEffect(() => {
    if (!slug) return;
    setData(null);
    setLeaderboard(null);
    api.classes
      .get(slug)
      .then(setData)
      .catch((e) => setError(e?.message ?? "Failed to load class"));
  }, [slug]);

  useEffect(() => {
    if (tab === "leaderboard" && data && !leaderboard) {
      reloadLeaderboard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, data]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Link
          to="/classes"
          className="text-sm text-primary hover:underline mt-4 inline-block"
        >
          Back to classes
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Skeleton variant="card" className="h-32 mb-6" />
        <Skeleton variant="card" className="h-72" />
      </div>
    );
  }

  const cls = data.class;
  const isInstructorOrTa = data.myRole === "instructor" || data.myRole === "ta";

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="text-xs text-muted-foreground mb-3">
        <Link to="/classes" className="hover:text-foreground">
          Classes
        </Link>
        {" / "}
        <span>{cls.title}</span>
      </div>

      {/* Header */}
      <header className="mb-6">
        <div className="text-2xl mb-2">🎓</div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {cls.title}
          </h1>
          <div className="flex items-center gap-2">
            {isInstructorOrTa && (
              <Link
                to={`/classes/${cls.slug}/analytics`}
                className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
              >
                Analytics
              </Link>
            )}
            {data.myRole === "instructor" && (
              <Link
                to={`/classes/${cls.slug}/edit`}
                className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
              >
                Edit class
              </Link>
            )}
          </div>
        </div>
        <div className="text-xs text-muted-foreground mt-2 flex items-center gap-3 flex-wrap">
          {cls.term && <span>{cls.term}</span>}
          {cls.instructor && (
            <span>
              · taught by{" "}
              <Link
                to={`/u/${cls.instructor.username}`}
                className="text-foreground hover:underline"
              >
                {cls.instructor.displayName || cls.instructor.username}
              </Link>
            </span>
          )}
          <span className="text-emerald-600 font-medium">· {data.myXp} XP earned</span>
          <span>· {data.roster.length + 1} member{data.roster.length === 0 ? "" : "s"}</span>
          {cls.joinCode && (
            <span className="inline-flex items-center gap-1 text-foreground">
              <KeyRound className="w-3 h-3" />
              <span className="font-mono">{cls.joinCode}</span>
              {/* S99 — instructor/TA-only "copy share link" button. */}
              {isInstructorOrTa && (
                <button
                  type="button"
                  onClick={() => {
                    const url = `${window.location.origin}/join/${cls.slug}/${cls.joinCode}`;
                    navigator.clipboard?.writeText(url).catch(() => {});
                    toast.success("Join link copied");
                  }}
                  className="ml-1 text-[10px] uppercase tracking-wider text-primary hover:underline"
                >
                  copy link
                </button>
              )}
            </span>
          )}
        </div>
        {cls.description && (
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
            {cls.description}
          </p>
        )}
      </header>

      {/* S99 — instructor's welcome message renders as a tinted
          banner above the syllabus + tabs. Markdown so instructors
          can drop in links + emphasis. */}
      {cls.welcomeMessageMd && (
        <div className="mb-6 rounded-md border border-primary/30 bg-primary/5 p-4">
          <div className="prose-sm max-w-none">
            <MarkdownRenderer
              content={cls.welcomeMessageMd}
              codeKernelKey={`class-welcome:${cls.slug}`}
            />
          </div>
        </div>
      )}

      {cls.syllabusMd && (
        <details className="mb-6 rounded-md border border-border p-3 bg-muted/30">
          <summary className="text-xs font-semibold cursor-pointer">Syllabus</summary>
          <div className="prose-sm max-w-none mt-3">
            <MarkdownRenderer
              content={cls.syllabusMd}
              codeKernelKey={`class-syllabus:${cls.slug}`}
            />
          </div>
        </details>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-4 flex-wrap">
        <TabButton active={tab === "tasks"} onClick={() => setTab("tasks")}>
          <ListChecks className="w-3.5 h-3.5" /> Tasks
        </TabButton>
        <TabButton active={tab === "leaderboard"} onClick={() => setTab("leaderboard")}>
          <Trophy className="w-3.5 h-3.5" /> Leaderboard
        </TabButton>
        <TabButton active={tab === "competitions"} onClick={() => setTab("competitions")}>
          <Sparkles className="w-3.5 h-3.5" /> Competitions
        </TabButton>
        {isInstructorOrTa && (
          <>
            <TabButton active={tab === "roster"} onClick={() => setTab("roster")}>
              <Users className="w-3.5 h-3.5" /> Roster
            </TabButton>
            <TabButton active={tab === "attendance"} onClick={() => setTab("attendance")}>
              <CalendarCheck className="w-3.5 h-3.5" /> Attendance
            </TabButton>
          </>
        )}
      </div>

      {tab === "tasks" && (
        <section>
          {/* S96 — class question of the day. Renders nothing for
              students when no question is active; instructors get
              an inline compose affordance. */}
          <ClassQuestionWidget classSlug={slug} myRole={data.myRole} />
          {isInstructorOrTa && (
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setCreatingTask(true)}
                className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add task
              </button>
            </div>
          )}
          {data.tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No readings or homework yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.tasks.map((t) => (
                <TaskRow
                  key={t.id}
                  classSlug={slug}
                  task={t}
                  myRole={data.myRole}
                  onChanged={reload}
                />
              ))}
            </ul>
          )}
          {creatingTask && (
            <CreateTaskDialog
              classSlug={slug}
              onClose={() => setCreatingTask(false)}
              onCreated={() => {
                setCreatingTask(false);
                reload();
              }}
            />
          )}
        </section>
      )}

      {tab === "leaderboard" && (
        <section>
          {/* S101 — window toggle. Reloads via the same endpoint
              with the requested window param. */}
          <div className="mb-3 flex items-center gap-1 text-xs">
            {(["all", "week", "today"] as const).map((w) => {
              const active = (leaderboard?.window ?? "all") === w;
              return (
                <button
                  key={w}
                  type="button"
                  onClick={() => reloadLeaderboard(w)}
                  className={`px-2.5 py-1 rounded-md border ${
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent/40"
                  }`}
                >
                  {w === "all" ? "All time" : w === "week" ? "This week" : "Today"}
                </button>
              );
            })}
          </div>
          {leaderboard === null ? (
            <Skeleton variant="card" className="h-40" />
          ) : (
            <Leaderboard
              classSlug={slug}
              entries={leaderboard.entries}
              currentUserId={user?.id ?? null}
              myRole={data.myRole}
              onGranted={() => reloadLeaderboard(leaderboard?.window)}
            />
          )}
        </section>
      )}

      {tab === "competitions" && (
        <CompetitionsList classSlug={slug} myRole={data.myRole} />
      )}

      {tab === "roster" && isInstructorOrTa && (
        <RosterPanel classSlug={slug} roster={data.roster} myRole={data.myRole} onChanged={reload} />
      )}

      {tab === "attendance" && isInstructorOrTa && (
        <AttendanceGrid classSlug={slug} roster={data.roster} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-sm inline-flex items-center gap-1.5 border-b-2 transition-colors ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function TaskRow({
  classSlug,
  task,
  myRole,
  onChanged,
}: {
  classSlug: string;
  task: ClassDetailResponse["tasks"][number];
  myRole: ClassRole;
  onChanged: () => void;
}) {
  const isStaff = myRole === "instructor" || myRole === "ta";
  const [submitting, setSubmitting] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [content, setContent] = useState("");

  const dueLabel = task.dueAt ? formatDate(task.dueAt) : null;

  const markReadingDone = async () => {
    setSubmitting(true);
    try {
      const res = await api.classes.completeTask(classSlug, task.id, {});
      if (res.xpGranted > 0) {
        toast.success(`+${res.xpGranted} XP`);
      } else {
        toast.info("Already marked done");
      }
      if (res.petHatched) {
        toast.success(
          `🥚 → ${res.petHatched.species}! Your pet hatched. Visit /me/pet to see it.`,
          undefined,
          8000,
        );
      }
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  const submitHomework = async () => {
    if (content.trim().length < 5) {
      toast.error("Add at least a few sentences before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.classes.completeTask(classSlug, task.id, { content });
      if (res.xpGranted > 0) toast.success(`+${res.xpGranted} XP`);
      if (res.petHatched) {
        toast.success(
          `🥚 → ${res.petHatched.species}! Your pet hatched. Visit /me/pet to see it.`,
          undefined,
          8000,
        );
      }
      setShowSubmit(false);
      setContent("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <li className="rounded-md border border-border p-3">
      <div className="flex items-start gap-3 flex-wrap">
        <span
          className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
            task.kind === "reading"
              ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
              : "bg-violet-500/15 text-violet-700 dark:text-violet-300"
          }`}
        >
          {task.kind}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{task.title}</div>
          {task.descriptionMd && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {task.descriptionMd.slice(0, 200)}
            </p>
          )}
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            {dueLabel && (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" /> due {dueLabel}
              </span>
            )}
            <span>· {task.xpReward} XP</span>
            {task.myCompleted && <span className="text-emerald-500">· done ✓</span>}
            {isStaff && (
              <Link
                to={`/classes/${classSlug}/tasks/${task.id}`}
                className="text-primary hover:underline"
              >
                · view submissions
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {task.kind === "reading" && task.url && (
            <a
              href={task.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 inline-flex items-center gap-1"
            >
              Open <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {!isStaff && task.kind === "reading" && !task.myCompleted && (
            <button
              type="button"
              onClick={markReadingDone}
              disabled={submitting}
              className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              Mark done
            </button>
          )}
          {!isStaff && task.kind === "homework" && (
            <button
              type="button"
              onClick={() => setShowSubmit(!showSubmit)}
              className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {task.myCompleted ? "Re-submit" : "Submit"}
            </button>
          )}
        </div>
      </div>
      {showSubmit && task.kind === "homework" && (
        <div className="mt-3 space-y-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            placeholder="Your writeup, link to your repo / colab, or however you want to submit."
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowSubmit(false)}
              className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitHomework}
              disabled={submitting}
              className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function CreateTaskDialog({
  classSlug,
  onClose,
  onCreated,
}: {
  classSlug: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [kind, setKind] = useState<ClassTaskKind>("reading");
  const [title, setTitle] = useState("");
  const [descriptionMd, setDescriptionMd] = useState("");
  const [url, setUrl] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await api.classes.createTask(classSlug, {
        kind,
        title: title.trim(),
        descriptionMd: descriptionMd.trim(),
        url: kind === "reading" && url.trim() ? url.trim() : null,
        dueAt: dueAt ? dueAt : null,
      });
      toast.success("Task created");
      onCreated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg border border-border w-full max-w-lg">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">Add a task</h2>
        </div>
        <div className="p-4 space-y-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
              Kind
            </span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ClassTaskKind)}
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
            >
              <option value="reading">Reading</option>
              <option value="homework">Homework</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
              Title
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === "reading" ? "Read chapter 3" : "Problem set 1"}
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
            />
          </label>
          {kind === "reading" && (
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
                URL (optional)
              </span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
              />
            </label>
          )}
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
              Description (markdown, optional)
            </span>
            <textarea
              value={descriptionMd}
              onChange={(e) => setDescriptionMd(e.target.value)}
              rows={4}
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
              Due (optional)
            </span>
            <input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
            />
          </label>
        </div>
        <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!title.trim() || submitting}
            className="text-xs px-4 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RosterPanel({
  classSlug,
  roster,
  myRole,
  onChanged,
}: {
  classSlug: string;
  roster: ClassRosterEntry[];
  myRole: ClassRole;
  onChanged: () => void;
}) {
  const isInstructor = myRole === "instructor";
  const setRole = async (userId: string, role: ClassRole) => {
    try {
      await api.classes.setMemberRole(classSlug, userId, role);
      toast.success("Role updated");
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed");
    }
  };

  if (roster.length === 0) {
    return <p className="text-sm text-muted-foreground">No members enrolled yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {roster.map((m) => (
        <li
          key={m.userId}
          className="flex items-center justify-between gap-3 p-3 rounded-md border border-border"
        >
          <div>
            <div className="text-sm font-medium">{m.displayName || m.username}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {m.role} · joined {formatDate(m.joinedAt)}
            </div>
          </div>
          {isInstructor && m.role !== "instructor" && (
            <select
              value={m.role}
              onChange={(e) => setRole(m.userId, e.target.value as ClassRole)}
              className="text-xs px-2 py-1 rounded-md border border-border bg-background"
            >
              <option value="student">student</option>
              <option value="ta">TA</option>
              <option value="observer">observer</option>
            </select>
          )}
        </li>
      ))}
    </ul>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}


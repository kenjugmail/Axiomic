// S86 — Class detail page.
//
// Tabs:
//   - Tasks: list of readings + homework, with student CTAs to mark
//     done / submit, and an instructor "Add task" affordance.
//   - Leaderboard: XP-ranked roster with pet renderings.
//   - Roster: instructor-only roster management (promote to TA).
//   - Attendance: instructor-only check-in grid.

import { useEffect, useMemo, useState } from "react";
import { confirm } from "../stores/confirm";
import { Link, useParams } from "react-router-dom";
import {
  BookCheck,
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronRight,
  FileText,
  ListChecks,
  Megaphone,
  Pencil,
  Pin,
  Trash2,
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
import { relativeTime } from "../lib/dates";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { Leaderboard } from "../components/class/Leaderboard";
import { AttendanceGrid } from "../components/class/AttendanceGrid";
import { CompetitionsList } from "../components/class/CompetitionsList";
import { PetByUsername } from "../pet";
import { ClassQuestionWidget } from "../components/class/ClassQuestionWidget";
import { toast } from "../stores/toast";

type Tab =
  | "stream"
  | "tasks"
  | "materials"
  | "leaderboard"
  | "competitions"
  | "roster"
  | "attendance";

export function ClassPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const { user } = useAuthStore();
  const [data, setData] = useState<ClassDetailResponse | null>(null);
  const [leaderboard, setLeaderboard] = useState<ClassLeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("stream");
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
          {/* S106 — linked cohort chip. Only shown when set. */}
          {cls.linkedCohortId && (
            <Link
              to={`/cohorts`}
              className="inline-flex items-center gap-1 text-foreground hover:text-primary"
              title="This class is linked to a cohort — capstone work in the cohort grants class XP"
            >
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-700 dark:text-violet-300">
                linked cohort
              </span>
            </Link>
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
          can drop in links + emphasis. Safe without `untrusted`
          because MarkdownRenderer doesn't enable rehype-raw or
          allowDangerousHtml — raw <script> / on* attributes are
          escaped by the markdown parser before sanitize runs. */}
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
        <TabButton active={tab === "stream"} onClick={() => setTab("stream")}>
          <Megaphone className="w-3.5 h-3.5" /> Stream
        </TabButton>
        <TabButton active={tab === "tasks"} onClick={() => setTab("tasks")}>
          <ListChecks className="w-3.5 h-3.5" /> Classwork
        </TabButton>
        <TabButton active={tab === "materials"} onClick={() => setTab("materials")}>
          <BookOpen className="w-3.5 h-3.5" /> Materials
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
            {/* Phase 23B — gradebook is its own page so the matrix
                can take the full width without crowding the tabs. */}
            <Link
              to={`/classes/${slug}/gradebook`}
              className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <BookCheck className="w-3.5 h-3.5" /> Gradebook
            </Link>
          </>
        )}
        {/* Phase 24C — calendar is its own page so the month grid
            can use the full width. Any enrollee can view. */}
        <Link
          to={`/classes/${slug}/calendar`}
          className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <Calendar className="w-3.5 h-3.5" /> Calendar
        </Link>
      </div>

      {tab === "stream" && (
        <ClassStream classSlug={slug} canPost={isInstructorOrTa} />
      )}

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
            // Phase 23C — group by topic. Topicless tasks fall into
            // "(no topic)" at the bottom. Within each group keep
            // the server's order (asc dueAt, desc createdAt).
            <ClasswarkGroups
              tasks={data.tasks}
              classSlug={slug}
              myRole={data.myRole}
              onChanged={reload}
            />
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

      {tab === "materials" && (
        <ClassMaterials classSlug={slug} canEdit={isInstructorOrTa} />
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
  // Phase 21 — personalized variant (null until we've checked).
  // Loaded the first time a student opens the submit form on a
  // homework task. Phase 23D added rubric so the student sees
  // what they'll be graded on before they write.
  const [variant, setVariant] = useState<{
    promptMd: string;
    rubric: {
      criteria: Array<{ id: string; description: string; weight?: number }>;
      passingScore: number;
    } | null;
  } | null>(null);
  const [variantLoaded, setVariantLoaded] = useState(false);

  const dueLabel = task.dueAt ? formatDate(task.dueAt) : null;

  useEffect(() => {
    if (variantLoaded) return;
    if (isStaff) return;
    if (task.kind !== "homework") return;
    if (!showSubmit) return;
    let cancelled = false;
    api.classes
      .myTaskVariant(classSlug, task.id)
      .then((r) => {
        if (!cancelled) {
          setVariant(
            r.variant
              ? { promptMd: r.variant.promptMd, rubric: r.variant.rubric }
              : null,
          );
          setVariantLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setVariantLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [showSubmit, isStaff, task.kind, task.id, classSlug, variantLoaded]);

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
          {variant && (
            <div
              data-testid="task-variant"
              className="rounded-md border border-violet-500/30 bg-violet-500/5 p-3"
            >
              <div className="text-[10px] uppercase tracking-wider text-violet-700 dark:text-violet-300 flex items-center gap-1 mb-1.5">
                <Sparkles className="w-3 h-3" />
                Personalized for you
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <MarkdownRenderer content={variant.promptMd} />
              </div>
              {/* Phase 23D — show the rubric the auto-grader will
                  use, so the student knows what counts before they
                  start writing. Mirror Google Classroom's
                  "Grading rubric" pre-submit visibility. */}
              {variant.rubric && variant.rubric.criteria.length > 0 && (
                <RubricSelfCheck
                  classSlug={classSlug}
                  taskId={task.id}
                  rubric={variant.rubric}
                />
              )}
            </div>
          )}
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
  // Phase 23C — optional grouping label, e.g. "Week 1: Linear Algebra".
  const [topic, setTopic] = useState("");
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
        topic: topic.trim() ? topic.trim() : null,
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
              Topic (optional)
            </span>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Week 1: Linear Algebra"
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
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
          <div className="flex items-center gap-3 min-w-0">
            {/* Phase M — pet avatar inline with the username. xs size
                (24px) — cosmetics auto-hide for failSmall items. */}
            <PetByUsername username={m.username} size="xs" />
            <div className="min-w-0">
              <div className="text-sm font-medium">{m.displayName || m.username}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {m.role} · joined {formatDate(m.joinedAt)}
              </div>
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

// Phase 23C — Classwork tab grouping. Tasks land in topic buckets;
// "(no topic)" sweeps up legacy + skipped entries at the bottom so
// nothing hides from the instructor.
function ClasswarkGroups({
  tasks,
  classSlug,
  myRole,
  onChanged,
}: {
  tasks: ClassDetailResponse["tasks"];
  classSlug: string;
  myRole: ClassRole;
  onChanged: () => void;
}) {
  const groups = new Map<string, ClassDetailResponse["tasks"]>();
  for (const t of tasks) {
    const key = t.topic && t.topic.trim() ? t.topic.trim() : "";
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }
  // Phase 24E — sort topics by earliest dueAt so "Week 1" lands
  // before "Week 10" (alphabetical was a foot-gun). Tasks without
  // dueAt get Infinity so they sink below their dated peers; the
  // topicless bucket always lands last.
  const earliestDue = (items: ClassDetailResponse["tasks"]): number => {
    let min = Number.POSITIVE_INFINITY;
    for (const t of items) {
      if (!t.dueAt) continue;
      const ts = Date.parse(t.dueAt);
      if (Number.isFinite(ts) && ts < min) min = ts;
    }
    return min;
  };
  const named = [...groups.keys()].filter((k) => k);
  named.sort((a, b) => {
    const da = earliestDue(groups.get(a) ?? []);
    const db = earliestDue(groups.get(b) ?? []);
    if (da !== db) return da - db;
    // Tiebreaker: alphabetical so the order is deterministic even
    // when no topic has a dueAt set yet.
    return a.localeCompare(b);
  });
  const ordered = named.concat(groups.has("") ? [""] : []);
  return (
    <div className="space-y-5">
      {ordered.map((key) => {
        const items = groups.get(key) ?? [];
        return (
          <TopicGroup
            key={key || "__notopic"}
            topic={key}
            items={items}
            classSlug={classSlug}
            myRole={myRole}
            onChanged={onChanged}
          />
        );
      })}
    </div>
  );
}

// Phase 24E — collapsible topic group. Persists per-(class, topic)
// collapsed state in localStorage so the instructor's preferred
// view survives a reload.
function TopicGroup({
  topic,
  items,
  classSlug,
  myRole,
  onChanged,
}: {
  topic: string;
  items: ClassDetailResponse["tasks"];
  classSlug: string;
  myRole: ClassRole;
  onChanged: () => void;
}) {
  const storageKey = `classwork-collapsed:${classSlug}:${topic || "__notopic"}`;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, collapsed ? "1" : "0");
    } catch {
      // ignore — quota/private-mode
    }
  }, [collapsed, storageKey]);
  return (
    <div data-testid="topic-group">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full text-left text-[11px] uppercase tracking-wider text-muted-foreground mb-2 inline-flex items-center gap-1.5 hover:text-foreground"
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
        {topic || "(no topic)"} · {items.length} task
        {items.length === 1 ? "" : "s"}
      </button>
      {!collapsed && (
        <ul className="space-y-2">
          {items.map((t) => (
            <TaskRow
              key={t.id}
              classSlug={classSlug}
              task={t}
              myRole={myRole}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// Phase 23A — class stream. Persistent announcement feed at the
// top of the class page. Pinned items show first; instructor +
// TA can post / edit / delete; everyone enrolled reads.
type AnnouncementRow = Awaited<
  ReturnType<typeof api.classes.listAnnouncements>
>["announcements"][number];

function ClassStream({
  classSlug,
  canPost,
}: {
  classSlug: string;
  canPost: boolean;
}) {
  const [rows, setRows] = useState<AnnouncementRow[] | null>(null);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [pinned, setPinned] = useState(false);
  const [posting, setPosting] = useState(false);
  // Phase 24E — edit-in-place. Saves a round-trip vs. delete + repost.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  // Phase 25D — Write / Preview tab toggle on the composer.
  const [composerMode, setComposerMode] = useState<"write" | "preview">("write");

  const load = async () => {
    try {
      const r = await api.classes.listAnnouncements(classSlug);
      setRows(r.announcements);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Stream load failed");
      setRows([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classSlug]);

  const submit = async () => {
    if (draft.trim().length < 10) {
      toast.error("Announcement is too short.");
      return;
    }
    setPosting(true);
    try {
      await api.classes.createAnnouncement(classSlug, {
        bodyMd: draft.trim(),
        pinned,
      });
      setDraft("");
      setPinned(false);
      setComposing(false);
      setComposerMode("write");
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Post failed");
    } finally {
      setPosting(false);
    }
  };

  const togglePin = async (row: AnnouncementRow) => {
    try {
      await api.classes.updateAnnouncement(classSlug, row.id, {
        pinned: !row.pinned,
      });
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Update failed");
    }
  };

  const remove = async (row: AnnouncementRow) => {
    if (
      !(await confirm({
        title: "Delete this announcement?",
        destructive: true,
      }))
    )
      return;
    try {
      await api.classes.deleteAnnouncement(classSlug, row.id);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Delete failed");
    }
  };

  const saveEdit = async (id: string) => {
    if (editDraft.trim().length < 10) {
      toast.error("Announcement is too short.");
      return;
    }
    try {
      await api.classes.updateAnnouncement(classSlug, id, {
        bodyMd: editDraft.trim(),
      });
      setEditingId(null);
      setEditDraft("");
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Edit failed");
    }
  };

  return (
    <section className="space-y-4">
      {canPost && !composing && (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="w-full text-left text-sm rounded-md border border-dashed border-border px-4 py-3 text-muted-foreground hover:border-primary hover:text-foreground"
        >
          Post an announcement…
        </button>
      )}
      {canPost && composing && (
        <div className="rounded-md border border-border bg-card p-3 space-y-2">
          {/* Phase 25D — Write / Preview tab toggle so the author
              can verify how the markdown renders before posting. */}
          <div className="flex gap-1 text-[11px]">
            {(["write", "preview"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setComposerMode(m)}
                className={`px-2 py-0.5 rounded ${
                  composerMode === m
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "write" ? "Write" : "Preview"}
              </button>
            ))}
          </div>
          {composerMode === "write" ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={5}
              placeholder="Markdown supported. Keep it short — students see this at the top of the class."
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
            />
          ) : draft.trim().length > 0 ? (
            <div className="min-h-[5rem] rounded-md border border-border bg-background px-3 py-2 prose prose-sm dark:prose-invert max-w-none">
              <MarkdownRenderer content={draft} />
            </div>
          ) : (
            <div className="min-h-[5rem] rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
              Nothing to preview yet — switch to Write.
            </div>
          )}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <label className="text-xs inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
              />
              Pin to top
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setComposing(false);
                  setDraft("");
                  setPinned(false);
                  setComposerMode("write");
                }}
                className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={posting || draft.trim().length < 10}
                className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {posting ? "Posting…" : "Post"}
              </button>
            </div>
          </div>
        </div>
      )}
      {rows === null && <Skeleton className="h-24" />}
      {rows && rows.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No announcements yet.
        </p>
      )}
      {rows && rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li
              key={r.id}
              data-testid="announcement"
              className={`rounded-md border bg-card p-4 ${
                r.pinned ? "border-primary/40 bg-primary/5" : "border-border"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1.5">
                <div className="text-xs text-muted-foreground inline-flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-foreground">
                    {r.authorDisplayName ?? `@${r.authorUsername}`}
                  </span>
                  <span>·</span>
                  <span>{relativeTime(r.createdAt)}</span>
                  {r.pinned && (
                    <span className="inline-flex items-center gap-1 text-primary">
                      <Pin className="w-3 h-3" />
                      pinned
                    </span>
                  )}
                </div>
                {canPost && editingId !== r.id && (
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(r.id);
                        setEditDraft(r.bodyMd);
                      }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePin(r)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {r.pinned ? "Unpin" : "Pin"}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(r)}
                      className="text-rose-600 dark:text-rose-400 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
              {editingId === r.id ? (
                <div className="space-y-2">
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={5}
                    className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setEditDraft("");
                      }}
                      className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => saveEdit(r.id)}
                      disabled={editDraft.trim().length < 10}
                      className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <MarkdownRenderer content={r.bodyMd} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Phase 24B — non-graded materials tab. Instructor authors a
// vertical list of cards; any enrollee reads. Each card is a
// note (markdown only) or a link (markdown + URL).
type MaterialRow = Awaited<
  ReturnType<typeof api.classes.listMaterials>
>["materials"][number];

function ClassMaterials({
  classSlug,
  canEdit,
}: {
  classSlug: string;
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<MaterialRow[] | null>(null);
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await api.classes.listMaterials(classSlug);
      setRows(r.materials);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Materials load failed");
      setRows([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classSlug]);

  const remove = async (id: string) => {
    if (
      !(await confirm({
        title: "Delete this material?",
        destructive: true,
      }))
    )
      return;
    try {
      await api.classes.deleteMaterial(classSlug, id);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Delete failed");
    }
  };

  const move = async (row: MaterialRow, delta: -1 | 1) => {
    if (!rows) return;
    const idx = rows.findIndex((r) => r.id === row.id);
    const neighborIdx = idx + delta;
    if (idx < 0 || neighborIdx < 0 || neighborIdx >= rows.length) return;
    const neighbor = rows[neighborIdx]!;
    try {
      // Swap sort orders. Two PUTs is enough for v1; a real
      // drag-reorder would batch.
      await api.classes.updateMaterial(classSlug, row.id, {
        sortOrder: neighbor.sortOrder,
      });
      await api.classes.updateMaterial(classSlug, neighbor.id, {
        sortOrder: row.sortOrder,
      });
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Reorder failed");
    }
  };

  return (
    <section className="space-y-4">
      {canEdit && !composing && (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="w-full text-left text-sm rounded-md border border-dashed border-border px-4 py-3 text-muted-foreground hover:border-primary hover:text-foreground"
        >
          + Add a material…
        </button>
      )}
      {canEdit && composing && (
        <MaterialEditor
          classSlug={classSlug}
          onClose={() => setComposing(false)}
          onSaved={async () => {
            setComposing(false);
            await load();
          }}
        />
      )}
      {rows === null && <Skeleton className="h-24" />}
      {rows && rows.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No materials yet.
        </p>
      )}
      {rows && rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((m, i) => (
            <li
              key={m.id}
              data-testid="material"
              className="rounded-md border border-border bg-card p-4"
            >
              {editingId === m.id ? (
                <MaterialEditor
                  classSlug={classSlug}
                  initial={m}
                  onClose={() => setEditingId(null)}
                  onSaved={async () => {
                    setEditingId(null);
                    await load();
                  }}
                />
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3 flex-wrap mb-1.5">
                    <div>
                      <div className="text-sm font-semibold">
                        {m.url ? (
                          <a
                            href={m.url}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-primary inline-flex items-center gap-1"
                          >
                            {m.title}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          m.title
                        )}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5 inline-flex items-center gap-1.5">
                        <FileText className="w-3 h-3" />
                        {m.kind}
                      </div>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-1 text-xs">
                        <button
                          type="button"
                          onClick={() => move(m, -1)}
                          disabled={i === 0}
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                          aria-label="Move up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => move(m, 1)}
                          disabled={i === rows.length - 1}
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                          aria-label="Move down"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(m.id)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(m.id)}
                          className="text-rose-600 dark:text-rose-400 hover:text-rose-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  {m.descriptionMd && (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <MarkdownRenderer content={m.descriptionMd} />
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MaterialEditor({
  classSlug,
  initial,
  onClose,
  onSaved,
}: {
  classSlug: string;
  initial?: MaterialRow;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [descriptionMd, setDescriptionMd] = useState(initial?.descriptionMd ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [kind, setKind] = useState<"note" | "link" | "file">(
    initial?.kind ?? "note",
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) {
      toast.error("Title is required.");
      return;
    }
    setSaving(true);
    try {
      if (initial) {
        await api.classes.updateMaterial(classSlug, initial.id, {
          title: title.trim(),
          descriptionMd,
          url: url.trim() ? url.trim() : null,
          kind,
        });
      } else {
        await api.classes.createMaterial(classSlug, {
          title: title.trim(),
          descriptionMd,
          url: url.trim() ? url.trim() : null,
          kind,
        });
      }
      await onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="text-sm px-3 py-2 rounded-md border border-border bg-background"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "note" | "link" | "file")}
          className="text-sm px-3 py-2 rounded-md border border-border bg-background"
        >
          <option value="note">Note</option>
          <option value="link">Link</option>
          <option value="file">File</option>
        </select>
      </div>
      {kind !== "note" && (
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
        />
      )}
      <textarea
        value={descriptionMd}
        onChange={(e) => setDescriptionMd(e.target.value)}
        rows={4}
        placeholder="Markdown body (optional)"
        className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !title.trim()}
          className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : initial ? "Save" : "Add"}
        </button>
      </div>
    </div>
  );
}

// Phase 25D — student-side rubric self-check. Pure client UI:
// checked state persists in localStorage keyed by criterion id
// so the student can survey themselves before submitting +
// resume across reloads. No server persistence; the rubric is
// still solely what the auto-grader scores against.
function RubricSelfCheck({
  classSlug,
  taskId,
  rubric,
}: {
  classSlug: string;
  taskId: string;
  rubric: {
    criteria: Array<{ id: string; description: string; weight?: number }>;
    passingScore: number;
  };
}) {
  const storageKey = `rubric-check:${classSlug}:${taskId}`;
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(checked));
    } catch {
      // ignore — quota/private-mode
    }
  }, [checked, storageKey]);
  const tickedCount = Object.values(checked).filter(Boolean).length;
  return (
    <div
      data-testid="task-variant-rubric"
      className="mt-3 pt-3 border-t border-violet-500/20"
    >
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <div className="text-[10px] uppercase tracking-wider text-violet-700 dark:text-violet-300">
          Graded on (pass at {Math.round(rubric.passingScore * 100)}%)
        </div>
        {tickedCount > 0 && (
          <button
            type="button"
            onClick={() => setChecked({})}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            Reset
          </button>
        )}
      </div>
      <ul className="text-xs space-y-1">
        {rubric.criteria.map((c) => {
          const isChecked = !!checked[c.id];
          return (
            <li key={c.id}>
              <label className="inline-flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) =>
                    setChecked((prev) => ({ ...prev, [c.id]: e.target.checked }))
                  }
                  className="mt-0.5"
                />
                <span
                  className={
                    isChecked
                      ? "text-muted-foreground line-through"
                      : "font-medium"
                  }
                >
                  {c.description.split("—")[0].trim()}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

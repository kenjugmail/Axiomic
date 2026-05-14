// S86 — Per-task page for instructor/TA: view all submissions for
// a homework + grade them. Reading tasks have no submissions to
// view (just a click-through), so this page redirects back when
// kind='reading'.

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Pencil, Sparkles, Wand2, XCircle } from "lucide-react";
import type { ClassTaskSubmissionsResponse } from "@axiomic/types";
import { api, ApiError } from "../lib/api";
import { Modal, Skeleton } from "../components/ui";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { toast } from "../stores/toast";
import { useAuthStore } from "../stores/auth";

export function ClassTaskPage() {
  const { slug = "", taskId = "" } = useParams<{ slug: string; taskId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<ClassTaskSubmissionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    const r = await api.classes.taskSubmissions(slug, taskId);
    setData(r);
  };

  useEffect(() => {
    api.classes
      .taskSubmissions(slug, taskId)
      .then((r) => {
        if (r.task.kind !== "homework") {
          navigate(`/classes/${slug}`);
          return;
        }
        setData(r);
      })
      .catch((e) => setError(e?.message ?? "Failed to load"));
  }, [slug, taskId, navigate]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-destructive">{error}</p>
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="text-xs text-muted-foreground mb-3">
        <Link to="/classes" className="hover:text-foreground">Classes</Link>
        {" / "}
        <Link to={`/classes/${slug}`} className="hover:text-foreground">{slug}</Link>
        {" / task"}
      </div>
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {data.task.title}
        </h1>
        {/* Phase 24D — instructor escape hatch to reuse this task
            in another class they own. Variants do NOT clone — the
            target class regenerates fresh. */}
        <CloneTaskButton sourceSlug={slug} taskId={taskId} />
      </div>
      {data.task.descriptionMd && (
        <div className="prose-sm max-w-none mb-6 rounded-md bg-muted/30 border border-border p-3">
          <MarkdownRenderer
            content={data.task.descriptionMd}
            codeKernelKey={`class-task:${slug}:${taskId}`}
          />
        </div>
      )}

      {/* Phase 21D — instructor variant management. Sits between
          the description and submissions so the workflow is:
          read base task → generate variants → grade submissions. */}
      <VariantsPanel classSlug={slug} taskId={taskId} />

      {/* S103 — bulk-grade affordance. Surfaces only when there are
          ungraded submissions to act on. */}
      <BulkGradeBar
        classSlug={slug}
        taskId={taskId}
        submissions={data.submissions}
        onApplied={() => reload()}
      />

      <h2 className="text-sm font-semibold mb-3">
        Submissions ({data.submissions.length})
      </h2>
      {data.submissions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No submissions yet.</p>
      ) : (
        <ul className="space-y-3">
          {data.submissions.map((s) => (
            <SubmissionRow
              key={s.id}
              classSlug={slug}
              taskId={taskId}
              submission={s}
              onChanged={reload}
            />
          ))}
        </ul>
      )}

      {/* Phase 24A — per-task discussion. Sits below submissions
          so the instructor sees their grading queue first, then
          any clarifying questions. Any enrollee can post. */}
      <TaskDiscussion classSlug={slug} taskId={taskId} />
    </div>
  );
}

function SubmissionRow({
  classSlug,
  taskId,
  submission,
  onChanged,
}: {
  classSlug: string;
  taskId: string;
  submission: ClassTaskSubmissionsResponse["submissions"][number];
  onChanged: () => void;
}) {
  const [feedback, setFeedback] = useState(submission.grade?.feedback ?? "");
  const [grading, setGrading] = useState(false);

  const grade = async (pass: boolean) => {
    setGrading(true);
    try {
      const res = await api.classes.gradeTask(classSlug, taskId, submission.userId, {
        pass,
        feedback,
      });
      if (res.xpGranted > 0) {
        toast.success(`Bonus +${res.xpGranted} XP awarded`);
      } else {
        toast.success("Saved");
      }
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Grade failed");
    } finally {
      setGrading(false);
    }
  };

  return (
    <li className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <div>
          <div className="text-sm font-medium">
            {submission.displayName || submission.username}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            submitted {formatDate(submission.submittedAt)}
            {submission.wasLate && <span className="text-amber-500 ml-1">· late</span>}
            {submission.grade != null && submission.gradedAt && (
              <span className="ml-1">
                · graded {formatDate(submission.gradedAt)}
                {submission.grade.pass ? (
                  <span className="text-emerald-500 ml-1">✓ pass</span>
                ) : (
                  <span className="text-rose-500 ml-1">× revision</span>
                )}
              </span>
            )}
          </div>
        </div>
      </div>
      {submission.content && (
        <pre className="text-xs px-3 py-2 rounded-md bg-muted/30 border border-border whitespace-pre-wrap font-mono mb-2">
          {submission.content}
        </pre>
      )}
      <div className="space-y-2">
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={2}
          placeholder="Feedback (optional)"
          className="w-full text-xs px-3 py-2 rounded-md border border-border bg-background"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => grade(false)}
            disabled={grading}
            className="text-xs px-3 py-1.5 rounded-md border border-rose-500/40 text-rose-600 hover:bg-rose-500/10 inline-flex items-center gap-1 disabled:opacity-60"
          >
            <XCircle className="w-3.5 h-3.5" /> Needs revision
          </button>
          <button
            type="button"
            onClick={() => grade(true)}
            disabled={grading}
            className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1 disabled:opacity-60"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Pass
          </button>
        </div>
      </div>
    </li>
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

// S103 — bulk grade bar.
//
// Surfaces only when there are ungraded submissions. Two affordances:
// "Pass all ungraded" applies pass=true to every submission whose
// grade is null. Skipped users (no submission) are silently dropped
// by the server.
function BulkGradeBar({
  classSlug,
  taskId,
  submissions,
  onApplied,
}: {
  classSlug: string;
  taskId: string;
  submissions: ClassTaskSubmissionsResponse["submissions"];
  onApplied: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const ungraded = submissions.filter((s) => s.grade == null);
  if (ungraded.length === 0) return null;

  const passAll = async () => {
    if (!confirm(`Mark ${ungraded.length} ungraded submission${ungraded.length === 1 ? "" : "s"} as passed?`)) return;
    setBusy(true);
    try {
      const r = await api.classes.bulkGradeTask(
        classSlug,
        taskId,
        ungraded.map((s) => ({ userId: s.userId, pass: true })),
      );
      toast.success(`Graded ${r.appliedCount} · ${r.xpAwardedTotal} XP awarded total`);
      onApplied();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Bulk grade failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
      <span className="text-xs text-muted-foreground">
        {ungraded.length} submission{ungraded.length === 1 ? "" : "s"} awaiting grading
      </span>
      <button
        type="button"
        onClick={passAll}
        disabled={busy}
        className="text-xs px-3 py-1 rounded-md bg-emerald-500 text-white hover:bg-emerald-500/90 disabled:opacity-60 inline-flex items-center gap-1.5"
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
        {busy ? "Grading…" : "Pass all ungraded"}
      </button>
    </div>
  );
}

// Phase 21D — instructor-side panel for managing AI-personalized
// assignment variants on this task. Bulk-generate button +
// per-student roster with rationale preview + per-row regenerate.
type VariantRow = Awaited<
  ReturnType<typeof api.classes.listTaskVariants>
>["variants"][number];

function VariantsPanel({
  classSlug,
  taskId,
}: {
  classSlug: string;
  taskId: string;
}) {
  const [rows, setRows] = useState<VariantRow[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [previewing, setPreviewing] = useState<VariantRow | null>(null);

  const load = async () => {
    try {
      const r = await api.classes.listTaskVariants(classSlug, taskId);
      setRows(r.variants);
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "Failed to load variants",
      );
      setRows([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classSlug, taskId]);

  const generate = async (regenerate: boolean) => {
    setGenerating(true);
    try {
      const r = await api.classes.generateTaskVariants(
        classSlug,
        taskId,
        regenerate,
      );
      toast.success(
        `Generated ${r.generated} variant${r.generated === 1 ? "" : "s"}` +
          (r.skipped > 0 ? ` (${r.skipped} skipped)` : ""),
      );
      await load();
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "Variant generation failed",
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section
      data-testid="variants-panel"
      className="mb-6 rounded-md border border-violet-500/30 bg-violet-500/5 p-4"
    >
      <header className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-sm font-semibold inline-flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-300" />
            Personalized variants
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            AI rewrites the assignment to emphasize each student's weak
            concepts at the class's level.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => generate(false)}
            disabled={generating}
            className="text-xs px-3 py-1.5 rounded-md bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            <Wand2 className="w-3.5 h-3.5" />
            {generating ? "Generating…" : "Generate"}
          </button>
          {rows && rows.length > 0 && (
            <button
              type="button"
              onClick={() => {
                // Phase 22D — destructive: overwrites any manual
                // edits made via the variant preview modal. Make
                // the cost explicit before firing the AI calls.
                const n = rows.length;
                if (
                  window.confirm(
                    `Overwrite all ${n} existing variant${n === 1 ? "" : "s"}? Any manual edits will be lost.`,
                  )
                ) {
                  generate(true);
                }
              }}
              disabled={generating}
              className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Regenerate all
            </button>
          )}
        </div>
      </header>
      {rows === null ? (
        <Skeleton className="h-20" />
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No variants yet. Click "Generate" to produce one personalized
          assignment per enrolled student.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded border border-border bg-card px-3 py-2 text-sm flex items-baseline justify-between gap-3 flex-wrap"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {r.studentDisplayName ?? `@${r.studentUsername}`}
                </div>
                <div className="text-xs text-muted-foreground line-clamp-1">
                  {r.rationale || "—"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewing(r)}
                className="text-xs text-primary hover:underline"
              >
                Preview →
              </button>
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={!!previewing}
        onClose={() => setPreviewing(null)}
        size="lg"
        title={
          previewing
            ? `Variant for ${previewing.studentDisplayName ?? "@" + previewing.studentUsername}`
            : ""
        }
      >
        {previewing && (
          <VariantPreviewBody
            classSlug={classSlug}
            taskId={taskId}
            variant={previewing}
            onSaved={async () => {
              setPreviewing(null);
              await load();
            }}
          />
        )}
      </Modal>
    </section>
  );
}

// Phase 22C — preview modal body with edit toggle. Lets the
// instructor hand-tune promptMd without re-burning an AI call.
// Rubric editing is out of scope for v1 (the criteria list is
// small but already shaped enough that markdown editing isn't
// natural — a dedicated rubric editor would warrant its own UI).
function VariantPreviewBody({
  classSlug,
  taskId,
  variant,
  onSaved,
}: {
  classSlug: string;
  taskId: string;
  variant: VariantRow;
  onSaved: () => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(variant.promptMd);
  const [saving, setSaving] = useState(false);

  // Re-sync the draft when a different variant is opened.
  useEffect(() => {
    setDraft(variant.promptMd);
    setEditing(false);
  }, [variant.id, variant.promptMd]);

  const save = async () => {
    if (draft.trim().length < 10) {
      toast.error("Prompt is too short.");
      return;
    }
    setSaving(true);
    try {
      await api.classes.updateTaskVariant(
        classSlug,
        taskId,
        variant.studentId,
        { promptMd: draft },
      );
      toast.success("Variant updated");
      await onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <section>
        <div className="flex items-center justify-between mb-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Personalized prompt
          </div>
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              data-testid="edit-variant"
              className="text-[11px] inline-flex items-center gap-1 text-primary hover:underline"
            >
              <Pencil className="w-3 h-3" />
              Edit
            </button>
          )}
        </div>
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={12}
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraft(variant.promptMd);
                  setEditing(false);
                }}
                className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || draft.trim().length < 10}
                className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <MarkdownRenderer content={variant.promptMd} />
          </div>
        )}
      </section>
      {variant.rationale && !editing && (
        <section>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Why these emphases
          </div>
          <p className="text-sm text-muted-foreground">{variant.rationale}</p>
        </section>
      )}
      {variant.rubric && !editing && (
        <section>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Rubric ({variant.rubric.criteria.length} criteria, pass at{" "}
            {Math.round(variant.rubric.passingScore * 100)}%)
          </div>
          <ul className="text-xs space-y-1 list-disc pl-5">
            {variant.rubric.criteria.map((c) => (
              <li key={c.id}>
                <span className="font-mono text-muted-foreground">
                  {c.weight ?? 1} pt{(c.weight ?? 1) === 1 ? "" : "s"}
                </span>{" "}
                — {c.description}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// Phase 24A — per-task discussion. Flat list, newest-first. Any
// enrollee posts; author edits own; author or instructor deletes.
type DiscussionRow = Awaited<
  ReturnType<typeof api.classes.listTaskDiscussions>
>["posts"][number];

function TaskDiscussion({
  classSlug,
  taskId,
}: {
  classSlug: string;
  taskId: string;
}) {
  const me = useAuthStore((s) => s.user);
  const [rows, setRows] = useState<DiscussionRow[] | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const load = async () => {
    try {
      const r = await api.classes.listTaskDiscussions(classSlug, taskId);
      setRows(r.posts);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Discussion load failed");
      setRows([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classSlug, taskId]);

  const post = async () => {
    if (draft.trim().length < 5) return;
    setPosting(true);
    try {
      await api.classes.postTaskDiscussion(classSlug, taskId, draft.trim());
      setDraft("");
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Post failed");
    } finally {
      setPosting(false);
    }
  };

  const saveEdit = async (id: string) => {
    if (editDraft.trim().length < 5) return;
    try {
      await api.classes.updateTaskDiscussion(
        classSlug,
        taskId,
        id,
        editDraft.trim(),
      );
      setEditingId(null);
      setEditDraft("");
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Edit failed");
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this post?")) return;
    try {
      await api.classes.deleteTaskDiscussion(classSlug, taskId, id);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Delete failed");
    }
  };

  return (
    <section className="mt-8" data-testid="task-discussion">
      <h2 className="text-sm font-semibold mb-3">Discussion</h2>
      {me && (
        <div className="rounded-md border border-border bg-card p-3 mb-3 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="Ask a clarifying question about this task…"
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={post}
              disabled={posting || draft.trim().length < 5}
              className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {posting ? "Posting…" : "Post"}
            </button>
          </div>
        </div>
      )}
      {rows === null && <Skeleton className="h-20" />}
      {rows && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">No questions yet.</p>
      )}
      {rows && rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((r) => {
            const isAuthor = me?.id === r.userId;
            return (
              <li
                key={r.id}
                className="rounded-md border border-border bg-card p-3"
                data-testid="discussion-post"
              >
                <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1.5">
                  <div className="text-xs text-muted-foreground inline-flex items-center gap-2 flex-wrap">
                    <Link
                      to={`/profile/${r.username}`}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {r.displayName ?? `@${r.username}`}
                    </Link>
                    <span>·</span>
                    <span>{new Date(r.createdAt).toLocaleString()}</span>
                  </div>
                  {isAuthor && (
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
                        onClick={() => remove(r.id)}
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
                      rows={3}
                      className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
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
                        disabled={editDraft.trim().length < 5}
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
            );
          })}
        </ul>
      )}
    </section>
  );
}

// Phase 24D — clone a task into another instructor-owned class.
// Lazily fetches the caller's class list when the picker opens so
// the page load stays cheap.
function CloneTaskButton({
  sourceSlug,
  taskId,
}: {
  sourceSlug: string;
  taskId: string;
}) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<
    Array<{ slug: string; title: string }> | null
  >(null);
  const [busy, setBusy] = useState(false);

  const openPicker = async () => {
    setOpen(true);
    if (targets !== null) return;
    try {
      const r = await api.classes.list();
      // `teaching` is exactly "classes I instruct" — exclude the
      // source class itself so the picker doesn't offer a no-op.
      const mine = r.teaching.filter((c) => c.slug !== sourceSlug);
      setTargets(mine.map((c) => ({ slug: c.slug, title: c.title })));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't load classes");
      setTargets([]);
    }
  };

  const clone = async (targetSlug: string) => {
    setBusy(true);
    try {
      const r = await api.classes.cloneTask(sourceSlug, taskId, targetSlug);
      toast.success(`Cloned to ${targetSlug}`);
      setOpen(false);
      // Surface the new task URL so the instructor can jump there
      // immediately if they want to set the due date.
      window.location.href = `/classes/${r.targetClassSlug}/tasks/${r.taskId}`;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Clone failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 inline-flex items-center gap-1.5"
      >
        Clone to…
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="md"
        title="Clone task to another class"
      >
        {targets === null && <Skeleton className="h-20" />}
        {targets && targets.length === 0 && (
          <p className="text-sm text-muted-foreground">
            You don't instruct any other classes.
          </p>
        )}
        {targets && targets.length > 0 && (
          <ul className="space-y-1.5">
            {targets.map((t) => (
              <li key={t.slug}>
                <button
                  type="button"
                  onClick={() => clone(t.slug)}
                  disabled={busy}
                  className="w-full text-left text-sm rounded-md border border-border px-3 py-2 hover:bg-accent/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="font-medium">{t.title}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {t.slug}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-muted-foreground mt-3">
          Title, description, topic, kind, and XP reward will be copied.
          Due date resets; AI variants are not copied.
        </p>
      </Modal>
    </>
  );
}

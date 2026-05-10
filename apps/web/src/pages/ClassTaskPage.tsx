// S86 — Per-task page for instructor/TA: view all submissions for
// a homework + grade them. Reading tasks have no submissions to
// view (just a click-through), so this page redirects back when
// kind='reading'.

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, XCircle } from "lucide-react";
import type { ClassTaskSubmissionsResponse } from "@axiomic/types";
import { api, ApiError } from "../lib/api";
import { Skeleton } from "../components/ui";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { toast } from "../stores/toast";

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
      <h1 className="font-display text-2xl font-semibold tracking-tight mb-2">
        {data.task.title}
      </h1>
      {data.task.descriptionMd && (
        <div className="prose-sm max-w-none mb-6 rounded-md bg-muted/30 border border-border p-3">
          <MarkdownRenderer
            content={data.task.descriptionMd}
            codeKernelKey={`class-task:${slug}:${taskId}`}
          />
        </div>
      )}

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

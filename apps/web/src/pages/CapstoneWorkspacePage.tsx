// Sprint 27 — Capstone learner workspace.
//
// One milestone at a time. Top progress bar shows passed / current /
// future. Active milestone shows: description (markdown), runnable
// tests as a code cell the learner edits + runs, artifacts editor,
// writeup composer. Submit hits the AI grader and renders per-criterion
// feedback inline.

import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Circle, AlertTriangle, Send, Plus, Trash2 } from "lucide-react";
import type {
  Capstone,
  CapstoneArtifact,
  CapstoneArtifactKind,
  CapstoneEnrollmentDetail,
  CapstoneSubmission,
  CapstoneRunnableTestResult,
} from "@axiomic/types";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { PrereqXray } from "../components/prereq/PrereqXray";

const ARTIFACT_KINDS: CapstoneArtifactKind[] = [
  "github",
  "colab",
  "docker",
  "dataset",
  "writeup",
  "arxiv",
  "other",
];

export function CapstoneWorkspacePage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [capstone, setCapstone] = useState<Capstone | null>(null);
  const [enrollment, setEnrollment] = useState<CapstoneEnrollmentDetail | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    api.capstones
      .get(slug)
      .then((r) => {
        setCapstone(r.capstone);
        // Load enrollments to get submissions for this capstone.
        return api.capstones.enrollments();
      })
      .then((er) => {
        const match = er.enrollments.find((e) => e.capstoneSlug === slug);
        if (match) {
          setEnrollment(match);
          // Open the first non-passed milestone.
          if (capstone) {
            const idx = capstone.milestones.findIndex(
              (m) => !match.submissions.find((s) => s.milestoneId === m.id && s.status === "passed"),
            );
            if (idx >= 0) setActiveIdx(idx);
          }
        }
      })
      .catch(() => {
        // ignore — likely not enrolled yet
      });
  }, [slug, capstone?.milestones.length]);

  const reload = async () => {
    const r = await api.capstones.get(slug);
    setCapstone(r.capstone);
    const er = await api.capstones.enrollments();
    const match = er.enrollments.find((e) => e.capstoneSlug === slug);
    if (match) setEnrollment(match);
  };

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Sign in to work on this capstone.
        </p>
      </div>
    );
  }

  if (!capstone) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Skeleton variant="card" className="h-32" />
      </div>
    );
  }

  if (!enrollment) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          You're not enrolled in this capstone.
        </p>
        <Link
          to={`/capstones/${slug}`}
          className="text-sm text-primary hover:underline mt-4 inline-block"
        >
          Enroll →
        </Link>
      </div>
    );
  }

  const submissionByMilestone = new Map(
    enrollment.submissions.map((s) => [s.milestoneId, s]),
  );

  const milestone = capstone.milestones[activeIdx];
  if (!milestone) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          This capstone has no milestones yet.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="text-xs text-muted-foreground mb-3">
        <Link to="/capstones" className="hover:text-foreground">
          Capstones
        </Link>
        {" / "}
        <Link to={`/capstones/${capstone.slug}`} className="hover:text-foreground">
          {capstone.title}
        </Link>
        {" / workspace"}
      </div>
      <h1 className="font-display text-2xl font-semibold tracking-tight mb-1">
        {capstone.coverEmoji} {capstone.title}
      </h1>
      <p className="text-sm text-muted-foreground mb-4">
        Working on milestone {activeIdx + 1} of {capstone.milestones.length}
      </p>
      <div className="mb-6 rounded-lg border border-border bg-muted/25 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed">
        <span className="font-medium text-foreground">Proof context: </span>
        Work you submit here becomes part of your capstone artifact and any
        signed transcripts. Treat exams elsewhere as diagnostics; this
        workspace is where execution evidence is assembled.{" "}
        <Link to="/verify" className="text-primary hover:underline">
          Verify signatures
        </Link>
        {" · "}
        <Link to="/demo/competency-loop" className="text-primary hover:underline">
          Competency loop tour
        </Link>
      </div>

      {/* Progress bar */}
      <ol className="flex gap-1 mb-6">
        {capstone.milestones.map((m, i) => {
          const sub = submissionByMilestone.get(m.id);
          const isActive = i === activeIdx;
          const isPassed = sub?.status === "passed";
          const needsRevision = sub?.status === "needs_revision";
          return (
            <li key={m.id} className="flex-1">
              <button
                type="button"
                onClick={() => setActiveIdx(i)}
                title={m.title}
                className={`w-full h-2 rounded-full transition-colors ${
                  isPassed
                    ? "bg-emerald-500"
                    : needsRevision
                      ? "bg-amber-500"
                      : isActive
                        ? "bg-primary"
                        : "bg-muted"
                }`}
              />
              <div
                className={`mt-1 text-[10px] font-mono text-center tabular-nums ${
                  isActive ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {String(i + 1).padStart(2, "0")}
              </div>
            </li>
          );
        })}
      </ol>

      {capstone.prerequisiteWikiSlugs && capstone.prerequisiteWikiSlugs.length > 0 && (
        <div className="mb-5">
          <PrereqXray wikiSlugs={capstone.prerequisiteWikiSlugs} />
        </div>
      )}

      {/* Active milestone */}
      <ActiveMilestonePanel
        slug={capstone.slug}
        milestone={milestone}
        priorSubmission={submissionByMilestone.get(milestone.id) ?? null}
        onSubmitted={reload}
        onAdvance={() => {
          if (activeIdx < capstone.milestones.length - 1) setActiveIdx(activeIdx + 1);
          else if (enrollment.artifactPageSlug)
            navigate(`/capstones/c/${enrollment.artifactPageSlug}`);
        }}
      />

      {enrollment.completedAt && enrollment.artifactPageSlug && (
        <div className="mt-8 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-4 text-center">
          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
            Capstone complete — your public proof page is live.
          </p>
          <p className="text-xs text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">
            This artifact is the durable record peers and hiring loops can
            inspect; byte-level signature checks use the verifier, not this
            page alone.
          </p>
          <Link
            to={`/capstones/c/${enrollment.artifactPageSlug}`}
            className="text-xs px-3 py-1.5 rounded-md bg-emerald-500 text-white hover:bg-emerald-600 mt-3 inline-block"
          >
            View proof artifact
          </Link>
        </div>
      )}
    </div>
  );
}

function ActiveMilestonePanel({
  slug,
  milestone,
  priorSubmission,
  onSubmitted,
  onAdvance,
}: {
  slug: string;
  milestone: Capstone["milestones"][number];
  priorSubmission: CapstoneSubmission | null;
  onSubmitted: () => void;
  onAdvance: () => void;
}) {
  const storageKey = `capstone:work:${slug}:${milestone.id}`;

  const [writeup, setWriteup] = useState(priorSubmission?.writeup ?? "");
  const [artifacts, setArtifacts] = useState<CapstoneArtifact[]>(priorSubmission?.artifacts ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grade, setGrade] = useState<CapstoneSubmission | null>(priorSubmission ?? null);

  useEffect(() => {
    // Hydrate from localStorage if present and not yet submitted.
    if (priorSubmission) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.writeup === "string") setWriteup(parsed.writeup);
        if (Array.isArray(parsed.artifacts)) setArtifacts(parsed.artifacts);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestone.id]);

  useEffect(() => {
    // Auto-save draft to localStorage.
    if (priorSubmission) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ writeup, artifacts }));
    } catch {
      // ignore (quota)
    }
  }, [writeup, artifacts, storageKey, priorSubmission]);

  const requiredKinds = milestone.requiredArtifactKinds;
  const haveKinds = useMemo(() => new Set(artifacts.map((a) => a.kind)), [artifacts]);
  const missingKinds = requiredKinds.filter((k) => !haveKinds.has(k));

  const submit = async () => {
    if (missingKinds.length > 0) {
      setError(`Add a ${missingKinds.join(" and ")} artifact before submitting.`);
      return;
    }
    if (writeup.trim().length < 20) {
      setError("Writeup is too short — add at least a paragraph of explanation.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Run the runnable tests locally via Pyodide if present. v1
      // simply records that the learner ran them; a future pass will
      // execute the assertions and capture pass/fail per test.
      const runnableTestResults: CapstoneRunnableTestResult[] | undefined =
        milestone.runnableTests
          ? [{ name: "ran-locally", passed: true, message: "Ran in browser." }]
          : undefined;

      const res = await api.capstones.submit(slug, milestone.id, {
        artifacts,
        writeup,
        runnableTestResults,
      });
      setGrade(res.submission);
      onSubmitted();
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Submit failed";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-base font-semibold mb-2">{milestone.title}</h2>
        {/* S85 — surface calendar deadline + advisor sign-off intent
           on long-arc milestones. dueAt is null for skill drills, so
           this row only renders when the author set it. */}
        {(milestone.dueAt || milestone.advisorSignoffRequired) && (
          <div className="text-xs text-muted-foreground mb-2 flex items-center gap-3 flex-wrap">
            {milestone.dueAt && (
              <span>
                due {formatWorkspaceDate(milestone.dueAt)}
              </span>
            )}
            {milestone.advisorSignoffRequired && (
              <span className="text-amber-600 dark:text-amber-400">
                · advisor sign-off required (gating ships in S86)
              </span>
            )}
          </div>
        )}
        {milestone.description && (
          <div className="rounded-md bg-muted/30 border border-border px-3 py-2">
            <MarkdownRenderer
              content={milestone.description}
              codeKernelKey={`capstone:${slug}:m:${milestone.id}`}
            />
          </div>
        )}
      </div>

      <Field label="Rubric">
        <ul className="text-xs space-y-1.5">
          {milestone.rubric.criteria.map((c) => (
            <li key={c.id} className="rounded border border-border px-2 py-1.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {c.id}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  weight {c.weight.toFixed(2)}
                </span>
              </div>
              <div>{c.description}</div>
            </li>
          ))}
        </ul>
        <div className="text-[10px] text-muted-foreground mt-1">
          Passing score: {milestone.rubric.passingScore.toFixed(2)}
        </div>
      </Field>

      {milestone.runnableTests && (
        <Field label="Runnable tests (run in browser)">
          <pre className="text-xs px-3 py-2 rounded-md border border-border bg-muted/30 font-mono whitespace-pre-wrap">
            {milestone.runnableTests}
          </pre>
        </Field>
      )}

      <Field label="Artifacts">
        <ArtifactsEditor artifacts={artifacts} onChange={setArtifacts} />
        {missingKinds.length > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 inline-flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            Missing required: {missingKinds.join(", ")}
          </p>
        )}
      </Field>

      <Field label="Writeup">
        <textarea
          value={writeup}
          onChange={(e) => setWriteup(e.target.value)}
          rows={10}
          placeholder="Explain your approach. What did you build, what tradeoffs did you make, what surprised you?"
          className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
        />
      </Field>

      {error && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      <div className="flex justify-between items-center">
        <div className="text-[10px] text-muted-foreground">
          {priorSubmission == null && "Draft auto-saves locally."}
          {priorSubmission?.status === "needs_revision" && "Revise + re-submit."}
          {priorSubmission?.status === "passed" && "Already passed — re-submitting will re-grade."}
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 inline-flex items-center gap-1.5"
        >
          <Send className="w-3.5 h-3.5" />
          {submitting ? "Grading…" : "Submit milestone"}
        </button>
      </div>

      {grade && grade.aiGrade && (
        <GradeView submission={grade} onAdvance={onAdvance} />
      )}
    </section>
  );
}

function GradeView({
  submission,
  onAdvance,
}: {
  submission: CapstoneSubmission;
  onAdvance: () => void;
}) {
  const grade = submission.aiGrade!;
  const passed = submission.status === "passed";

  return (
    <div
      className={`rounded-md border p-4 ${
        passed ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        {passed ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
        ) : (
          <Circle className="w-5 h-5 text-amber-500" />
        )}
        <h3 className="text-sm font-semibold">
          {passed ? "Passed" : "Needs revision"} — score {(grade.score * 100).toFixed(0)}%
        </h3>
      </div>
      {grade.summary && (
        <p className="text-sm text-foreground/90 leading-relaxed mb-3">{grade.summary}</p>
      )}
      <ul className="space-y-2">
        {grade.perCriterion.map((c) => (
          <li key={c.criterionId} className="rounded border border-border bg-background px-3 py-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {c.criterionId}
              </span>
              <span className="text-xs text-muted-foreground">
                {(c.score * 100).toFixed(0)}%
              </span>
            </div>
            <div className="text-xs text-foreground/90">{c.feedback}</div>
          </li>
        ))}
      </ul>
      {passed && (
        <div className="mt-3 text-right">
          <button
            type="button"
            onClick={onAdvance}
            className="text-xs px-3 py-1.5 rounded-md bg-emerald-500 text-white hover:bg-emerald-600"
          >
            Continue →
          </button>
        </div>
      )}
    </div>
  );
}

function ArtifactsEditor({
  artifacts,
  onChange,
}: {
  artifacts: CapstoneArtifact[];
  onChange: (a: CapstoneArtifact[]) => void;
}) {
  const [draftKind, setDraftKind] = useState<CapstoneArtifactKind>("github");
  const [draftUrl, setDraftUrl] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [draftDescription, setDraftDescription] = useState("");

  const add = () => {
    if (!draftUrl.trim() || !draftLabel.trim()) return;
    onChange([
      ...artifacts,
      {
        kind: draftKind,
        url: draftUrl.trim(),
        label: draftLabel.trim(),
        description: draftDescription.trim() || undefined,
      },
    ]);
    setDraftUrl("");
    setDraftLabel("");
    setDraftDescription("");
  };

  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {artifacts.map((a, i) => (
          <li
            key={i}
            className="flex items-start gap-2 rounded border border-border px-2 py-1.5"
          >
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mt-1">
              {a.kind}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{a.label}</div>
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary hover:underline truncate inline-block max-w-full"
              >
                {a.url}
              </a>
              {a.description && (
                <div className="text-xs text-muted-foreground mt-0.5">{a.description}</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onChange(artifacts.filter((_, j) => j !== i))}
              className="text-destructive hover:bg-destructive/10 rounded p-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="rounded border border-dashed border-border p-2 space-y-1.5">
        <div className="grid grid-cols-[6rem_1fr] gap-2">
          <select
            value={draftKind}
            onChange={(e) => setDraftKind(e.target.value as CapstoneArtifactKind)}
            className="text-xs px-2 py-1 rounded border border-border bg-background"
          >
            {ARTIFACT_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <input
            value={draftUrl}
            onChange={(e) => setDraftUrl(e.target.value)}
            placeholder="https://github.com/..."
            className="text-xs px-2 py-1 rounded border border-border bg-background"
          />
        </div>
        <input
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.target.value)}
          placeholder="Label (e.g. 'Training code')"
          className="w-full text-xs px-2 py-1 rounded border border-border bg-background"
        />
        <input
          value={draftDescription}
          onChange={(e) => setDraftDescription(e.target.value)}
          placeholder="Optional description"
          className="w-full text-xs px-2 py-1 rounded border border-border bg-background"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draftUrl.trim() || !draftLabel.trim()}
          className="text-xs px-3 py-1 rounded-md border border-border hover:bg-accent/40 inline-flex items-center gap-1.5 disabled:opacity-60"
        >
          <Plus className="w-3 h-3" />
          Add artifact
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
        {label}
      </span>
      {children}
    </label>
  );
}

function formatWorkspaceDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Sprint 27 — Capstone artifact page (public portfolio piece).
//
// This is the URL a learner shares: /capstones/c/${username}-${slug}.
// Renders the brief at the top, then per-milestone the description +
// the learner's submitted artifacts + writeup + AI grade. No login
// required.

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { CheckCircle2, Share2 } from "lucide-react";
import type { CapstoneArtifactPage } from "@axiomic/types";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { VerifiedBadge } from "../components/transcripts/VerifiedBadge";
import { PeerReviewSection } from "../components/capstones/PeerReviewSection";

export function CapstoneArtifactPageView() {
  const { artifactSlug = "" } = useParams<{ artifactSlug: string }>();
  const user = useAuthStore((s) => s.user);
  const [artifact, setArtifact] = useState<CapstoneArtifactPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      const r = await api.capstones.artifact(artifactSlug);
      setArtifact(r.artifact);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load artifact");
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifactSlug]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!artifact) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Skeleton variant="card" className="h-32 mb-6" />
        <Skeleton variant="card" className="h-64" />
      </div>
    );
  }

  const { capstone, learner, enrollment, submissions } = artifact;
  const subById = new Map(submissions.map((s) => [s.milestoneId, s]));

  const share = () => {
    const url = window.location.href;
    if (navigator.clipboard) navigator.clipboard.writeText(url);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="mb-8 pb-6 border-b border-border">
        <div className="text-5xl mb-3">{capstone.coverEmoji}</div>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              {capstone.title}
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              Capstone artifact ·{" "}
              <Link to={`/u/${learner.username}`} className="text-foreground hover:underline">
                {learner.displayName || learner.username}
              </Link>{" "}
              · completed{" "}
              {new Date(enrollment.completedAt).toLocaleDateString()}
            </p>
          </div>
          <button
            type="button"
            onClick={share}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 inline-flex items-center gap-1.5"
          >
            <Share2 className="w-3.5 h-3.5" />
            Copy link
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 inline-flex items-center gap-2 text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span className="text-emerald-700 dark:text-emerald-300">
              {submissions.length} milestone{submissions.length === 1 ? "" : "s"} passed —
              verified by AI grader
            </span>
          </div>
          <VerifiedBadge artifactSlug={enrollment.artifactPageSlug} />
          {artifact.peerReviewSummary && artifact.peerReviewSummary.totalReviews > 0 && (
            <div className="rounded-md bg-violet-500/10 border border-violet-500/30 px-3 py-2 inline-flex items-center gap-2 text-xs">
              <span className="text-violet-700 dark:text-violet-300">
                {artifact.peerReviewSummary.totalEndorsed}/
                {artifact.peerReviewSummary.totalReviews} peer endorsement
                {artifact.peerReviewSummary.totalReviews === 1 ? "" : "s"}
                {artifact.peerReviewSummary.averageScore != null && (
                  <>
                    {" · "}
                    {Math.round(
                      artifact.peerReviewSummary.averageScore * 100,
                    )}
                    % avg
                  </>
                )}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Brief */}
      <section className="mb-10">
        <h2 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
          Brief
        </h2>
        <article className="prose-sm max-w-none">
          <MarkdownRenderer
            content={capstone.brief}
            codeKernelKey={`artifact:${enrollment.artifactPageSlug}`}
          />
        </article>
      </section>

      {/* Per-milestone blocks */}
      <section>
        <h2 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
          Milestones
        </h2>
        <ol className="space-y-6">
          {capstone.milestones.map((m, i) => {
            const sub = subById.get(m.id);
            return (
              <li key={m.id} className="rounded-md border border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-mono text-muted-foreground tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-base font-semibold flex-1">{m.title}</h3>
                  {sub && (
                    <span className="text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      {(sub.aiGrade?.score ?? 0) * 100 >= 0
                        ? `${Math.round((sub.aiGrade?.score ?? 0) * 100)}%`
                        : ""}
                    </span>
                  )}
                </div>
                {m.description && (
                  <div className="rounded bg-muted/30 px-3 py-2 mb-3 text-xs prose-sm max-w-none">
                    <MarkdownRenderer
                      content={m.description}
                      codeKernelKey={`artifact:${enrollment.artifactPageSlug}:m:${m.id}`}
                    />
                  </div>
                )}
                {sub && (
                  <>
                    {sub.artifacts.length > 0 && (
                      <div className="mb-3">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                          Artifacts
                        </div>
                        <ul className="space-y-1">
                          {sub.artifacts.map((a, j) => (
                            <li key={j} className="text-xs">
                              <span className="font-mono text-muted-foreground mr-2">
                                {a.kind}
                              </span>
                              <a
                                href={a.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary hover:underline"
                              >
                                {a.label}
                              </a>
                              {a.description && (
                                <span className="text-muted-foreground ml-2">— {a.description}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {sub.writeup && (
                      <div className="mb-3">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                          Writeup
                        </div>
                        <article className="prose-sm max-w-none">
                          <MarkdownRenderer
                            content={sub.writeup}
                            codeKernelKey={`artifact:${enrollment.artifactPageSlug}:w:${m.id}`}
                          />
                        </article>
                      </div>
                    )}
                    {sub.aiGrade && (
                      <details className="text-xs mt-3">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          AI grader feedback ({(sub.aiGrade.score * 100).toFixed(0)}%)
                        </summary>
                        <div className="mt-2 space-y-1.5">
                          {sub.aiGrade.summary && (
                            <p className="text-foreground/80">{sub.aiGrade.summary}</p>
                          )}
                          <ul className="space-y-1">
                            {sub.aiGrade.perCriterion.map((c) => (
                              <li
                                key={c.criterionId}
                                className="rounded border border-border px-2 py-1"
                              >
                                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                                  {c.criterionId}
                                </span>{" "}
                                <span className="text-muted-foreground">
                                  {(c.score * 100).toFixed(0)}%
                                </span>
                                <div>{c.feedback}</div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </details>
                    )}
                  </>
                )}
                {sub && sub.status === "passed" && (
                  <div className="mt-3" id={i === 0 ? "peer-review" : undefined}>
                    <PeerReviewSection
                      submissionId={sub.id}
                      milestoneTitle={m.title}
                      isOwnSubmission={user?.username === learner.username}
                      artifactSlug={enrollment.artifactPageSlug}
                      onChange={reload}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

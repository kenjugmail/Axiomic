// Sprint 37 — Capstone transcript manifest.
//
// Builds a deterministic snapshot of a completed enrollment so the
// payload can be canonical-JSON serialized and signed. The manifest
// is what an external citation actually attests to: who completed
// which capstone version, which milestones passed at what scores, and
// when.

import { eq, inArray, sql } from "drizzle-orm";
import {
  capstoneEnrollments,
  capstoneMilestones,
  capstonePeerReviews,
  capstoneSubmissions,
  capstones,
  getDb,
  users,
} from "@axiomic/db";

export interface TranscriptManifest {
  // Identifies which Axiomic instance issued this transcript.
  issuer: string;
  // Stable URL the verifier can refetch the transcript from.
  artifactUrl: string;
  artifactPageSlug: string;
  capstone: {
    slug: string;
    title: string;
    // Pinned to the version the learner completed against (S35).
    version: number;
  };
  learner: {
    username: string;
    displayName: string | null;
  };
  milestones: Array<{
    title: string;
    status: "passed" | "needs_revision" | "pending";
    score: number | null;
    submittedAt: string;
    gradedAt: string | null;
  }>;
  startedAt: string;
  completedAt: string;
  // ISO timestamp of when the manifest was issued (signing time).
  issuedAt: string;
  // Sprint 39 — peer review summary across all milestones. Folded
  // into the signed bytes so the credibility claim covers both AI
  // grading + community review counts at signing time.
  peerReviews: {
    totalReviews: number;
    totalEndorsed: number;
    averageScore: number | null;
  };
}

const ISSUER = "axiomic.app";

// Look up an enrollment by its public artifact-page slug and build
// the canonical manifest. Returns null when the slug isn't a
// completed enrollment.
export function buildTranscriptManifest(
  artifactSlug: string,
): TranscriptManifest | null {
  const db = getDb();

  const enrollment = db
    .select()
    .from(capstoneEnrollments)
    .where(eq(capstoneEnrollments.artifactPageSlug, artifactSlug))
    .get();
  if (!enrollment || !enrollment.completedAt) return null;

  const cap = db
    .select()
    .from(capstones)
    .where(eq(capstones.id, enrollment.capstoneId))
    .get();
  if (!cap) return null;

  const learner = db
    .select({
      username: users.username,
      displayName: users.displayName,
    })
    .from(users)
    .where(eq(users.id, enrollment.userId))
    .get();
  if (!learner) return null;

  const milestoneRows = db
    .select({
      id: capstoneMilestones.id,
      order: capstoneMilestones.order,
      title: capstoneMilestones.title,
    })
    .from(capstoneMilestones)
    .where(eq(capstoneMilestones.capstoneId, cap.id))
    .all();
  milestoneRows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const subRows = db
    .select({
      id: capstoneSubmissions.id,
      milestoneId: capstoneSubmissions.milestoneId,
      status: capstoneSubmissions.status,
      aiGradeJson: capstoneSubmissions.aiGradeJson,
      submittedAt: capstoneSubmissions.submittedAt,
      gradedAt: capstoneSubmissions.gradedAt,
    })
    .from(capstoneSubmissions)
    .where(eq(capstoneSubmissions.enrollmentId, enrollment.id))
    .all();
  const subByMilestone = new Map(subRows.map((s) => [s.milestoneId, s]));

  // Sprint 39 — peer review aggregation across all milestones in
  // this enrollment. Single GROUP BY across the submission set.
  const submissionIds = subRows.map((s) => s.id);
  const reviewAgg =
    submissionIds.length > 0
      ? db
          .select({
            n: sql<number>`COUNT(*)`,
            endorsed: sql<number>`SUM(CASE WHEN ${capstonePeerReviews.status} = 'endorsed' THEN 1 ELSE 0 END)`,
            avg: sql<number>`AVG(${capstonePeerReviews.score})`,
          })
          .from(capstonePeerReviews)
          .where(inArray(capstonePeerReviews.submissionId, submissionIds))
          .get()
      : { n: 0, endorsed: 0, avg: null };
  const totalReviews = Number(reviewAgg?.n ?? 0);
  const totalEndorsed = Number(reviewAgg?.endorsed ?? 0);
  const averageScore = totalReviews > 0 ? Number(reviewAgg?.avg ?? 0) : null;

  const milestones: TranscriptManifest["milestones"] = milestoneRows.map(
    (m) => {
      const sub = subByMilestone.get(m.id);
      let score: number | null = null;
      if (sub?.aiGradeJson) {
        try {
          const grade = JSON.parse(sub.aiGradeJson);
          if (typeof grade?.totalScore === "number") {
            score = grade.totalScore;
          } else if (typeof grade?.score === "number") {
            score = grade.score;
          }
        } catch {
          // ignore malformed grade payloads
        }
      }
      return {
        title: m.title,
        status:
          (sub?.status as "passed" | "needs_revision" | "pending" | undefined) ??
          "pending",
        score,
        submittedAt: sub?.submittedAt ?? enrollment.completedAt!,
        gradedAt: sub?.gradedAt ?? null,
      };
    },
  );

  return {
    issuer: ISSUER,
    artifactUrl: `https://${ISSUER}/capstones/c/${artifactSlug}`,
    artifactPageSlug: artifactSlug,
    capstone: {
      slug: cap.slug,
      title: cap.title,
      version: cap.currentVersion,
    },
    learner: {
      username: learner.username,
      displayName: learner.displayName,
    },
    milestones,
    startedAt: enrollment.startedAt,
    completedAt: enrollment.completedAt,
    issuedAt: new Date().toISOString(),
    peerReviews: {
      totalReviews,
      totalEndorsed,
      averageScore,
    },
  };
}

// Phase 31A — close the misconception loop.
//
// tutorModes.ts (misconception mode) flips active→coached;
// me.ts flips →dismissed (manual). Nothing ever flips →resolved,
// so the diagnostic loop never closes. This module is the only
// writer of status='resolved': it requires *proof* — a recent
// passing quiz on the concept's node, or a passing AI grade on a
// misconception-probing answer (the caller grades it server-side
// and passes the score in, so it's trusted). Idempotent.

import { and, eq } from "drizzle-orm";
import { getDb, misconceptionDiagnoses, userProgress } from "@axiomic/db";

// Module-top thresholds (mirrors knowledgeMri / reviewerTrust
// constant style so they move without touching the logic).
export const QUIZ_PROOF_THRESHOLD = 0.8;
export const ESSAY_PROOF_THRESHOLD = 0.75;

export type ResolutionProof =
  | { kind: "quiz"; nodeId: string }
  | { kind: "essay"; score: number }; // normalized 0..1, graded server-side

export interface ResolveResult {
  resolved: boolean;
  // true when the diagnosis was already 'resolved' | 'dismissed'
  alreadyTerminal: boolean;
  // true when the id doesn't exist / isn't the caller's
  notFound: boolean;
  reason: string;
}

export function resolveMisconceptionIfProven(
  userId: string,
  diagnosisId: string,
  proof: ResolutionProof,
): ResolveResult {
  const db = getDb();
  const row = db
    .select({
      id: misconceptionDiagnoses.id,
      userId: misconceptionDiagnoses.userId,
      status: misconceptionDiagnoses.status,
    })
    .from(misconceptionDiagnoses)
    .where(eq(misconceptionDiagnoses.id, diagnosisId))
    .get();
  if (!row || row.userId !== userId) {
    return {
      resolved: false,
      alreadyTerminal: false,
      notFound: true,
      reason: "not found",
    };
  }
  if (row.status === "resolved" || row.status === "dismissed") {
    return {
      resolved: false,
      alreadyTerminal: true,
      notFound: false,
      reason: `already ${row.status}`,
    };
  }

  let pass = false;
  let reason = "";
  if (proof.kind === "quiz") {
    // Trust the DB, never a client-supplied score.
    const up = db
      .select({ quizScore: userProgress.quizScore })
      .from(userProgress)
      .where(
        and(
          eq(userProgress.userId, userId),
          eq(userProgress.nodeId, proof.nodeId),
        ),
      )
      .get();
    const q = up?.quizScore ?? null;
    pass = q != null && q >= QUIZ_PROOF_THRESHOLD;
    reason = pass
      ? `quiz ${Math.round((q as number) * 100)}% ≥ ${Math.round(QUIZ_PROOF_THRESHOLD * 100)}%`
      : "no qualifying quiz proof on the concept";
  } else {
    pass = proof.score >= ESSAY_PROOF_THRESHOLD;
    reason = pass
      ? `answer ${proof.score.toFixed(2)} ≥ ${ESSAY_PROOF_THRESHOLD}`
      : `answer ${proof.score.toFixed(2)} < ${ESSAY_PROOF_THRESHOLD}`;
  }

  if (!pass) {
    return {
      resolved: false,
      alreadyTerminal: false,
      notFound: false,
      reason,
    };
  }

  db.update(misconceptionDiagnoses)
    .set({ status: "resolved", resolvedAt: new Date().toISOString() })
    .where(
      and(
        eq(misconceptionDiagnoses.id, diagnosisId),
        eq(misconceptionDiagnoses.userId, userId),
      ),
    )
    .run();
  return {
    resolved: true,
    alreadyTerminal: false,
    notFound: false,
    reason,
  };
}

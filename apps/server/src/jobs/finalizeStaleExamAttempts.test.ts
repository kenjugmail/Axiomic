// Phase 37 — the stale-finalize job must not clobber an attempt
// that the student's own submit path finalized during the job's
// (awaited) essay-grading window. The fix: re-check completedAt
// per attempt + an atomic conditional UPDATE.

import { describe, test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getDb, exams, examAttempts, users } from "@axiomic/db";
import { finalizeStaleExamAttemptsJob } from "./finalizeStaleExamAttempts";
import { registerJob, runJobNow } from "../lib/jobs";

registerJob(finalizeStaleExamAttemptsJob);
const run = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function makeExam(): string {
  const id = randomUUID();
  getDb()
    .insert(exams)
    .values({
      id,
      slug: `race-exam-${run}-${Math.random().toString(36).slice(2, 6)}`,
      title: "Race Exam",
      shortName: "RX",
      totalDurationMinutes: 60,
      scoringJson: "{}",
    })
    .run();
  return id;
}

function aUserId(): string {
  const u = getDb().select({ id: users.id }).from(users).limit(1).get();
  return u!.id;
}

const PAST = new Date(Date.now() - 3 * 60 * 60_000).toISOString();

describe("finalizeStaleExamAttempts race (Phase 37)", () => {
  test("does NOT overwrite an attempt finalized concurrently", async () => {
    const id = randomUUID();
    const submittedAt = new Date().toISOString();
    // The student's submit won the race: completedAt + real score set.
    getDb()
      .insert(examAttempts)
      .values({
        id,
        userId: aUserId(),
        examId: makeExam(),
        mode: "full_mock",
        startedAt: PAST,
        expiresAt: PAST, // expired ⇒ inside the job's stale window
        completedAt: submittedAt,
        scoreRaw: 999, // sentinel: the student's real score
        answersJson: '{"sections":[]}',
      })
      .run();

    await runJobNow("finalize_stale_exam_attempts");

    const row = getDb()
      .select({
        completedAt: examAttempts.completedAt,
        scoreRaw: examAttempts.scoreRaw,
      })
      .from(examAttempts)
      .where(eq(examAttempts.id, id))
      .get();
    expect(row?.completedAt).toBe(submittedAt); // untouched
    expect(row?.scoreRaw).toBe(999); // student's score preserved
  });

  test("still finalizes a genuinely stale (unsubmitted) attempt", async () => {
    const id = randomUUID();
    getDb()
      .insert(examAttempts)
      .values({
        id,
        userId: aUserId(),
        examId: makeExam(),
        mode: "full_mock",
        startedAt: PAST,
        expiresAt: PAST,
        completedAt: null,
        answersJson: '{"sections":[]}',
      })
      .run();

    const res = await runJobNow("finalize_stale_exam_attempts");
    expect(res.itemsProcessed ?? 0).toBeGreaterThanOrEqual(1);

    const row = getDb()
      .select({ completedAt: examAttempts.completedAt })
      .from(examAttempts)
      .where(eq(examAttempts.id, id))
      .get();
    expect(row?.completedAt).toBeTruthy(); // job finalized it
  });
});

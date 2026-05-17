// Phase 28E — longitudinal mastery snapshots + readiness model.
//
// recordMasterySnapshot() upserts one row per user per UTC day
// (idempotent), called when the Knowledge MRI builds so the data
// accumulates at zero extra user cost. buildReadiness() fits a
// simple linear trend over recent snapshots to project a
// "ready in ~N days" estimate + a dated study plan derived from
// the user's active weakness diagnoses.

import { and, asc, eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  getDb,
  masterySnapshots,
  misconceptionDiagnoses,
  wikiPages,
} from "@axiomic/db";
import type { KnowledgeMri } from "@axiomic/types";

export function recordMasterySnapshot(
  userId: string,
  mri: KnowledgeMri,
): void {
  const db = getDb();
  const capturedOn = new Date().toISOString().slice(0, 10);
  const existing = db
    .select({ id: masterySnapshots.id })
    .from(masterySnapshots)
    .where(
      and(
        eq(masterySnapshots.userId, userId),
        eq(masterySnapshots.capturedOn, capturedOn),
      ),
    )
    .get();
  const row = {
    masteredCount: mri.overall.mastered,
    inProgressCount: mri.overall.inProgress,
    untouchedCount: mri.overall.untouched,
    weakConceptCount: mri.overall.activeDiagnoses,
    // avgQuizScore isn't on the MRI overall; leave null for v1.
    avgQuizScore: null as number | null,
  };
  if (existing) {
    db.update(masterySnapshots)
      .set(row)
      .where(eq(masterySnapshots.id, existing.id))
      .run();
  } else {
    db.insert(masterySnapshots)
      .values({
        id: randomUUID(),
        userId,
        capturedOn,
        capturedAt: new Date().toISOString(),
        ...row,
      })
      .run();
  }
}

export interface ReadinessReport {
  // Mastered concepts gained per day, least-squares slope over the
  // available snapshots. 0 when fewer than 2 snapshots.
  velocityPerDay: number;
  snapshots: Array<{ capturedOn: string; mastered: number }>;
  // Active weakness concepts blocking forward progress.
  weakConcepts: number;
  // Null when velocity is non-positive (can't project) or there's
  // nothing left to clear.
  estimatedReadyOn: string | null;
  // Dated checklist: each active weak concept with a target date
  // spaced by the current velocity.
  plan: Array<{
    conceptSlug: string;
    conceptTitle: string | null;
    targetDate: string;
  }>;
}

function leastSquaresSlope(
  points: Array<{ x: number; y: number }>,
): number {
  const n = points.length;
  if (n < 2) return 0;
  const sx = points.reduce((s, p) => s + p.x, 0);
  const sy = points.reduce((s, p) => s + p.y, 0);
  const sxx = points.reduce((s, p) => s + p.x * p.x, 0);
  const sxy = points.reduce((s, p) => s + p.x * p.y, 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return 0;
  return (n * sxy - sx * sy) / denom;
}

export function buildReadiness(userId: string): ReadinessReport {
  const db = getDb();
  const snaps = db
    .select({
      capturedOn: masterySnapshots.capturedOn,
      mastered: masterySnapshots.masteredCount,
      weak: masterySnapshots.weakConceptCount,
    })
    .from(masterySnapshots)
    .where(eq(masterySnapshots.userId, userId))
    .orderBy(asc(masterySnapshots.capturedOn))
    .all();

  // Days since the first snapshot on the x-axis.
  let velocityPerDay = 0;
  if (snaps.length >= 2) {
    const first = Date.parse(snaps[0]!.capturedOn);
    const pts = snaps.map((s) => ({
      x: (Date.parse(s.capturedOn) - first) / 86_400_000,
      y: s.mastered,
    }));
    velocityPerDay = leastSquaresSlope(pts);
  }

  // Active, un-resolved misconception diagnoses are the concrete
  // blockers. Pull their titles for the dated plan.
  const diagnoses = db
    .select({
      conceptSlug: misconceptionDiagnoses.conceptSlug,
      title: wikiPages.title,
    })
    .from(misconceptionDiagnoses)
    .leftJoin(
      wikiPages,
      eq(misconceptionDiagnoses.conceptSlug, wikiPages.slug),
    )
    .where(
      and(
        eq(misconceptionDiagnoses.userId, userId),
        eq(misconceptionDiagnoses.status, "active"),
      ),
    )
    .all();
  const weakConcepts = diagnoses.length;

  let estimatedReadyOn: string | null = null;
  const plan: ReadinessReport["plan"] = [];
  if (weakConcepts > 0 && velocityPerDay > 0) {
    // Days to clear all blockers at current pace.
    const totalDays = weakConcepts / velocityPerDay;
    const ready = new Date(Date.now() + totalDays * 86_400_000);
    estimatedReadyOn = ready.toISOString().slice(0, 10);
    // Space each concept's target date evenly across that window.
    const step = totalDays / weakConcepts;
    diagnoses.forEach((d, i) => {
      const target = new Date(Date.now() + step * (i + 1) * 86_400_000);
      plan.push({
        conceptSlug: d.conceptSlug,
        conceptTitle: d.title ?? null,
        targetDate: target.toISOString().slice(0, 10),
      });
    });
  } else {
    // No velocity yet (or nothing to clear): still surface the
    // blockers without dates so the user knows what's pending.
    diagnoses.forEach((d) => {
      plan.push({
        conceptSlug: d.conceptSlug,
        conceptTitle: d.title ?? null,
        targetDate: "",
      });
    });
  }

  return {
    velocityPerDay,
    snapshots: snaps.map((s) => ({
      capturedOn: s.capturedOn,
      mastered: s.mastered,
    })),
    weakConcepts,
    estimatedReadyOn,
    plan,
  };
}

// suppress unused import in builds where sql isn't referenced
void sql;

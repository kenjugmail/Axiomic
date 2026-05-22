// Capture a point-in-time lesson-quality snapshot for trend tracking.
// Scores every lesson-kind mastery node from the DB — the same data the
// /admin/lesson-quality dashboard reads — and writes one row per lesson
// into lesson_quality_snapshots, all sharing a single `runAt` batch
// timestamp. The dashboard reads the most recent batch to show each
// lesson's composite delta. Invoked by `bun run snapshot:quality`.

import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb, masteryNodes, lessonQualitySnapshots } from "@axiomic/db";
import { scoreLessonContent, type ScorableLesson } from "./lessonQuality";

export interface QualitySnapshotResult {
  runAt: string;
  count: number;
  avg: number;
}

export function captureQualitySnapshot(): QualitySnapshotResult {
  const db = getDb();
  const rows = db
    .select({
      nodeSlug: masteryNodes.slug,
      lessonData: masteryNodes.lessonData,
    })
    .from(masteryNodes)
    .where(eq(masteryNodes.nodeKind, "lesson"))
    .all();

  const runAt = new Date().toISOString();
  const inserts: (typeof lessonQualitySnapshots.$inferInsert)[] = [];
  for (const r of rows) {
    if (!r.lessonData) continue;
    let parsed: ScorableLesson;
    try {
      parsed = JSON.parse(r.lessonData) as ScorableLesson;
    } catch {
      continue;
    }
    const m = scoreLessonContent(parsed);
    inserts.push({
      id: randomUUID(),
      runAt,
      nodeSlug: r.nodeSlug,
      composite: m.composite,
      totalBodyWords: m.totalBodyWords,
      nameDropCount: m.nameDropCount,
      hasViz: m.hasViz,
      flags: JSON.stringify(m.flags),
    });
  }

  // Chunk to stay well under SQLite's bound-variable limit.
  const CHUNK = 200;
  for (let i = 0; i < inserts.length; i += CHUNK) {
    db.insert(lessonQualitySnapshots).values(inserts.slice(i, i + CHUNK)).run();
  }

  const avg = inserts.length
    ? Math.round(inserts.reduce((s, x) => s + x.composite, 0) / inserts.length)
    : 0;
  return { runAt, count: inserts.length, avg };
}

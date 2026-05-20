// Sprint 74 — SAT seed content invariants.
//
// Catches authoring bugs early: every question must have a
// well-formed options array with a valid correctIndex, every
// section's question count must support the smallest difficulty
// band the adaptive picker reaches for, and the scoring config
// must have monotonic anchor points.

import { describe, test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import {
  examQuestions,
  examSections,
  exams,
  getDb,
} from "@axiomic/db";

interface ScoredAnchor {
  raw: number;
  scaled: number;
}

interface ScoredPercentile {
  scaled: number;
  percentile: number;
}

interface SectionScoring {
  scaledTable: ScoredAnchor[];
  percentileTable?: ScoredPercentile[];
  min: number;
  max: number;
}

interface ScoringConfig {
  sections?: Record<string, SectionScoring>;
  overall?: SectionScoring;
}

describe("SAT seed content (Sprint 74)", () => {
  const db = getDb();
  const sat = db.select().from(exams).where(eq(exams.slug, "sat")).get();

  if (!sat) {
    test.skip("SAT exam not seeded — skipping content validation", () => {});
    return;
  }

  const sections = db
    .select()
    .from(examSections)
    .where(eq(examSections.examId, sat.id))
    .all();

  test("seeded SAT version is 2 or higher", () => {
    expect(sat.contentVersion).toBeGreaterThanOrEqual(2);
  });

  test("SAT has both sections", () => {
    const slugs = sections.map((s) => s.slug).sort();
    expect(slugs).toContain("reading-writing");
    expect(slugs).toContain("math");
  });

  test("each section has at least 30 questions across difficulty 1-5", () => {
    for (const sec of sections) {
      const qs = db
        .select({
          id: examQuestions.id,
          difficulty: examQuestions.difficulty,
        })
        .from(examQuestions)
        .where(eq(examQuestions.sectionId, sec.id))
        .all();
      expect(qs.length).toBeGreaterThanOrEqual(30);
      const byDiff = new Map<number, number>();
      for (const q of qs)
        byDiff.set(q.difficulty, (byDiff.get(q.difficulty) ?? 0) + 1);
      // Adaptive widens outward, but having questions at 1, 3, and 5
      // is the minimum to demonstrate the heuristic.
      expect(byDiff.get(1) ?? 0).toBeGreaterThan(0);
      expect(byDiff.get(3) ?? 0).toBeGreaterThan(0);
      expect(byDiff.get(5) ?? 0).toBeGreaterThan(0);
    }
  });

  test("every SAT question has a well-formed variant payload", () => {
    // Digital-SAT-parity (Phase 7) widened the SAT to include
    // grid_in and multi_select alongside multiple_choice. Each
    // variant has its own answer-key shape, validated below.
    const sectionIds = sections.map((s) => s.id);
    if (sectionIds.length === 0) return;
    const qs = db
      .select({
        id: examQuestions.id,
        sectionId: examQuestions.sectionId,
        type: examQuestions.type,
        optionsJson: examQuestions.optionsJson,
        correctIndex: examQuestions.correctIndex,
        acceptedAnswersJson: examQuestions.acceptedAnswersJson,
        correctIndexesJson: examQuestions.correctIndexesJson,
      })
      .from(examQuestions)
      .all()
      .filter((q) => sectionIds.includes(q.sectionId));
    expect(qs.length).toBeGreaterThan(0);
    for (const q of qs) {
      if (q.type === "multiple_choice") {
        const opts = JSON.parse(q.optionsJson);
        expect(Array.isArray(opts)).toBe(true);
        expect(opts.length).toBeGreaterThanOrEqual(2);
        expect(opts.length).toBeLessThanOrEqual(6);
        expect(q.correctIndex).toBeGreaterThanOrEqual(0);
        expect(q.correctIndex).toBeLessThan(opts.length);
        for (const o of opts) {
          expect(typeof o.label).toBe("string");
          expect(typeof o.text).toBe("string");
        }
      } else if (q.type === "grid_in") {
        expect(q.acceptedAnswersJson).toBeTruthy();
        const accepted = JSON.parse(q.acceptedAnswersJson!);
        expect(Array.isArray(accepted)).toBe(true);
        expect(accepted.length).toBeGreaterThanOrEqual(1);
        for (const a of accepted) expect(typeof a).toBe("string");
      } else if (q.type === "multi_select") {
        const opts = JSON.parse(q.optionsJson);
        expect(Array.isArray(opts)).toBe(true);
        expect(opts.length).toBeGreaterThanOrEqual(2);
        expect(q.correctIndexesJson).toBeTruthy();
        const correctIxs = JSON.parse(q.correctIndexesJson!);
        expect(Array.isArray(correctIxs)).toBe(true);
        expect(correctIxs.length).toBeGreaterThanOrEqual(1);
        for (const ix of correctIxs) {
          expect(typeof ix).toBe("number");
          expect(ix).toBeGreaterThanOrEqual(0);
          expect(ix).toBeLessThan(opts.length);
        }
      } else {
        throw new Error(`Unexpected SAT question type: ${q.type}`);
      }
    }
  });

  test("scoring tables are monotonic", () => {
    const scoring = JSON.parse(sat.scoringJson) as ScoringConfig;
    expect(scoring.sections).toBeDefined();
    expect(scoring.overall).toBeDefined();
    const monotonicAsc = (
      arr: Array<{ raw?: number; scaled?: number; percentile?: number }>,
      key: "raw" | "scaled",
    ): boolean => {
      for (let i = 1; i < arr.length; i++) {
        if ((arr[i] as any)[key] < (arr[i - 1] as any)[key]) return false;
      }
      return true;
    };
    const sectionsCfg = scoring.sections!;
    for (const [, cfg] of Object.entries(sectionsCfg)) {
      const sortedScaled = [...cfg.scaledTable].sort((a, b) => a.raw - b.raw);
      expect(monotonicAsc(sortedScaled, "scaled")).toBe(true);
      if (cfg.percentileTable) {
        const sortedPct = [...cfg.percentileTable].sort(
          (a, b) => a.scaled - b.scaled,
        );
        for (let i = 1; i < sortedPct.length; i++) {
          expect(sortedPct[i].percentile).toBeGreaterThanOrEqual(
            sortedPct[i - 1].percentile,
          );
        }
      }
    }
  });

  test("SAT overall scoring spans 400-1600", () => {
    const scoring = JSON.parse(sat.scoringJson) as ScoringConfig;
    expect(scoring.overall?.min).toBe(400);
    expect(scoring.overall?.max).toBe(1600);
  });
});

// Sprint 76 — MCAT seed content invariants.

import { describe, test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import {
  examQuestions,
  examSections,
  exams,
  getDb,
} from "@axiomic/db";

describe("MCAT seed content (Sprint 76)", () => {
  const db = getDb();
  const mcat = db.select().from(exams).where(eq(exams.slug, "mcat")).get();

  if (!mcat) {
    test.skip("MCAT not seeded — skipping", () => {});
    return;
  }

  test("MCAT has all four real sections", () => {
    const sections = db
      .select({ slug: examSections.slug })
      .from(examSections)
      .where(eq(examSections.examId, mcat.id))
      .all();
    const slugs = sections.map((s) => s.slug).sort();
    expect(slugs).toContain("bio-biochem");
    expect(slugs).toContain("chem-phys");
    expect(slugs).toContain("psych-soc");
    expect(slugs).toContain("cars");
  });

  test("each section has at least 12 questions", () => {
    const sections = db
      .select()
      .from(examSections)
      .where(eq(examSections.examId, mcat.id))
      .all();
    for (const sec of sections) {
      const qs = db
        .select({ id: examQuestions.id })
        .from(examQuestions)
        .where(eq(examQuestions.sectionId, sec.id))
        .all();
      expect(qs.length).toBeGreaterThanOrEqual(12);
    }
  });

  test("MCAT scoring spans 472-528 with 118-132 per section", () => {
    interface SectionScoring {
      min: number;
      max: number;
    }
    interface ScoringConfig {
      sections?: Record<string, SectionScoring>;
      overall?: SectionScoring;
    }
    const scoring = JSON.parse(mcat.scoringJson) as ScoringConfig;
    expect(scoring.overall?.min).toBe(472);
    expect(scoring.overall?.max).toBe(528);
    for (const cfg of Object.values(scoring.sections ?? {})) {
      expect(cfg.min).toBe(118);
      expect(cfg.max).toBe(132);
    }
  });

  test("every MCAT question is multiple_choice with valid correctIndex", () => {
    const sections = db
      .select({ id: examSections.id })
      .from(examSections)
      .where(eq(examSections.examId, mcat.id))
      .all();
    const sectionIds = sections.map((s) => s.id);
    const qs = db
      .select({
        id: examQuestions.id,
        sectionId: examQuestions.sectionId,
        type: examQuestions.type,
        optionsJson: examQuestions.optionsJson,
        correctIndex: examQuestions.correctIndex,
      })
      .from(examQuestions)
      .all()
      .filter((q) => sectionIds.includes(q.sectionId));
    expect(qs.length).toBeGreaterThan(50);
    for (const q of qs) {
      expect(q.type).toBe("multiple_choice");
      const opts = JSON.parse(q.optionsJson);
      expect(Array.isArray(opts)).toBe(true);
      expect(opts.length).toBeGreaterThanOrEqual(2);
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctIndex).toBeLessThan(opts.length);
    }
  });
});

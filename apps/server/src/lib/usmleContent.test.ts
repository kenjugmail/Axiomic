// Sprint 77 — USMLE Step 1, Step 2 CK, Step 3 seed content invariants.

import { describe, test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import {
  examQuestions,
  examSections,
  exams,
  getDb,
} from "@axiomic/db";

interface SectionScoring {
  min: number;
  max: number;
}
interface ScoringConfig {
  sections?: Record<string, SectionScoring>;
  overall?: SectionScoring;
}

function describeStep(slug: string, expectedSections: string[]) {
  describe(`USMLE ${slug} seed content (Sprint 77)`, () => {
    const db = getDb();
    const exam = db.select().from(exams).where(eq(exams.slug, slug)).get();

    if (!exam) {
      test.skip(`${slug} not seeded — skipping`, () => {});
      return;
    }

    test("exam has expected sections", () => {
      const sections = db
        .select({ slug: examSections.slug })
        .from(examSections)
        .where(eq(examSections.examId, exam.id))
        .all();
      const slugs = sections.map((s) => s.slug);
      for (const expected of expectedSections) {
        expect(slugs).toContain(expected);
      }
    });

    test("scoring spans 1-300 (USMLE 3-digit scale)", () => {
      const scoring = JSON.parse(exam.scoringJson) as ScoringConfig;
      expect(scoring.overall?.min).toBe(1);
      expect(scoring.overall?.max).toBe(300);
      for (const cfg of Object.values(scoring.sections ?? {})) {
        expect(cfg.min).toBe(1);
        expect(cfg.max).toBe(300);
      }
    });

    test("each section has at least 6 questions", () => {
      const sections = db
        .select()
        .from(examSections)
        .where(eq(examSections.examId, exam.id))
        .all();
      for (const sec of sections) {
        const qs = db
          .select({ id: examQuestions.id })
          .from(examQuestions)
          .where(eq(examQuestions.sectionId, sec.id))
          .all();
        expect(qs.length).toBeGreaterThanOrEqual(6);
      }
    });

    test("every question is multiple_choice with valid correctIndex", () => {
      const sections = db
        .select({ id: examSections.id })
        .from(examSections)
        .where(eq(examSections.examId, exam.id))
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
      expect(qs.length).toBeGreaterThan(20);
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
}

describeStep("usmle-step-1", [
  "anatomy",
  "behavioral",
  "biochem",
  "microbiology",
  "pathology",
  "pharmacology",
  "physiology",
]);
describeStep("usmle-step-2-ck", [
  "internal-medicine",
  "surgery",
  "pediatrics",
  "ob-gyn",
  "psychiatry",
]);
describeStep("usmle-step-3", [
  "foundations",
  "advanced-cm",
  "biostatistics",
]);

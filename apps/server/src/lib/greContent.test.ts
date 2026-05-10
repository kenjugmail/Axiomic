// Sprint 75 — GRE seed content invariants.

import { describe, test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import {
  examQuestions,
  examSections,
  exams,
  getDb,
} from "@axiomic/db";

describe("GRE seed content (Sprint 75)", () => {
  const db = getDb();
  const gre = db.select().from(exams).where(eq(exams.slug, "gre")).get();

  if (!gre) {
    test.skip("GRE not seeded — skipping", () => {});
    return;
  }

  test("GRE has three sections including analytical-writing", () => {
    const sections = db
      .select({ slug: examSections.slug })
      .from(examSections)
      .where(eq(examSections.examId, gre.id))
      .all();
    const slugs = sections.map((s) => s.slug).sort();
    expect(slugs).toContain("verbal");
    expect(slugs).toContain("quant");
    expect(slugs).toContain("analytical-writing");
  });

  test("analytical-writing section contains essay-type questions only", () => {
    const sections = db
      .select()
      .from(examSections)
      .where(eq(examSections.examId, gre.id))
      .all();
    const aw = sections.find((s) => s.slug === "analytical-writing");
    expect(aw).toBeDefined();
    const qs = db
      .select({
        id: examQuestions.id,
        type: examQuestions.type,
        rubricMd: examQuestions.rubricMd,
        maxEssayScore: examQuestions.maxEssayScore,
      })
      .from(examQuestions)
      .where(eq(examQuestions.sectionId, aw!.id))
      .all();
    expect(qs.length).toBeGreaterThanOrEqual(2);
    for (const q of qs) {
      expect(q.type).toBe("essay");
      expect(q.rubricMd).not.toBeNull();
      expect((q.rubricMd ?? "").length).toBeGreaterThan(50);
      expect(q.maxEssayScore).toBe(6);
    }
  });

  test("verbal + quant sections are multiple_choice with valid correctIndex", () => {
    const sections = db
      .select()
      .from(examSections)
      .where(eq(examSections.examId, gre.id))
      .all();
    for (const sec of sections.filter((s) => s.slug !== "analytical-writing")) {
      const qs = db
        .select()
        .from(examQuestions)
        .where(eq(examQuestions.sectionId, sec.id))
        .all();
      expect(qs.length).toBeGreaterThanOrEqual(20);
      for (const q of qs) {
        expect(q.type).toBe("multiple_choice");
        const opts = JSON.parse(q.optionsJson);
        expect(Array.isArray(opts)).toBe(true);
        expect(opts.length).toBeGreaterThanOrEqual(2);
        expect(q.correctIndex).toBeGreaterThanOrEqual(0);
        expect(q.correctIndex).toBeLessThan(opts.length);
      }
    }
  });
});

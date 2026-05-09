// Sprint 73 — examScoring tests.

import { describe, test, expect } from "bun:test";
import {
  rawToScaled,
  scaledToPercentile,
  scoreExam,
  type ExamScoringConfig,
  type SectionScoring,
} from "./examScoring";

const sectionConfig: SectionScoring = {
  min: 200,
  max: 800,
  scaledTable: [
    { raw: 0, scaled: 200 },
    { raw: 27, scaled: 500 },
    { raw: 54, scaled: 800 },
  ],
  percentileTable: [
    { scaled: 200, percentile: 1 },
    { scaled: 500, percentile: 50 },
    { scaled: 800, percentile: 99 },
  ],
};

describe("examScoring (Sprint 73)", () => {
  test("rawToScaled hits anchor points exactly", () => {
    expect(rawToScaled(0, sectionConfig)).toBe(200);
    expect(rawToScaled(27, sectionConfig)).toBe(500);
    expect(rawToScaled(54, sectionConfig)).toBe(800);
  });

  test("rawToScaled interpolates linearly between anchors", () => {
    // Halfway between raw=0 (200) and raw=27 (500) → 350.
    expect(rawToScaled(13.5, sectionConfig)).toBe(350);
  });

  test("rawToScaled clamps below min and above max", () => {
    expect(rawToScaled(-10, sectionConfig)).toBe(200);
    expect(rawToScaled(1000, sectionConfig)).toBe(800);
  });

  test("scaledToPercentile returns null when no percentile table", () => {
    const cfg: SectionScoring = {
      min: 0,
      max: 100,
      scaledTable: [
        { raw: 0, scaled: 0 },
        { raw: 100, scaled: 100 },
      ],
    };
    expect(scaledToPercentile(50, cfg)).toBe(null);
  });

  test("scaledToPercentile interpolates", () => {
    // Halfway between 200 (1) and 500 (50) → ~25.
    expect(scaledToPercentile(350, sectionConfig)).toBeGreaterThanOrEqual(20);
    expect(scaledToPercentile(350, sectionConfig)).toBeLessThanOrEqual(30);
  });

  test("scoreExam aggregates per-section + computes overall", () => {
    const config: ExamScoringConfig = {
      sections: { rw: sectionConfig, math: sectionConfig },
      overall: {
        min: 400,
        max: 1600,
        scaledTable: [
          { raw: 400, scaled: 400 },
          { raw: 1600, scaled: 1600 },
        ],
        percentileTable: [
          { scaled: 400, percentile: 1 },
          { scaled: 1000, percentile: 50 },
          { scaled: 1600, percentile: 99 },
        ],
      },
    };
    const r = scoreExam(
      [
        { sectionSlug: "rw", raw: 27 },
        { sectionSlug: "math", raw: 54 },
      ],
      config,
    );
    expect(r.sections.rw.scaled).toBe(500);
    expect(r.sections.math.scaled).toBe(800);
    expect(r.scaledTotal).toBe(1300);
    expect(r.rawTotal).toBe(81);
    expect(r.percentileTotal).not.toBeNull();
  });

  test("unknown section passes through scaled = raw + null percentile", () => {
    const config: ExamScoringConfig = {
      sections: { rw: sectionConfig },
    };
    const r = scoreExam(
      [
        { sectionSlug: "rw", raw: 27 },
        { sectionSlug: "ghost", raw: 5 },
      ],
      config,
    );
    expect(r.sections.ghost.scaled).toBe(5);
    expect(r.sections.ghost.percentile).toBeNull();
  });

  test("empty input yields zeros", () => {
    const r = scoreExam([], {});
    expect(r.scaledTotal).toBe(0);
    expect(r.rawTotal).toBe(0);
    expect(r.sections).toEqual({});
  });
});

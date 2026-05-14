// Phase 21B — generator-level tests. The mock provider doesn't
// return parseable JSON for our schema, so every test path lands
// on the defaultVariant fallback. That fallback is itself the
// guarantee we care about: failure modes never explode + always
// hand the route a usable variant.

import { describe, test, expect } from "bun:test";
import {
  generateAssignmentVariant,
  variantSeed,
} from "./generateAssignmentVariant";

const baseTask = {
  title: "Explain why softmax temperature matters",
  descriptionMd:
    "Write 200 words on how the temperature parameter changes the output distribution of a softmax. Use a worked example.",
};

describe("generateAssignmentVariant (Phase 21B)", () => {
  test("returns a valid variant shape even when AI output isn't parseable", async () => {
    const result = await generateAssignmentVariant({
      baseTask,
      classMeta: { level: "undergrad", title: "Test class" },
      weakness: {
        topics: [
          {
            conceptSlug: "softmax",
            conceptTitle: "Softmax",
            severity: 1,
            signals: [
              {
                kind: "misconception",
                evidence: "Temperature is mistakenly inverted",
                recency: "2026-05-01T00:00:00.000Z",
              },
            ],
          },
        ],
        strengths: [],
        level: "undergrad",
      },
      seed: variantSeed("task-1", "user-1"),
    });
    expect(typeof result.promptMd).toBe("string");
    expect(result.promptMd.length).toBeGreaterThan(20);
    expect(result.rubric.criteria.length).toBeGreaterThan(0);
    expect(result.rubric.passingScore).toBeGreaterThan(0);
    expect(result.rubric.passingScore).toBeLessThanOrEqual(1);
    // Mock provider produces generic prose, not our JSON shape; the
    // generator should have fallen back to the default variant.
    expect(result.aiBacked).toBe(false);
  });

  test("default variant mentions weakness topics when present", async () => {
    const result = await generateAssignmentVariant({
      baseTask,
      classMeta: { level: "undergrad", title: "Test class" },
      weakness: {
        topics: [
          {
            conceptSlug: "softmax",
            conceptTitle: "Softmax temperature",
            severity: 1,
            signals: [],
          },
        ],
        strengths: [],
        level: "undergrad",
      },
      seed: "seed-1",
    });
    expect(result.promptMd).toContain("Softmax temperature");
  });

  test("empty weakness profile still yields a usable default variant", async () => {
    const result = await generateAssignmentVariant({
      baseTask,
      classMeta: { level: null, title: "Test class" },
      weakness: { topics: [], strengths: [], level: null },
      seed: "seed-2",
    });
    expect(result.promptMd.length).toBeGreaterThan(20);
    expect(result.rubric.criteria.length).toBeGreaterThan(0);
    expect(result.aiBacked).toBe(false);
  });

  test("seed function is deterministic for a (task, student) pair", () => {
    expect(variantSeed("a", "b")).toBe(variantSeed("a", "b"));
    expect(variantSeed("a", "b")).not.toBe(variantSeed("a", "c"));
  });
});

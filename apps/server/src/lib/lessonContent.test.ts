import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { validateLesson } from "./lessonSchema";

// Schema validator for hand-authored lesson JSONs in
// seed-content/lessons/. Loaded at seed-time by loadLessonData
// (packages/db/src/seed.ts:1566) keyed by node slug. We don't
// re-implement the runtime parser here — we just check the structural
// invariants that matter so an agent-generated lesson can't silently
// land in seed and 500 the player.
//
// The actual validator lives in ./lessonSchema.ts so the authoring
// route can share it.

const LESSONS_DIR = join(import.meta.dir, "../../../../seed-content/lessons");

function listLessonFiles(): string[] {
  try {
    return readdirSync(LESSONS_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
}

describe("seed-content/lessons schema validation", () => {
  const files = listLessonFiles();

  test("lessons directory is non-empty", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    test(`${file} parses + conforms to schema`, () => {
      const raw = readFileSync(join(LESSONS_DIR, file), "utf-8");
      const json = JSON.parse(raw);
      const slug = file.replace(/\.json$/, "");
      const warnings = validateLesson(json, slug);
      if (warnings.length > 0) {
        throw new Error(`${file}:\n  ${warnings.join("\n  ")}`);
      }
      expect(warnings).toEqual([]);
    });
  }
});

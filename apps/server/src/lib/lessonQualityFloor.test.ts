// CI regression guard for lesson content quality. Walks every lesson
// JSON in seed-content/lessons/ and asserts (a) it parses (no
// INVALID_JSON) and (b) it scores at or above a composite floor on the
// shared rubric. This fails the build the moment an edit drops a lesson
// below the floor or breaks its JSON — the auditor (`bun run
// audit:lessons`) reports trends; this test enforces the line.

import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync } from "fs";
import { resolve, join } from "path";
import { scoreLessonContent, type ScorableLesson } from "./lessonQuality";

// Current corpus minimum is comfortably in the 70s; 60 leaves headroom
// for legitimately lean lessons while still catching real regressions.
const FLOOR = 60;
const LESSONS_DIR = resolve(import.meta.dir, "../../../../seed-content/lessons");

const files = readdirSync(LESSONS_DIR).filter((f) => f.endsWith(".json"));

describe("lesson quality floor", () => {
  test("the lesson corpus is non-trivial", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  test("every lesson file is valid JSON", () => {
    const broken: string[] = [];
    for (const f of files) {
      try {
        JSON.parse(readFileSync(join(LESSONS_DIR, f), "utf-8"));
      } catch {
        broken.push(f);
      }
    }
    expect(broken).toEqual([]);
  });

  test(`every lesson scores at or above the floor (${FLOOR})`, () => {
    const below: string[] = [];
    for (const f of files) {
      const lesson = JSON.parse(
        readFileSync(join(LESSONS_DIR, f), "utf-8"),
      ) as ScorableLesson;
      const { composite } = scoreLessonContent(lesson);
      if (composite < FLOOR) below.push(`${f} (${composite})`);
    }
    expect(below).toEqual([]);
  });
});

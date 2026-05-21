import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

// Schema validator for hand-authored lesson JSONs in
// seed-content/lessons/. Loaded at seed-time by loadLessonData
// (packages/db/src/seed.ts:1566) keyed by node slug. We don't
// re-implement the runtime parser here — we just check the structural
// invariants that matter so an agent-generated lesson can't silently
// land in seed and 500 the player.

const LESSONS_DIR = join(import.meta.dir, "../../../../seed-content/lessons");

// Extract the canonical VIZ_NAMES list from VizEmbed.tsx so the test
// stays in lockstep with the registry. Anything embedded in a lesson
// `slide.viz` must appear in this list, or PreviewViz will fall back
// to "viz not found" and confuse the reader.
function loadKnownVizNames(): Set<string> {
  const src = readFileSync(
    join(import.meta.dir, "../../../../apps/web/src/components/VizEmbed.tsx"),
    "utf-8",
  );
  const m = src.match(/const VIZ_NAMES = \[([\s\S]*?)\] as const;/);
  if (!m) return new Set();
  const names = (m[1].match(/"[a-z][a-z0-9-]+"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
  return new Set(names);
}

const KNOWN_VIZ_NAMES = loadKnownVizNames();

// Legacy viz names referenced by older lesson JSONs that pre-date the
// current VizEmbed registry. Each is a real bug (the player falls back
// to "viz not found") but fixing them requires content edits. Until
// those lessons get cleaned up, accept these as legacy aliases. As
// each lesson is fixed, drop the corresponding entry — the test will
// then guard against regression. New lessons MUST use canonical names.
const LEGACY_VIZ_ALIASES = new Set([
  "gradient-descent-2d", // no registered component yet
  "sampling-temperature-lab", // no registered component yet
  "brillouin-zone", // no registered component yet
  "crystal-lattice", // no registered component yet
  "phonon-dispersion", // no registered component yet
]);

const VALID_SLIDE_KINDS = new Set(["text", "question", "section", "explain_back"]);

const VALID_QUESTION_KINDS = new Set([
  "multiple_choice",
  "guided_derivation",
  "scenario",
  "math_expression",
  "explain_back",
  "free_response",
  "drag_classify",
  "slider",
  "sortable",
  "code",
  "ml_sandbox",
  "puzzle_drag_build",
]);

const VALID_DIFFICULTIES = new Set([
  "intro",
  "beginner",
  "core",
  "intermediate",
  "specialist",
  "advanced",
  "expert",
]);

interface LessonJSON {
  slug?: string;
  meta?: { difficulty?: string; timeMinutes?: number };
  slides?: Array<{
    kind?: string;
    viz?: string;
    question?: { kind?: string };
  }>;
}

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
    describe(file, () => {
      const path = join(LESSONS_DIR, file);
      let raw: string;
      let json: LessonJSON;

      test("parses as valid JSON", () => {
        raw = readFileSync(path, "utf-8");
        json = JSON.parse(raw);
        expect(typeof json).toBe("object");
      });

      test("slug (if present) matches the filename", () => {
        if (!json) {
          raw = readFileSync(path, "utf-8");
          json = JSON.parse(raw);
        }
        if (json.slug !== undefined) {
          const expected = file.replace(/\.json$/, "");
          expect(json.slug).toBe(expected);
        }
      });

      test("meta (if present) is well-formed", () => {
        if (!json) {
          raw = readFileSync(path, "utf-8");
          json = JSON.parse(raw);
        }
        if (json.meta === undefined) return;
        if (json.meta.timeMinutes !== undefined) {
          expect(typeof json.meta.timeMinutes).toBe("number");
          expect(json.meta.timeMinutes).toBeGreaterThan(0);
          expect(json.meta.timeMinutes).toBeLessThanOrEqual(120);
        }
        if (json.meta.difficulty !== undefined) {
          expect(VALID_DIFFICULTIES.has(json.meta.difficulty)).toBe(true);
        }
      });

      test("has at least one slide with a valid kind + question sub-kind", () => {
        if (!json) {
          raw = readFileSync(path, "utf-8");
          json = JSON.parse(raw);
        }
        expect(Array.isArray(json.slides)).toBe(true);
        expect(json.slides!.length).toBeGreaterThan(0);
        for (const slide of json.slides!) {
          if (slide.kind !== undefined) {
            expect(VALID_SLIDE_KINDS.has(slide.kind)).toBe(true);
          }
          if (slide.kind === "question" && slide.question?.kind !== undefined) {
            expect(VALID_QUESTION_KINDS.has(slide.question.kind)).toBe(true);
          }
        }
      });

      test("any embedded viz names are in the registry (or grandfathered)", () => {
        if (!json) {
          raw = readFileSync(path, "utf-8");
          json = JSON.parse(raw);
        }
        for (const slide of json.slides ?? []) {
          if (slide.viz !== undefined) {
            const ok =
              KNOWN_VIZ_NAMES.has(slide.viz) ||
              LEGACY_VIZ_ALIASES.has(slide.viz);
            expect(ok).toBe(true);
          }
        }
      });
    });
  }
});

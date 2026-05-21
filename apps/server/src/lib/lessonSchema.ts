import { readFileSync } from "fs";
import { join } from "path";

// Shared lesson-JSON validators. Extracted from
// apps/server/src/lib/lessonContent.test.ts so the same allow-lists +
// constraints power (a) the static test that runs against every file
// in seed-content/lessons/, and (b) the runtime authoring route that
// validates AI-generated lessons before letting an author save them.
//
// Keeping these in one place means a new slide kind / question kind /
// viz registration only has to be added in one spot.

// Extract the canonical VIZ_NAMES list from VizEmbed.tsx so the
// validator stays in lockstep with the registry. We read the file
// once at module load — it's a few KB, parses in ms, and gives us
// the source of truth without an import dependency from server to web.
function loadKnownVizNames(): Set<string> {
  try {
    const src = readFileSync(
      join(
        import.meta.dir,
        "../../../../apps/web/src/components/VizEmbed.tsx",
      ),
      "utf-8",
    );
    const m = src.match(/const VIZ_NAMES = \[([\s\S]*?)\] as const;/);
    if (!m) return new Set();
    const names = (m[1].match(/"[a-z][a-z0-9-]+"/g) ?? []).map((s) =>
      s.replace(/"/g, ""),
    );
    return new Set(names);
  } catch {
    return new Set();
  }
}

export const KNOWN_VIZ_NAMES = loadKnownVizNames();

// Empty for now — every viz embedded in lesson content currently
// resolves to a registered component. Keep this set as the escape
// hatch for future drift; populate with TODO entries when a lesson
// references a yet-to-be-built viz and you want the test green while
// the component is in flight.
export const LEGACY_VIZ_ALIASES = new Set<string>([]);

export const VALID_SLIDE_KINDS = new Set([
  "text",
  "question",
  "section",
  "explain_back",
]);

export const VALID_QUESTION_KINDS = new Set([
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

export const VALID_DIFFICULTIES = new Set([
  "intro",
  "beginner",
  "core",
  "intermediate",
  "specialist",
  "advanced",
  "expert",
]);

export interface LessonJSON {
  slug?: string;
  meta?: { difficulty?: string; timeMinutes?: number; objectives?: string[]; prereqs?: string[] };
  slides?: Array<{
    kind?: string;
    title?: string;
    body?: string;
    viz?: string;
    vizProps?: Record<string, unknown>;
    question?: { kind?: string; id?: string; question?: string };
  }>;
}

// Validate a parsed lesson object. Returns the list of warnings; an
// empty list means the lesson conforms to the canonical schema.
export function validateLesson(lesson: unknown, fileSlug?: string): string[] {
  const warnings: string[] = [];
  if (typeof lesson !== "object" || lesson === null) {
    warnings.push("lesson is not an object");
    return warnings;
  }
  const j = lesson as LessonJSON;

  if (j.slug !== undefined && fileSlug !== undefined && j.slug !== fileSlug) {
    warnings.push(`slug "${j.slug}" does not match expected slug "${fileSlug}"`);
  }

  if (j.meta !== undefined) {
    if (j.meta.timeMinutes !== undefined) {
      if (typeof j.meta.timeMinutes !== "number") {
        warnings.push("meta.timeMinutes must be a number");
      } else if (j.meta.timeMinutes <= 0 || j.meta.timeMinutes > 120) {
        warnings.push(`meta.timeMinutes=${j.meta.timeMinutes} out of plausible range (1-120)`);
      }
    }
    if (j.meta.difficulty !== undefined && !VALID_DIFFICULTIES.has(j.meta.difficulty)) {
      warnings.push(`meta.difficulty "${j.meta.difficulty}" not in allowed set`);
    }
  }

  if (!Array.isArray(j.slides)) {
    warnings.push("slides must be an array");
    return warnings;
  }
  if (j.slides.length === 0) {
    warnings.push("slides array is empty");
    return warnings;
  }

  for (let i = 0; i < j.slides.length; i++) {
    const s = j.slides[i];
    if (s.kind !== undefined && !VALID_SLIDE_KINDS.has(s.kind)) {
      warnings.push(`slide[${i}].kind "${s.kind}" not in allowed set`);
    }
    if (s.kind === "question" && s.question?.kind !== undefined) {
      if (!VALID_QUESTION_KINDS.has(s.question.kind)) {
        warnings.push(`slide[${i}].question.kind "${s.question.kind}" not in allowed set`);
      }
    }
    if (s.viz !== undefined) {
      const ok = KNOWN_VIZ_NAMES.has(s.viz) || LEGACY_VIZ_ALIASES.has(s.viz);
      if (!ok) {
        warnings.push(`slide[${i}].viz "${s.viz}" not in viz registry`);
      }
    }
  }

  return warnings;
}

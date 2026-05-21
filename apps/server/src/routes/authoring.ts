import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { getAIProvider } from "@axiomic/ai";
import { validateLesson } from "../lib/lessonSchema";
import type { Env } from "../env";

// AI-assisted lesson authoring. POST /api/v1/authoring/lesson with a
// topic + objectives; the route calls the configured AI provider
// (mock/ollama/future-anthropic) to generate a lesson JSON, validates
// it against the same schema the test enforces, and returns it.
//
// The frontend (apps/web/src/pages/admin/AuthorLessonPage.tsx) renders
// the result alongside a PreviewViz live render so authors can iterate
// before committing the file. Save-to-disk is intentionally out of
// scope here — the JSON is returned, the author copies it.

export const authoringRouter = new Hono<Env>();

const authorSchema = z.object({
  nodeSlug: z.string().min(1).max(100).regex(/^[a-z][a-z0-9-]*$/, "lowercase + hyphens"),
  pathSlug: z.string().min(1).max(100).optional(),
  topic: z.string().min(10).max(500),
  objectives: z.array(z.string().min(5).max(200)).min(1).max(8),
  difficulty: z.enum(["intro", "intermediate", "advanced", "expert"]).default("advanced"),
  timeMinutes: z.number().int().min(5).max(60).default(22),
});

function loadReferenceLesson(): string {
  try {
    const path = join(
      import.meta.dir,
      "../../../../seed-content/lessons/structure-and-alphafold.json",
    );
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

function buildSystemPrompt(reference: string): string {
  return `You are a domain-expert tutor authoring a single lesson in the canonical Axiomic lesson schema. Output ONLY valid JSON — no markdown fences, no prose preamble.

The schema is best learned from this canonical reference (a lesson on protein structure + AlphaFold):

${reference}

Key invariants:
- Top-level keys: meta + slides (slug is optional; the system fills it from the filename)
- meta: {timeMinutes (int, 5-60), difficulty ("intro"|"intermediate"|"advanced"|"expert"), objectives (array of strings), prereqs (array of node-slug strings)}
- slides: array of 8 items in this canonical order:
  1. text — first concept ("kind": "text", title, body in markdown)
  2. text — second concept (deeper)
  3. text — third concept (synthesizes 1+2; optionally embeds an interactive viz via {viz, vizProps})
  4. question of kind "guided_derivation" — multi-step derivation with hints + accepts pattern
  5. question of kind "multiple_choice" — 4 options, correctIndex, explanation
  6. question of kind "scenario" — realistic situation, hints, retryUntilCorrect, workedSolution
  7. question of kind "math_expression" — derive/evaluate a formula
  8. question of kind "explain_back" — open-ended "explain to a peer"
- Question IDs follow gd_<topic>_<n>, mc_<topic>_<n>, scn_<topic>_<n>, math_<topic>_<n>, eb_<topic>_<n>
- Body text uses markdown (bold via **x**, code via \`x\`, math via $x$). Real names + dates + citations.
- For text slides, draw on real history of the field, specific researchers, year-published papers, modern frontier work.

Respond with valid JSON matching this schema. No commentary.`;
}

function buildUserPrompt(req: z.infer<typeof authorSchema>): string {
  return `Author a lesson with these parameters:

- nodeSlug: ${req.nodeSlug}
${req.pathSlug ? `- pathSlug: ${req.pathSlug}\n` : ""}- topic: ${req.topic}
- difficulty: ${req.difficulty}
- timeMinutes: ${req.timeMinutes}
- learning objectives:
${req.objectives.map((o, i) => `  ${i + 1}. ${o}`).join("\n")}

Return the lesson JSON now.`;
}

// Try to extract a JSON object from a free-form response. Strips
// markdown fences, leading prose, etc.
function extractJSON(raw: string): unknown | null {
  const trimmed = raw.trim();
  // Strip ```json ... ``` fences if present
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : trimmed;
  // Find first { ... last }
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return null;
  const slice = candidate.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

authoringRouter.post("/lesson", zValidator("json", authorSchema), async (c) => {
  const req = c.req.valid("json");
  const provider = getAIProvider();
  const reference = loadReferenceLesson();
  if (!reference) {
    return c.json(
      { error: "Reference lesson not found; cannot prompt", warnings: [] },
      500,
    );
  }
  const system = buildSystemPrompt(reference);
  const user = buildUserPrompt(req);

  let accumulated = "";
  try {
    await provider.stream({
      system,
      messages: [{ role: "user", content: user }],
      onToken: (t) => {
        accumulated += t;
      },
      signal: c.req.raw.signal,
    });
  } catch (err) {
    return c.json(
      {
        error:
          err instanceof Error
            ? `provider stream failed: ${err.message}`
            : "provider stream failed",
        warnings: [],
        rawOutput: accumulated.slice(0, 2000),
      },
      503,
    );
  }

  const parsed = extractJSON(accumulated);
  if (parsed === null) {
    return c.json(
      {
        error: "Could not parse JSON from provider response",
        warnings: [],
        rawOutput: accumulated.slice(0, 2000),
      },
      422,
    );
  }

  const warnings = validateLesson(parsed, req.nodeSlug);
  return c.json({
    lesson: parsed,
    warnings,
    valid: warnings.length === 0,
    rawLength: accumulated.length,
  });
});

// ---- Streaming variant -----------------------------------------------
//
// Same body shape as POST /lesson, but emits Server-Sent Events as
// the provider streams tokens. The frontend (AuthorLessonPage)
// renders partial output live, then switches to the validated-lesson
// display when the final `done` event arrives. Useful for the
// Anthropic provider where 5-15s of tokens are unbuffered.

authoringRouter.post("/lesson/stream", zValidator("json", authorSchema), (c) => {
  const req = c.req.valid("json");
  const provider = getAIProvider();
  const reference = loadReferenceLesson();
  if (!reference) {
    return c.json({ error: "Reference lesson not found" }, 500);
  }
  const system = buildSystemPrompt(reference);
  const user = buildUserPrompt(req);

  return streamSSE(c, async (stream) => {
    let accumulated = "";
    try {
      await provider.stream({
        system,
        messages: [{ role: "user", content: user }],
        onToken: (t) => {
          accumulated += t;
          // Best-effort emit; if the writer rejects (client gone) we
          // catch on the next iteration via the signal check.
          void stream.writeSSE({ data: JSON.stringify({ token: t }) });
        },
        signal: c.req.raw.signal,
      });
    } catch (err) {
      await stream.writeSSE({
        data: JSON.stringify({
          error: err instanceof Error ? err.message : "provider stream failed",
          rawOutput: accumulated.slice(0, 2000),
        }),
      });
      return;
    }

    const parsed = extractJSON(accumulated);
    if (parsed === null) {
      await stream.writeSSE({
        data: JSON.stringify({
          error: "Could not parse JSON from provider response",
          rawOutput: accumulated.slice(0, 2000),
        }),
      });
      return;
    }
    const warnings = validateLesson(parsed, req.nodeSlug);
    await stream.writeSSE({
      data: JSON.stringify({
        done: true,
        lesson: parsed,
        warnings,
        valid: warnings.length === 0,
        rawLength: accumulated.length,
      }),
    });
  });
});

// ---- Save-to-file ----------------------------------------------------
//
// Closes the AI-authoring loop: instead of copy-pasting the generated
// JSON, the author hits "save" and the server writes the file to
// seed-content/lessons/<nodeSlug>.json. Gated behind DEV_AUTH_BYPASS=1
// because writing arbitrary content to the source tree from a web
// route is dev-time-only — a proper deployment would need an admin
// role check + a different storage backend.

const saveSchema = z.object({
  nodeSlug: z.string().min(1).max(100).regex(/^[a-z][a-z0-9-]*$/, "lowercase + hyphens"),
  lesson: z.unknown(),
  overwrite: z.boolean().default(false),
});

const LESSONS_DIR = resolve(import.meta.dir, "../../../../seed-content/lessons");

authoringRouter.post("/save", zValidator("json", saveSchema), async (c) => {
  if (process.env.DEV_AUTH_BYPASS !== "1") {
    return c.json(
      {
        error:
          "Save-to-file is dev-only. Run the server with DEV_AUTH_BYPASS=1 to enable.",
      },
      403,
    );
  }
  const { nodeSlug, lesson, overwrite } = c.req.valid("json");
  const warnings = validateLesson(lesson, nodeSlug);
  if (warnings.length > 0) {
    return c.json({ error: "Lesson failed schema validation", warnings }, 422);
  }
  const target = join(LESSONS_DIR, `${nodeSlug}.json`);
  // Defense in depth: ensure the resolved path is still inside
  // LESSONS_DIR even though the regex already prevented path traversal.
  if (!target.startsWith(LESSONS_DIR + "/")) {
    return c.json({ error: "Refusing to write outside lessons dir" }, 422);
  }
  if (existsSync(target) && !overwrite) {
    return c.json(
      {
        error: `${nodeSlug}.json already exists. Pass overwrite=true to replace.`,
      },
      409,
    );
  }
  const body = JSON.stringify(lesson, null, 2) + "\n";
  try {
    writeFileSync(target, body, "utf-8");
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "write failed" },
      500,
    );
  }
  return c.json({
    path: `seed-content/lessons/${nodeSlug}.json`,
    bytes: body.length,
    warnings,
  });
});

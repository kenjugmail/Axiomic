// Phase 21B — AI variant generator for personalized class
// assignments. Given the instructor's base task + the student's
// weakness profile + the class's level/topics, produces a
// reweighted prompt + structured rubric the auto-grader can
// consume.
//
// Design choices:
// - Falls back gracefully to a default-variant (echo of the base
//   task wrapped in a minimal rubric) if the AI returns garbage or
//   times out. Variant generation should never block the
//   instructor's bulk-generate action with a 500.
// - Deterministic seed for reproducibility: tests can pin the
//   seed and assert against a stable mock response.
// - Stays under ~2KB of system prompt so a 30-student bulk run
//   doesn't blow a context budget on a small model.

import { getAIProvider } from "@axiomic/ai";
import { extractJson } from "../routes/ai";
import type { WeaknessProfile } from "./studentWeaknesses";

export interface VariantRubricCriterion {
  id: string;
  description: string;
  weight?: number;
}

export interface VariantRubric {
  criteria: VariantRubricCriterion[];
  passingScore: number;
}

export interface GeneratedVariant {
  promptMd: string;
  rubric: VariantRubric;
  rationale: string;
  // True when the AI call succeeded + returned a parseable response.
  // False when we fell back to the default variant.
  aiBacked: boolean;
}

export interface GenerateVariantOptions {
  baseTask: {
    title: string;
    descriptionMd: string;
  };
  classMeta: {
    level: "intro" | "undergrad" | "grad" | null;
    title: string;
  };
  weakness: WeaknessProfile;
  seed: string;
  // Optional abort signal so the route can cancel on client
  // disconnect during a slow bulk run.
  signal?: AbortSignal;
}

function buildSystemPrompt(level: string | null): string {
  const levelLine = level
    ? `Calibrate difficulty to ${level} level: ${LEVEL_GUIDANCE[level] ?? ""}`
    : "Calibrate difficulty to undergraduate level.";
  return `You generate personalized class assignment variants on the Axiomic learning platform.

Your job: given a base assignment + a student's weakness profile, produce a variant of the same assignment whose body emphasizes the student's weak concepts. Preserve the base assignment's learning objective. Do NOT change the topic to something unrelated. ${levelLine}

Output a single JSON object — no prose around it, no code fences — with this exact shape:

{
  "promptMd": "...",
  "rubric": {
    "criteria": [
      {"id": "kebab-case-id", "description": "single sentence", "weight": 1}
    ],
    "passingScore": 0.6
  },
  "rationale": "one sentence explaining why you emphasized what you did"
}

Constraints:
- promptMd is 80-300 words of markdown. May include LaTeX via $...$ or $$...$$.
- 3-5 rubric criteria, weights summing to a round number.
- passingScore between 0.5 and 0.75.
- If the weakness profile lists active misconceptions, the prompt should probe them gently (not lecture). Lean toward asking "why" / "what would happen if".
- If the profile lists strengths, don't re-test them — push past them.
- If the profile is empty, ground the variant in the base assignment's stated topic at the target level.`;
}

const LEVEL_GUIDANCE: Record<string, string> = {
  intro:
    "first-time learners; favor intuition over formalism, concrete examples, 1-2 prerequisites only.",
  undergrad:
    "second/third-year majors; mathematical precision welcome, expect notation and short derivations.",
  grad:
    "PhD/early researcher; assume mastery of standard formalism, push toward open questions or non-obvious connections.",
};

function buildUserMessage(opts: GenerateVariantOptions): string {
  const { baseTask, classMeta, weakness } = opts;
  const weaknessSection =
    weakness.topics.length > 0
      ? weakness.topics
          .map((t, i) => {
            const sigs = t.signals
              .slice(0, 3)
              .map((s) => `    - ${s.kind}: ${s.evidence}`)
              .join("\n");
            return `${i + 1}. ${t.conceptTitle ?? t.conceptSlug} (severity ${t.severity.toFixed(2)})\n${sigs}`;
          })
          .join("\n")
      : "  (no scoped weakness signals — calibrate to the base task at class level)";
  const strengthsLine =
    weakness.strengths.length > 0
      ? `Strengths to avoid re-teaching: ${weakness.strengths.join(", ")}.`
      : "";
  return `Class: ${classMeta.title}
Class level: ${classMeta.level ?? "undergrad"}

Base assignment:
  Title: ${baseTask.title}
  Body: ${baseTask.descriptionMd.slice(0, 1500)}

Student weakness profile:
${weaknessSection}
${strengthsLine}

Produce the JSON now.`;
}

function defaultVariant(opts: GenerateVariantOptions): GeneratedVariant {
  // Mirror the base task as the prompt. Add a minimal three-criterion
  // rubric so the auto-grader still has something structured to work
  // with even when the AI call failed.
  const focus = opts.weakness.topics
    .slice(0, 2)
    .map((t) => t.conceptTitle ?? t.conceptSlug)
    .join(" and ");
  const promptMd = focus
    ? `${opts.baseTask.descriptionMd}\n\n**Focus areas for you:** ${focus}.`
    : opts.baseTask.descriptionMd;
  return {
    promptMd,
    rubric: {
      criteria: [
        {
          id: "correctness",
          description: "Answer is technically correct.",
          weight: 2,
        },
        {
          id: "clarity",
          description: "Reasoning is laid out so a peer could follow it.",
          weight: 1,
        },
        {
          id: "depth",
          description:
            "Engages with the underlying intuition, not just surface mechanics.",
          weight: 1,
        },
      ],
      passingScore: 0.6,
    },
    rationale: opts.weakness.topics.length
      ? `Default variant — emphasized ${focus} from the student's weakness profile.`
      : "Default variant — no weakness signals available.",
    aiBacked: false,
  };
}

function isValidShape(parsed: unknown): parsed is {
  promptMd: string;
  rubric: VariantRubric;
  rationale: string;
} {
  if (!parsed || typeof parsed !== "object") return false;
  const v = parsed as Record<string, unknown>;
  if (typeof v.promptMd !== "string" || v.promptMd.length < 20) return false;
  if (typeof v.rationale !== "string") return false;
  const r = v.rubric as Record<string, unknown> | undefined;
  if (!r || typeof r !== "object") return false;
  if (!Array.isArray(r.criteria) || r.criteria.length === 0) return false;
  for (const c of r.criteria) {
    if (!c || typeof c !== "object") return false;
    const cc = c as Record<string, unknown>;
    if (typeof cc.id !== "string") return false;
    if (typeof cc.description !== "string") return false;
  }
  if (typeof r.passingScore !== "number") return false;
  return true;
}

export async function generateAssignmentVariant(
  opts: GenerateVariantOptions,
): Promise<GeneratedVariant> {
  const provider = getAIProvider();
  const system = buildSystemPrompt(opts.classMeta.level);
  const user = buildUserMessage(opts);

  let buffer = "";
  try {
    await provider.stream({
      system,
      messages: [{ role: "user", content: user }],
      signal: opts.signal,
      onToken: (tok) => {
        buffer += tok;
      },
    });
  } catch {
    return defaultVariant(opts);
  }

  const parsed = extractJson<{
    promptMd: string;
    rubric: VariantRubric;
    rationale: string;
  }>(buffer);
  if (!parsed || !isValidShape(parsed)) {
    return defaultVariant(opts);
  }

  return {
    promptMd: parsed.promptMd,
    rubric: parsed.rubric,
    rationale: parsed.rationale,
    aiBacked: true,
  };
}

// Stable seed for a (task, student) pair — used by the variant row
// so tests can pin reproducibility and prod can detect "weakness
// profile changed since this variant generated."
export function variantSeed(taskId: string, studentId: string): string {
  // Bun supports crypto.subtle synchronously via Bun.hash, but a
  // simple string concat with a separator is enough — this is for
  // identity, not security.
  return `${taskId}::${studentId}`;
}

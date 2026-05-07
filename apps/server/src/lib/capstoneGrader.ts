// Sprint 27 — capstone milestone grader.
//
// Takes a learner's submission (writeup + artifacts + optional runnable-
// test results + optional lab state) and grades it against the
// milestone's structured rubric. Returns per-criterion scores + an
// overall weighted score + a short summary.
//
// The provider returns an opaque stream of tokens via its `stream()`
// API. We assemble the full response, parse a JSON-only answer, and
// gracefully fall back to a deterministic heuristic when the model's
// output isn't parseable. The fallback path is what keeps grading
// usable in the mock + test environment: the heuristic scores on
// writeup length, presence of required artifact kinds, and runnable-
// test pass-rate, none of which require a real LLM.

import { getAIProvider } from "@axiomic/ai";
import type {
  CapstoneArtifact,
  CapstoneAiGrade,
  CapstoneAiGradePerCriterion,
  CapstoneRubric,
  CapstoneRunnableTestResult,
} from "@axiomic/types";

export interface GradeRequest {
  milestoneTitle: string;
  milestoneDescription: string;
  rubric: CapstoneRubric;
  writeup: string;
  artifacts: CapstoneArtifact[];
  runnableTestResults?: CapstoneRunnableTestResult[];
  labState?: Record<string, unknown>;
}

export async function gradeMilestoneSubmission(
  req: GradeRequest,
): Promise<CapstoneAiGrade> {
  const provider = getAIProvider();
  const prompt = buildGradingPrompt(req);

  let raw = "";
  try {
    await provider.stream({
      system: GRADER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
      onToken: (t) => {
        raw += t;
      },
    });
  } catch {
    raw = "";
  }

  const parsed = parseGraderOutput(raw, req.rubric);
  if (parsed) return { ...parsed, gradedBy: provider.name };

  // Fallback: deterministic heuristic.
  return { ...heuristicGrade(req), gradedBy: `${provider.name}-heuristic` };
}

const GRADER_SYSTEM_PROMPT = `You are a strict but fair capstone grader. \
You score a learner's milestone submission against a rubric. \
Reply with ONLY a single JSON object matching this schema:

{
  "perCriterion": [
    { "criterionId": string, "score": number (0..1), "feedback": string }
  ],
  "summary": string
}

Score 0 means "missing or wrong"; 1 means "exceeds the bar". \
Be specific in feedback — name what's missing, suggest what would push the score up. \
Do not include markdown fences or any text outside the JSON.`;

function buildGradingPrompt(req: GradeRequest): string {
  const parts: string[] = [];
  parts.push(`Milestone: ${req.milestoneTitle}`);
  if (req.milestoneDescription) {
    parts.push(`\nDescription:\n${req.milestoneDescription}`);
  }
  parts.push(`\nRubric:`);
  for (const c of req.rubric.criteria) {
    parts.push(
      `- (${c.id}) ${c.description} [weight ${c.weight.toFixed(2)}]: ${c.aiPrompt}`,
    );
  }
  if (req.rubric.notes) parts.push(`\nAuthor notes: ${req.rubric.notes}`);

  parts.push(`\nLearner writeup:\n${req.writeup.slice(0, 8000)}`);

  if (req.artifacts.length > 0) {
    parts.push(`\nArtifacts:`);
    for (const a of req.artifacts) {
      parts.push(
        `- [${a.kind}] ${a.label}${a.url ? ` — ${a.url}` : ""}${
          a.description ? `: ${a.description}` : ""
        }`,
      );
    }
  }

  if (req.runnableTestResults && req.runnableTestResults.length > 0) {
    const passed = req.runnableTestResults.filter((r) => r.passed).length;
    parts.push(
      `\nRunnable tests: ${passed}/${req.runnableTestResults.length} passing.`,
    );
    for (const r of req.runnableTestResults) {
      parts.push(`  - ${r.passed ? "✓" : "✗"} ${r.name}${r.message ? ` (${r.message})` : ""}`);
    }
  }

  if (req.labState && Object.keys(req.labState).length > 0) {
    parts.push(`\nLab state: ${JSON.stringify(req.labState).slice(0, 1000)}`);
  }

  parts.push(
    `\nGrade this submission. Reply with ONLY the JSON object described in the system prompt.`,
  );
  return parts.join("\n");
}

function parseGraderOutput(
  raw: string,
  rubric: CapstoneRubric,
): { score: number; perCriterion: CapstoneAiGradePerCriterion[]; summary: string } | null {
  if (!raw) return null;
  // Pull the first JSON object out — providers occasionally wrap the
  // payload in prose despite the system prompt asking otherwise.
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const perCriterionRaw = obj.perCriterion;
  if (!Array.isArray(perCriterionRaw)) return null;

  const byId = new Map<string, CapstoneAiGradePerCriterion>();
  for (const c of perCriterionRaw) {
    if (!c || typeof c !== "object") continue;
    const cc = c as Record<string, unknown>;
    if (
      typeof cc.criterionId !== "string" ||
      typeof cc.score !== "number" ||
      typeof cc.feedback !== "string"
    ) {
      continue;
    }
    byId.set(cc.criterionId, {
      criterionId: cc.criterionId,
      score: clamp01(cc.score),
      feedback: cc.feedback,
    });
  }
  if (byId.size === 0) return null;

  const perCriterion: CapstoneAiGradePerCriterion[] = rubric.criteria.map(
    (c) =>
      byId.get(c.id) ?? {
        criterionId: c.id,
        score: 0,
        feedback: "Grader did not return a score for this criterion.",
      },
  );

  const totalWeight = rubric.criteria.reduce((s, c) => s + c.weight, 0) || 1;
  let weighted = 0;
  for (let i = 0; i < rubric.criteria.length; i++) {
    weighted += perCriterion[i].score * rubric.criteria[i].weight;
  }
  const score = clamp01(weighted / totalWeight);
  const summary = typeof obj.summary === "string" ? obj.summary : "";
  return { score, perCriterion, summary };
}

function heuristicGrade(req: GradeRequest): {
  score: number;
  perCriterion: CapstoneAiGradePerCriterion[];
  summary: string;
} {
  // Score each criterion identically off the same submission shape so
  // the fallback is predictable + testable.
  const writeupWords = req.writeup.split(/\s+/).filter(Boolean).length;
  const writeupScore = clamp01(writeupWords / 200);
  const artifactScore = req.artifacts.length > 0 ? 1 : 0.4;
  const testScore = req.runnableTestResults && req.runnableTestResults.length > 0
    ? req.runnableTestResults.filter((r) => r.passed).length /
      req.runnableTestResults.length
    : 0.7;
  // A blend leaning on the writeup, since most rubrics weight it heaviest.
  const componentScore = clamp01(
    0.5 * writeupScore + 0.3 * artifactScore + 0.2 * testScore,
  );

  const perCriterion: CapstoneAiGradePerCriterion[] = req.rubric.criteria.map(
    (c) => ({
      criterionId: c.id,
      score: componentScore,
      feedback:
        writeupWords < 50
          ? "Writeup is very short — expand on the reasoning behind your approach."
          : req.artifacts.length === 0
            ? "Attach a runnable artifact (GitHub / Colab / writeup) so reviewers can verify your work."
            : "Looks solid. Tighten the conceptual framing in your writeup to clear the bar.",
    }),
  );
  const totalWeight = req.rubric.criteria.reduce((s, c) => s + c.weight, 0) || 1;
  let weighted = 0;
  for (let i = 0; i < req.rubric.criteria.length; i++) {
    weighted += perCriterion[i].score * req.rubric.criteria[i].weight;
  }
  const score = clamp01(weighted / totalWeight);
  return {
    score,
    perCriterion,
    summary:
      score >= req.rubric.passingScore
        ? "Heuristic grade: this clears the bar. A human review would sharpen the per-criterion feedback."
        : "Heuristic grade: this needs more depth in the writeup or stronger artifacts.",
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

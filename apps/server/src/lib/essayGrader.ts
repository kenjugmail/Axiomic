// Sprint 75 — Essay grader for free-text exam questions.
//
// Mirrors capstoneGrader.ts: stream the AI provider, parse a
// JSON-shaped score + feedback, fall back to a deterministic
// heuristic if the model output is malformed (so tests with the
// mock provider still produce a sensible grade).
//
// Heuristic fallback: scores by length brackets + presence of
// rubric-keyword tokens in the response. It's not a real grader —
// it's just enough to keep the framework testable end-to-end
// without a real LLM.

import { getAIProvider } from "@axiomic/ai";

export interface EssayGradeRequest {
  promptMd: string;
  rubricMd: string;
  maxScore: number;
  essayResponse: string;
}

export interface EssayGradeResult {
  score: number;
  feedbackMd: string;
  gradedBy: string;
}

const SYSTEM_PROMPT = `You are a strict but fair exam essay grader. \
Score the student's response against the rubric on a 0..MAX integer scale, \
where MAX is the maximum specified by the rubric. \
Return ONLY a JSON object on a single line, no commentary, in this shape:

{"score": <integer 0..MAX>, "feedback": "<2-4 sentence rubric-aligned feedback>"}

If the essay is empty, missing, or addresses a different prompt, score 0.`;

function buildUserPrompt(req: EssayGradeRequest): string {
  return `Rubric (max score: ${req.maxScore}):
${req.rubricMd}

Prompt:
${req.promptMd}

Student response:
${req.essayResponse.trim() ? req.essayResponse : "(empty)"}`;
}

interface ParsedGrade {
  score: number;
  feedback: string;
}

function tryParseGraderOutput(
  raw: string,
  maxScore: number,
): ParsedGrade | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Find the first balanced { ... } block. Models sometimes wrap the
  // JSON in ``` fences or stray prose; we don't want to fail on that.
  const start = trimmed.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let end = -1;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;
  const slice = trimmed.slice(start, end + 1);
  try {
    const obj = JSON.parse(slice);
    const score = Number(obj.score);
    if (!Number.isFinite(score)) return null;
    const feedback =
      typeof obj.feedback === "string" ? obj.feedback : "";
    return {
      score: Math.max(0, Math.min(maxScore, Math.round(score))),
      feedback,
    };
  } catch {
    return null;
  }
}

// Heuristic fallback: words / sentences / rubric keyword overlap.
function heuristicGrade(req: EssayGradeRequest): ParsedGrade {
  const text = req.essayResponse.trim();
  if (!text) return { score: 0, feedback: "No response provided." };
  const words = text.split(/\s+/).filter(Boolean);
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  // Length proxy. <100 words → low; 100-200 → mid; 200+ → high.
  let lengthScore = 0;
  if (words.length >= 200) lengthScore = req.maxScore;
  else if (words.length >= 100) lengthScore = Math.ceil(req.maxScore * 0.66);
  else if (words.length >= 50) lengthScore = Math.ceil(req.maxScore * 0.5);
  else if (words.length >= 20) lengthScore = Math.ceil(req.maxScore * 0.33);

  // Rubric keyword overlap. Pull alphabetic 5+ char tokens out of the
  // rubric, count how many appear in the essay; cap at maxScore - 1
  // so a wall of keyword-stuffed text alone can't max out.
  const rubricKeywords = (req.rubricMd.toLowerCase().match(/\b[a-z]{5,}\b/g) ?? [])
    .filter((w) => w.length >= 5);
  const essayLower = text.toLowerCase();
  const keywordHits = new Set(
    rubricKeywords.filter((k) => essayLower.includes(k)),
  ).size;
  const keywordScore = Math.min(
    req.maxScore - 1,
    Math.floor((keywordHits / Math.max(1, rubricKeywords.length)) * req.maxScore),
  );

  // Sentence-variety small boost (penalize one giant blob).
  const varietyBoost = sentences.length >= 4 ? 1 : 0;

  const score = Math.max(
    0,
    Math.min(req.maxScore, Math.round((lengthScore + keywordScore) / 2) + varietyBoost),
  );
  return {
    score,
    feedback: `Heuristic grade based on length (${words.length} words, ${sentences.length} sentences) and rubric keyword overlap (${keywordHits}/${rubricKeywords.length}). For a real grade, ensure the AI provider is configured.`,
  };
}

export async function gradeEssay(
  req: EssayGradeRequest,
): Promise<EssayGradeResult> {
  const provider = getAIProvider();
  let raw = "";
  try {
    await provider.stream({
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: buildUserPrompt(req) },
      ],
      onToken: (t) => {
        raw += t;
      },
    });
  } catch {
    raw = "";
  }
  const parsed = tryParseGraderOutput(raw, req.maxScore);
  if (parsed) {
    return {
      score: parsed.score,
      feedbackMd: parsed.feedback,
      gradedBy: provider.name,
    };
  }
  const fallback = heuristicGrade(req);
  return {
    score: fallback.score,
    feedbackMd: fallback.feedback,
    gradedBy: `${provider.name}-heuristic`,
  };
}

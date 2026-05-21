// Shared lesson-quality rubric. Extracted from scripts/audit-lessons.ts
// so the SAME scoring powers (a) the CLI auditor `bun run audit:lessons`
// and (b) the /admin/lesson-quality dashboard endpoint. The CLI walks
// files; the endpoint reads parsed lessonData from the DB — both call
// scoreLessonContent() on an already-parsed lesson object, so the score
// a lesson earns is identical in both surfaces.
//
// Keep this in lockstep with the rubric: a weight or flag change here
// changes both the CLI report and the dashboard at once.

interface ScorableSlide {
  kind?: string;
  body?: string;
  viz?: string;
  question?: { kind?: string };
}

export interface ScorableLesson {
  slides?: ScorableSlide[];
}

export interface LessonScoreMetrics {
  slideCount: number;
  textSlideCount: number;
  questionSubkindCount: number;
  totalBodyWords: number;
  nameDropCount: number;
  hasViz: boolean;
  composite: number;
  flags: string[];
}

// Rough proper-noun detector: words that start with a capital and
// aren't sentence-initial. Counts unique tokens to avoid inflating
// scores via repetition.
export function countNameDrops(text: string): number {
  const tokens = text.match(/(?<![.!?]\s)\b[A-Z][a-zA-Z'\-]{2,}\b/g) ?? [];
  return new Set(tokens).size;
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// Score an already-parsed lesson object. Pure: no I/O, no JSON.parse.
// Callers handle parse failures (the CLI reports INVALID_JSON; the
// endpoint reports NO_LESSON_DATA for null lessonData).
export function scoreLessonContent(lesson: ScorableLesson): LessonScoreMetrics {
  const flags: string[] = [];
  const slides = lesson.slides ?? [];
  const slideCount = slides.length;
  const textSlides = slides.filter((s) => s.kind === "text");
  const textSlideCount = textSlides.length;
  const questionSubkinds = new Set(
    slides
      .filter((s) => s.kind === "question")
      .map((s) => s.question?.kind)
      .filter(Boolean) as string[],
  );
  const questionSubkindCount = questionSubkinds.size;
  const allBodies = textSlides.map((s) => s.body ?? "").join("\n");
  const totalBodyWords = wordCount(allBodies);
  const nameDropCount = countNameDrops(allBodies);
  const hasViz = slides.some((s) => Boolean(s.viz));

  // Flagging — what to surface for manual review.
  if (slideCount < 6) flags.push("LOW_SLIDE_COUNT");
  if (textSlideCount < 3) flags.push("LOW_TEXT_SLIDE_COUNT");
  if (questionSubkindCount < 3) flags.push("LOW_QUESTION_VARIETY");
  if (totalBodyWords < 300) flags.push("LOW_BODY_WORDS");
  if (nameDropCount < 8) flags.push("LOW_NAME_DROPS");
  if (!hasViz) flags.push("NO_VIZ");

  // Composite — weighted sum normalized to 0-100.
  const slideScore = Math.min(slideCount / 8, 1) * 15;
  const textScore = Math.min(textSlideCount / 3, 1) * 10;
  const questionScore = Math.min(questionSubkindCount / 5, 1) * 15;
  const wordScore = Math.min(totalBodyWords / 800, 1) * 30;
  const nameScore = Math.min(nameDropCount / 20, 1) * 25;
  const vizScore = hasViz ? 5 : 0;
  const composite = Math.round(
    slideScore + textScore + questionScore + wordScore + nameScore + vizScore,
  );

  return {
    slideCount,
    textSlideCount,
    questionSubkindCount,
    totalBodyWords,
    nameDropCount,
    hasViz,
    composite,
    flags,
  };
}

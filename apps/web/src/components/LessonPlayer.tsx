import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Lesson, LessonSlide, QuizQuestion } from "@axiomic/types";
import { assertQuestionKind } from "@axiomic/types";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { QuestionRenderer, isAnswered } from "./quiz/QuestionRenderer";
import { SoftmaxTemperatureSlider } from "../../../../packages/viz/src/quiz/SoftmaxTemperatureSlider";

const PASSING_SCORE = 0.7;

interface Props {
  nodeId: string;
  nodeTitle: string;
  onClose: () => void;
  // Triggered when the lesson is finished AND the embedded questions
  // were answered above the passing threshold; the path page uses this
  // to refetch progress.
  onCompleted?: () => void;
}

type Phase = "loading" | "playing" | "finished" | "no-lesson" | "error";

// Mirrors the QuizModal's local-scoring helper. Used to grade embedded
// question slides for the end-of-lesson summary.
function scoreLocally(question: QuizQuestion, answer: string | undefined): boolean {
  const q = assertQuestionKind(question);
  if (answer === undefined && q.kind !== "slider") return false;
  switch (q.kind) {
    case "multiple_choice":
      return answer === String(q.correctIndex);
    case "slider": {
      const v = parseFloat(answer ?? String(q.default));
      return !isNaN(v) && v >= q.target.min && v <= q.target.max;
    }
    case "drag_classify": {
      try {
        const map = JSON.parse(answer!) as Record<string, string>;
        return q.items.every((i) => map[i.id] === i.bin);
      } catch {
        return false;
      }
    }
  }
}

// Tiny preview viz used on text slides that name a `viz`. Today only
// "softmax-temperature-preview" is supported (renders the controlled
// slider in read-only display mode); falls back to a placeholder for
// unknown viz names.
function PreviewViz({ name, props }: { name: string; props?: Record<string, unknown> }) {
  switch (name) {
    case "softmax-temperature-preview":
      return (
        <SoftmaxTemperatureSlider
          value={typeof props?.value === "number" ? props.value : 1}
        />
      );
    default:
      return null;
  }
}

export function LessonPlayer({ nodeId, nodeTitle, onClose, onCompleted }: Props) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [idx, setIdx] = useState(0);
  // Per-slide answer state for question slides.
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.mastery
      .getLesson(nodeId)
      .then((data) => {
        if (cancelled) return;
        if (!data.lesson || data.lesson.slides.length === 0) {
          setPhase("no-lesson");
          return;
        }
        setLesson(data.lesson);
        setPhase("playing");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message ?? "Failed to load lesson");
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [nodeId]);

  // Esc to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const slides = lesson?.slides ?? [];
  const slide: LessonSlide | undefined = slides[idx];
  const questionSlides = useMemo(
    () => slides.filter((s): s is Extract<LessonSlide, { kind: "question" }> => s.kind === "question"),
    [slides],
  );

  const canAdvance = (() => {
    if (!slide) return false;
    if (slide.kind === "question") {
      return isAnswered(slide.question, answers[slide.question.id]);
    }
    return true;
  })();

  const isLast = idx === slides.length - 1;

  const handleNext = () => {
    if (!canAdvance) return;
    if (isLast) handleFinish();
    else setIdx((i) => Math.min(i + 1, slides.length - 1));
  };

  const handlePrev = () => setIdx((i) => Math.max(0, i - 1));

  const handleFinish = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      // Score embedded questions; if the user passed, mark the node
      // complete on the server. Lessons without questions auto-complete.
      const total = questionSlides.length;
      let correct = 0;
      for (const s of questionSlides) {
        if (scoreLocally(s.question, answers[s.question.id])) correct++;
      }
      const score = total > 0 ? correct / total : 1;
      if (score >= PASSING_SCORE) {
        try {
          await api.mastery.markComplete(nodeId);
          onCompleted?.();
        } catch {
          // Don't fail the modal if the auto-mark step has a hiccup.
        }
      }
      setPhase("finished");
    } finally {
      setSubmitting(false);
    }
  };

  const finalScore = (() => {
    if (questionSlides.length === 0) return 1;
    let correct = 0;
    for (const s of questionSlides) {
      if (scoreLocally(s.question, answers[s.question.id])) correct++;
    }
    return correct / questionSlides.length;
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[6vh]">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Lesson · {nodeTitle}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {phase === "playing"
                ? `Slide ${idx + 1} of ${slides.length}`
                : phase === "finished"
                  ? "Lesson complete"
                  : "Loading…"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress dots */}
        {phase === "playing" && slides.length > 0 && (
          <div className="flex gap-1 px-5 py-2 border-b border-border">
            {slides.map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-1 rounded-full transition-colors ${
                  i < idx
                    ? "bg-primary"
                    : i === idx
                      ? "bg-primary/60"
                      : "bg-muted"
                }`}
              />
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {phase === "loading" && (
            <div className="space-y-3">
              <div className="h-6 animate-pulse bg-muted rounded w-1/2" />
              <div className="h-32 animate-pulse bg-muted rounded" />
            </div>
          )}
          {phase === "no-lesson" && (
            <div className="py-12 text-center text-muted-foreground">
              <p>No lesson is authored for this node yet.</p>
              <p className="text-xs mt-2">Try the quiz instead.</p>
            </div>
          )}
          {phase === "error" && (
            <div className="text-sm text-destructive">{error}</div>
          )}

          {phase === "playing" && slide && slide.kind === "text" && (
            <div className="space-y-4">
              {slide.title && <h3 className="text-xl font-semibold">{slide.title}</h3>}
              <div className="grid md:grid-cols-2 gap-6 items-start">
                <div className="prose-sm max-w-none">
                  <MarkdownRenderer content={slide.body} className="[&_p]:text-sm [&_p]:mb-3" />
                </div>
                {slide.viz && (
                  <div>
                    <PreviewViz name={slide.viz} props={slide.vizProps} />
                  </div>
                )}
              </div>
              {!slide.viz && (
                <div className="prose-sm max-w-none">
                  {/* Already rendered above; this branch is for narrow layout safety on narrow viewports. */}
                </div>
              )}
            </div>
          )}

          {phase === "playing" && slide && slide.kind === "question" && (
            <div className="space-y-4">
              <h3 className="text-base font-medium">{slide.question.question}</h3>
              <QuestionRenderer
                question={slide.question}
                value={answers[slide.question.id]}
                onChange={(v) =>
                  setAnswers((a) => ({ ...a, [slide.question.id]: v }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Answer to advance to the next slide.
              </p>
            </div>
          )}

          {phase === "finished" && (
            <div className="py-8 text-center space-y-4">
              <div className="text-4xl">{finalScore >= PASSING_SCORE ? "🎉" : "📚"}</div>
              <div className="text-lg font-semibold">
                {finalScore >= PASSING_SCORE ? "Lesson complete!" : "Lesson finished."}
              </div>
              {questionSlides.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  You answered {Math.round(finalScore * questionSlides.length)} /{" "}
                  {questionSlides.length} embedded checks correctly.
                  {finalScore >= PASSING_SCORE
                    ? " This node is now marked complete."
                    : " Keep exploring — try the quiz to mark this node complete."}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This node is now marked complete.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-2">
          {phase === "playing" ? (
            <>
              <button
                onClick={handlePrev}
                disabled={idx === 0}
                className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                Back
              </button>
              <button
                onClick={handleNext}
                disabled={!canAdvance || submitting}
                className="px-4 py-1.5 text-sm rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50"
              >
                {isLast ? (submitting ? "Finishing…" : "Finish") : "Next"}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="ml-auto px-4 py-1.5 text-sm rounded-md bg-primary text-primary-foreground font-medium"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

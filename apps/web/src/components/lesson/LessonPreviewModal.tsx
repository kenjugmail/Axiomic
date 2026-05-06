import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, HelpCircle, X } from "lucide-react";
import type { LessonSlide } from "@axiomic/types";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { QuestionRenderer } from "../quiz/QuestionRenderer";
import { PreviewViz } from "./PreviewViz";

interface Props {
  slides: LessonSlide[];
  nodeTitle: string;
  onClose: () => void;
}

// Read-only lesson preview for the editor. Renders the same layout as
// LessonPage's body — text slides get serif body + optional sticky
// viz, question slides centre the prompt with a card-wrapped answer
// UI — but reads from in-memory `slides` so authors can validate
// UNSAVED edits without round-tripping through Save.
export function LessonPreviewModal({ slides, nodeTitle, onClose }: Props) {
  const [idx, setIdx] = useState(0);
  // Local-only answer state so authors can step through the question
  // UI without persisting anything.
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const slide = slides[idx] as LessonSlide | undefined;
  const isLast = idx === slides.length - 1;

  const next = () => setIdx((i) => Math.min(i + 1, slides.length - 1));
  const prev = () => setIdx((i) => Math.max(0, i - 1));

  const slideKindIcon = useMemo(() => {
    if (!slide) return null;
    return slide.kind === "question" ? HelpCircle : BookOpen;
  }, [slide]);

  return (
    <div
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Lesson preview"
    >
      <div
        className="absolute inset-x-0 top-8 bottom-8 max-w-4xl mx-4 sm:mx-auto bg-card border border-border rounded-xl shadow-floating flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 sm:px-6 h-12 border-b border-border flex items-center gap-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Preview · unsaved
          </div>
          <div className="h-4 w-px bg-border" />
          <h2 className="text-sm font-semibold truncate">{nodeTitle}</h2>
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {idx + 1} / {slides.length}
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40"
            aria-label="Close preview"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>

        <div className="h-1 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-base ease-out"
            style={{ width: `${((idx + 1) / slides.length) * 100}%` }}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-10 py-8">
          {!slide ? (
            <p className="text-sm text-muted-foreground">No slides yet.</p>
          ) : slide.kind === "text" ? (
            <article className="max-w-2xl mx-auto animate-fade-in">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 inline-flex items-center gap-1.5">
                {slideKindIcon && (
                  <BookOpen className="w-3 h-3" strokeWidth={2} />
                )}
                Concept · slide {idx + 1} of {slides.length}
              </div>
              {slide.title && (
                <h3 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight leading-tight mb-5">
                  {slide.title}
                </h3>
              )}
              <div
                className={
                  slide.viz
                    ? "grid lg:grid-cols-2 gap-6 items-start"
                    : "max-w-prose"
                }
              >
                <div className="font-serif text-base leading-relaxed [&_p]:mb-4 [&_h3]:font-sans [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-3">
                  <MarkdownRenderer content={slide.body} />
                </div>
                {slide.viz && (
                  <div>
                    <div className="rounded-lg border border-border bg-card p-4">
                      <PreviewViz name={slide.viz} props={slide.vizProps} />
                    </div>
                  </div>
                )}
              </div>
            </article>
          ) : (
            <div className="max-w-xl mx-auto animate-fade-in">
              <div className="text-[11px] uppercase tracking-wider text-primary mb-2 inline-flex items-center gap-1.5">
                <HelpCircle className="w-3 h-3" strokeWidth={2} />
                Check your understanding · slide {idx + 1} of {slides.length}
              </div>
              <h3 className="font-display text-xl sm:text-2xl font-semibold tracking-tight leading-snug mb-5">
                {slide.question.question}
              </h3>
              <div className="rounded-lg border border-border bg-card p-4">
                <QuestionRenderer
                  question={slide.question}
                  value={answers[slide.question.id]}
                  onChange={(v) =>
                    setAnswers((a) => ({ ...a, [slide.question.id]: v }))
                  }
                />
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border bg-card px-5 sm:px-10 py-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <button
            onClick={prev}
            disabled={idx === 0}
            className="justify-self-start inline-flex items-center gap-1 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} />
            Back
          </button>
          <div className="text-xs text-muted-foreground tabular-nums">
            {idx + 1} / {slides.length}
          </div>
          {isLast ? (
            <button
              onClick={onClose}
              className="justify-self-end inline-flex items-center px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground font-medium"
            >
              Done
            </button>
          ) : (
            <button
              onClick={next}
              className="justify-self-end inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground font-medium"
            >
              Next
              <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

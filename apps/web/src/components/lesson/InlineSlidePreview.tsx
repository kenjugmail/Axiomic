import { useEffect, useState } from "react";
import { BookOpen, HelpCircle } from "lucide-react";
import type { LessonSlide } from "@axiomic/types";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { PreviewViz } from "./PreviewViz";

// Inline (non-modal) preview of a single lesson slide. Used by the
// editor's split-view mode to render the current slide alongside the
// edit pane. Debounces props so a typing burst doesn't re-render
// every keystroke (matches the AI-authoring page's pattern).
//
// Renders the slide kinds the lesson player supports — text +
// section + question + explain_back. Question rendering shows the
// prompt without grading (no submit/correct-answer reveal); the
// goal is a content-shape preview, not an interactive run.

interface Props {
  slide: LessonSlide | undefined;
  debounceMs?: number;
}

export function InlineSlidePreview({ slide, debounceMs = 300 }: Props) {
  const [debounced, setDebounced] = useState(slide);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(slide), debounceMs);
    return () => clearTimeout(t);
  }, [slide, debounceMs]);

  if (!debounced) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Pick a slide to preview.
      </div>
    );
  }

  if (debounced.kind === "text") {
    return (
      <article className="rounded-lg border border-border bg-card p-5 max-h-[calc(100vh-10rem)] overflow-y-auto">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 inline-flex items-center gap-1.5">
          <BookOpen className="w-3 h-3" strokeWidth={2} /> Concept preview
        </div>
        {debounced.title && (
          <h3 className="font-display text-xl font-semibold leading-tight mb-3">
            {debounced.title}
          </h3>
        )}
        <div className="font-serif text-sm leading-relaxed [&_p]:mb-3 prose prose-sm dark:prose-invert max-w-none">
          <MarkdownRenderer content={debounced.body ?? ""} />
        </div>
        {debounced.viz && (
          <div className="mt-4 rounded-lg border border-border/50 bg-background p-3">
            <PreviewViz name={debounced.viz} props={debounced.vizProps} />
          </div>
        )}
      </article>
    );
  }

  if (debounced.kind === "section") {
    return (
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="text-[10px] uppercase tracking-wider text-primary mb-2">
          Section
        </div>
        {debounced.title && (
          <h3 className="font-display text-2xl font-semibold leading-tight">
            {debounced.title}
          </h3>
        )}
        {debounced.body && (
          <div className="mt-3 text-sm text-muted-foreground">
            <MarkdownRenderer content={debounced.body} />
          </div>
        )}
      </section>
    );
  }

  if (debounced.kind === "question") {
    const q = debounced.question;
    return (
      <article className="rounded-lg border border-border bg-card p-5 max-h-[calc(100vh-10rem)] overflow-y-auto">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 inline-flex items-center gap-1.5">
          <HelpCircle className="w-3 h-3" strokeWidth={2} /> Check preview · {q?.kind ?? "question"}
        </div>
        {q?.question && (
          <h3 className="font-display text-lg font-semibold leading-tight mb-3">
            {q.question}
          </h3>
        )}
        {/* Show the question shape without grading. Concrete sub-
            kinds (multiple_choice, scenario, etc.) have differing
            payloads; render the raw JSON in a collapsed pre for
            content authors to inspect. */}
        <pre className="text-[10px] font-mono bg-muted/30 rounded p-2 overflow-auto max-h-64">
          {JSON.stringify(q, null, 2)}
        </pre>
      </article>
    );
  }

  // Fallback (explain_back at slide-kind level, or unknown)
  return (
    <article className="rounded-lg border border-border bg-card p-5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
        {debounced.kind} preview
      </div>
      <pre className="text-[10px] font-mono bg-muted/30 rounded p-2 overflow-auto max-h-64">
        {JSON.stringify(debounced, null, 2)}
      </pre>
    </article>
  );
}

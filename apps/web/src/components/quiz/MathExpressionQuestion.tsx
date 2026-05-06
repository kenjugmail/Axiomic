import { useEffect, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { MathExpressionQuestion as Q } from "@axiomic/types";

interface Props {
  question: Q;
  value: string | undefined;
  onChange: (v: string) => void;
  review?: { correct: boolean };
}

// LaTeX-style input with a live KaTeX preview underneath. Server
// grades by normalized string match against acceptedAnswers.
export function MathExpressionQuestion({ question, value, onChange, review }: Props) {
  const text = value ?? question.starter ?? "";
  const [html, setHtml] = useState<string>("");
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    if (!text.trim()) {
      setHtml("");
      setRenderError(null);
      return;
    }
    try {
      const out = katex.renderToString(text, {
        throwOnError: false,
        displayMode: true,
      });
      setHtml(out);
      setRenderError(null);
    } catch (e: any) {
      setHtml("");
      setRenderError(e?.message ?? "Render error");
    }
  }, [text]);

  return (
    <div className="space-y-3">
      <input
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type a LaTeX-friendly expression, e.g.  \\frac{1}{1+e^{-x}}"
        disabled={!!review}
        className={`w-full px-3 py-2 rounded-md border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring ${
          review
            ? review.correct
              ? "border-emerald-500"
              : "border-rose-500"
            : "border-input"
        }`}
      />
      <div className="rounded-md border border-border bg-muted/30 p-4 min-h-[3rem] flex items-center justify-center">
        {html ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <span className="text-xs text-muted-foreground">
            {renderError ? `Render error: ${renderError}` : "Live preview appears here."}
          </span>
        )}
      </div>
      {question.hint && !review && (
        <p className="text-xs text-muted-foreground">💡 {question.hint}</p>
      )}
      {review && (
        <div
          className={`text-xs px-3 py-2 rounded-md ${
            review.correct
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-rose-500/10 text-rose-700 dark:text-rose-400"
          }`}
        >
          {review.correct
            ? "Matches an accepted form."
            : `Not quite. Accepted: ${question.acceptedAnswers.slice(0, 3).join("  ·  ")}${
                question.acceptedAnswers.length > 3 ? "  ·  …" : ""
              }`}
        </div>
      )}
    </div>
  );
}

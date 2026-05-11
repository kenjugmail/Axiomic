import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import type { LessonSlide } from "@axiomic/types";
import { streamTokens } from "../../lib/streamTokens";

interface Props {
  // Which slide kind to draft. Text slides come back as {title, body, viz?};
  // question slides come back as {question, options, correctIndex, explanation}.
  kind: "text" | "question";
  onAccept: (slide: LessonSlide) => void;
  onClose: () => void;
}

// Streams an AI-drafted slide. The server prompt pins the JSON shape;
// we wait for [DONE] then JSON.parse into the matching LessonSlide.
export function AiDraftSlideDialog({ kind, onAccept, onClose }: Props) {
  const [topic, setTopic] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);

  const draft = async () => {
    if (streaming || topic.trim().length < 2) return;
    setStreaming(true);
    setError(null);
    setRaw("");
    const r = await streamTokens({
      url: "/api/v1/ai/lesson/draft-slide",
      body: { topic: topic.trim(), kind },
      onToken: (_t, next) => setRaw(next),
    });
    setStreaming(false);
    if (!r.ok) setError(r.error ?? "Draft failed");
  };

  const accept = () => {
    try {
      // Strip any code fences the model may have wrapped around the
      // JSON despite our system prompt.
      const cleaned = raw.replace(/^```(?:json)?\s*|\s*```\s*$/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (kind === "text") {
        const next: LessonSlide = {
          kind: "text",
          title: parsed.title || "Untitled",
          body: parsed.body || "",
          ...(parsed.viz ? { viz: parsed.viz, vizProps: {} } : {}),
        };
        onAccept(next);
      } else {
        const next: LessonSlide = {
          kind: "question",
          question: {
            id: `q_${Math.random().toString(36).slice(2, 8)}`,
            kind: "multiple_choice",
            question: parsed.question,
            options: parsed.options,
            correctIndex: parsed.correctIndex,
            explanation: parsed.explanation,
          } as any,
        };
        onAccept(next);
      }
      onClose();
    } catch (e: any) {
      setError("AI returned invalid JSON. Try again.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 animate-fade-in flex items-start justify-center px-4 py-12"
      role="dialog"
      aria-modal="true"
      aria-label="Draft slide with AI"
    >
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-xl bg-card border border-border rounded-xl shadow-floating overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-4 h-12 border-b border-border shrink-0">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="w-4 h-4" strokeWidth={2} />
            Draft a {kind === "text" ? "concept" : "check-your-understanding"}{" "}
            slide
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40"
            aria-label="Close"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <label className="block text-xs font-medium text-muted-foreground">
            Topic or concept
          </label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={
              kind === "text"
                ? "e.g. Why softmax temperature flattens probabilities"
                : "e.g. Multiple-choice on attention masking"
            }
            disabled={streaming}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />

          {error && (
            <div className="p-2 rounded-md bg-destructive/10 text-destructive text-xs">
              {error}
            </div>
          )}

          {raw && (
            <div className="rounded-md border border-border bg-muted/30 p-3 max-h-64 overflow-y-auto">
              {streaming && (
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  Streaming…
                </div>
              )}
              <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed">
                {raw}
              </pre>
            </div>
          )}
        </div>

        <div className="border-t border-border px-4 py-3 flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            {raw && !streaming ? (
              <>
                <button
                  onClick={draft}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Regenerate
                </button>
                <button
                  onClick={accept}
                  className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
                >
                  Use this slide
                </button>
              </>
            ) : (
              <button
                onClick={draft}
                disabled={streaming || topic.trim().length < 2}
                className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {streaming ? "Drafting…" : "Draft"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

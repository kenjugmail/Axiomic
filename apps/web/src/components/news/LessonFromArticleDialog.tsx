import { useState } from "react";
import { GraduationCap, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { streamTokens } from "../../lib/streamTokens";
import { api } from "../../lib/api";

interface Props {
  articleSlug: string;
  articleTitle: string;
  onClose: () => void;
}

interface ParsedSlides {
  slides: any[];
}

// Pulls the largest balanced JSON object out of a streamed token blob.
// The model is instructed to output ONLY a JSON object, but mid-stream
// the object is incomplete. Matching the outermost {...} once it
// becomes balanced lets us preview the partial result without errors.
function parseSlides(text: string): ParsedSlides | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1));
    if (Array.isArray(obj?.slides)) return obj as ParsedSlides;
    return null;
  } catch {
    return null;
  }
}

export function LessonFromArticleDialog({
  articleSlug,
  articleTitle,
  onClose,
}: Props) {
  const navigate = useNavigate();
  const [textSlides, setTextSlides] = useState(5);
  const [questionSlides, setQuestionSlides] = useState(3);
  const [streaming, setStreaming] = useState(false);
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<ParsedSlides | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (streaming) return;
    setStreaming(true);
    setError(null);
    setRaw("");
    setParsed(null);
    const result = await streamTokens({
      url: "/api/v1/ai/lesson/from-article",
      body: { slug: articleSlug, textSlides, questionSlides },
      onToken: (_t, acc) => {
        setRaw(acc);
        const p = parseSlides(acc);
        if (p) setParsed(p);
      },
    });
    setStreaming(false);
    if (!result.ok) {
      setError(result.error ?? "Stream failed");
      return;
    }
    const final = parseSlides(result.text);
    if (!final) {
      setError(
        "Couldn't parse the AI's output as a slide list. Try regenerating.",
      );
      return;
    }
    setParsed(final);
  };

  const accept = async () => {
    if (!parsed || accepting) return;
    setAccepting(true);
    setError(null);
    try {
      const r = await api.news.deriveLesson(articleSlug, {
        slides: parsed.slides,
      });
      navigate(`/paths/${r.pathSlug}/lessons/${r.nodeSlug}/edit`);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save lesson");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh]">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm animate-fade-in"
      />
      <div
        className="relative w-full max-w-2xl bg-card border border-border rounded-xl shadow-floating overflow-hidden max-h-[85vh] flex flex-col animate-fade-in"
        role="dialog"
        aria-modal="true"
        aria-label="Turn article into lesson"
      >
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-primary" strokeWidth={1.8} />
            <div>
              <h2 className="text-base font-semibold">Turn this into a lesson</h2>
              <p className="text-xs text-muted-foreground truncate max-w-md">
                {articleTitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors duration-fast"
            aria-label="Close"
          >
            <X className="w-5 h-5" strokeWidth={1.8} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 flex-1 overflow-y-auto">
          <p className="text-sm text-muted-foreground">
            The AI will draft a lesson scaffold from your article — concept
            slides followed by check-your-understanding questions. You'll edit
            and publish in the lesson editor afterward.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs">
              <span className="block text-muted-foreground mb-1">
                Concept slides
              </span>
              <input
                type="number"
                min={2}
                max={8}
                value={textSlides}
                onChange={(e) =>
                  setTextSlides(
                    Math.max(2, Math.min(8, Number(e.target.value) || 5)),
                  )
                }
                disabled={streaming}
                className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="text-xs">
              <span className="block text-muted-foreground mb-1">
                Question slides
              </span>
              <input
                type="number"
                min={0}
                max={6}
                value={questionSlides}
                onChange={(e) =>
                  setQuestionSlides(
                    Math.max(0, Math.min(6, Number(e.target.value) || 3)),
                  )
                }
                disabled={streaming}
                className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          </div>

          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}

          {(streaming || parsed || raw) && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 max-h-[40vh] overflow-y-auto">
              <div className="text-[10px] uppercase tracking-wider text-primary mb-2 flex items-center gap-2">
                <span>Lesson scaffold</span>
                {streaming && (
                  <span className="inline-flex items-center gap-1 text-muted-foreground normal-case tracking-normal">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    streaming…
                  </span>
                )}
                {!streaming && parsed && (
                  <span className="text-muted-foreground normal-case tracking-normal">
                    · {parsed.slides.length} slides
                  </span>
                )}
              </div>
              {parsed ? (
                <ol className="space-y-2 text-sm">
                  {parsed.slides.map((s: any, i: number) => (
                    <li
                      key={i}
                      className="flex gap-2 items-baseline"
                    >
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-16 flex-shrink-0">
                        {s.kind === "question" ? "question" : "concept"}
                      </span>
                      <span className="flex-1 text-foreground">
                        {s.kind === "question"
                          ? s.question?.question ?? "(question)"
                          : s.title ?? "(concept)"}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-muted-foreground">
                  {raw || "…"}
                </pre>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-2">
          <button
            onClick={generate}
            disabled={streaming || accepting}
            className="px-4 py-1.5 text-sm rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50"
          >
            {streaming ? "Generating…" : parsed ? "Regenerate" : "Generate"}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={accepting}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={accept}
              disabled={!parsed || streaming || accepting}
              className="px-4 py-1.5 text-sm rounded-md bg-emerald-600 text-white font-medium disabled:opacity-50"
            >
              {accepting ? "Saving…" : "Open in lesson editor"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

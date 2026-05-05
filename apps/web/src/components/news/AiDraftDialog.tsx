import { useState } from "react";
import { streamTokens } from "../../lib/streamTokens";

interface Props {
  // Tags from the current draft, optionally fed into the prompt as a hint.
  tags: string[];
  // Called when the user accepts the streamed draft. The handler
  // typically replaces the editor body with the result.
  onAccept: (body: string) => void;
  onClose: () => void;
}

export function AiDraftDialog({ tags, onAccept, onClose }: Props) {
  const [prompt, setPrompt] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!prompt.trim() || streaming) return;
    setStreaming(true);
    setDraft("");
    setError(null);
    const result = await streamTokens({
      url: "/api/v1/ai/news/draft",
      body: { prompt: prompt.trim(), tags },
      onToken: (_t, acc) => setDraft(acc),
    });
    setStreaming(false);
    if (!result.ok) setError(result.error ?? "Stream failed");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh]">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">✨</span>
            <h2 className="text-base font-semibold">Draft from a prompt</h2>
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

        <div className="px-5 py-4 space-y-3 flex-1 overflow-y-auto">
          <p className="text-sm text-muted-foreground">
            Describe the angle you want and the AI will draft a magazine-style body. You can edit it freely afterward.
          </p>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="e.g. why FlashAttention is fast, aimed at someone who already knows attention but never thought about memory hierarchy"
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {tags.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Tag hint: {tags.map((t) => `#${t}`).join(" ")}
            </div>
          )}
          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}
          {(streaming || draft) && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 max-h-[40vh] overflow-y-auto">
              <div className="text-[10px] uppercase tracking-wider text-primary mb-2 flex items-center gap-2">
                <span>Draft</span>
                {streaming && (
                  <span className="inline-flex items-center gap-1 text-muted-foreground normal-case tracking-normal">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    streaming…
                  </span>
                )}
              </div>
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
                {draft || "…"}
              </pre>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-2">
          <button
            onClick={generate}
            disabled={!prompt.trim() || streaming}
            className="px-4 py-1.5 text-sm rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50"
          >
            {streaming ? "Generating…" : draft ? "Regenerate" : "Generate"}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={() => onAccept(draft)}
              disabled={!draft || streaming}
              className="px-4 py-1.5 text-sm rounded-md bg-emerald-600 text-white font-medium disabled:opacity-50"
            >
              Use this draft
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { streamTokens } from "../../lib/streamTokens";
import { MarkdownRenderer } from "../MarkdownRenderer";

interface Props {
  articleSlug: string;
}

type Mode = "tldr" | "explain";

const LABEL: Record<Mode, string> = {
  tldr: "TL;DR",
  explain: "Explain like I'm new",
};

const ICON: Record<Mode, string> = {
  tldr: "✨",
  explain: "🧒",
};

export function AiArticleHelpers({ articleSlug }: Props) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (m: Mode) => {
    if (streaming) return;
    setMode(m);
    setText("");
    setError(null);
    setStreaming(true);
    const result = await streamTokens({
      url: `/api/v1/ai/article/${m}`,
      body: { slug: articleSlug },
      onToken: (_t, acc) => setText(acc),
    });
    setStreaming(false);
    if (!result.ok) setError(result.error ?? "Stream failed");
  };

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-2">
        {(["tldr", "explain"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => run(m)}
            disabled={streaming}
            className={`px-3 py-1.5 rounded-full border text-sm flex items-center gap-2 transition-colors ${
              mode === m
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:bg-accent/40"
            } disabled:opacity-50`}
          >
            <span>{ICON[m]}</span>
            <span className="font-medium">{LABEL[m]}</span>
          </button>
        ))}
      </div>

      {(text || streaming || error) && mode && (
        <div className="mt-3 rounded-xl border border-border bg-gradient-to-br from-primary/5 to-transparent p-4">
          <div className="text-[10px] uppercase tracking-wider text-primary mb-2 flex items-center gap-2">
            <span>{ICON[mode]} {LABEL[mode]}</span>
            {streaming && (
              <span className="inline-flex items-center gap-1 text-muted-foreground normal-case tracking-normal">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                streaming…
              </span>
            )}
          </div>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <div className="prose-sm max-w-none">
              <MarkdownRenderer
                content={text}
                className="[&_p]:text-sm [&_p]:mb-2"
                untrusted
                allowViz={false}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

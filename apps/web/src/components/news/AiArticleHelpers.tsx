import { useState } from "react";
import { Baby, Sparkles, type LucideIcon } from "lucide-react";
import { streamTokens } from "../../lib/streamTokens";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { Button } from "../ui/Button";

interface Props {
  articleSlug: string;
}

type Mode = "tldr" | "explain";

const LABEL: Record<Mode, string> = {
  tldr: "TL;DR",
  explain: "Explain simpler",
};

const ICON: Record<Mode, LucideIcon> = {
  tldr: Sparkles,
  explain: Baby,
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
        {(["tldr", "explain"] as Mode[]).map((m) => {
          const Icon = ICON[m];
          const active = mode === m;
          return (
            <Button
              key={m}
              variant={active ? "secondary" : "outline"}
              size="sm"
              onClick={() => run(m)}
              disabled={streaming}
              className="rounded-full"
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={1.8} />
              <span>{LABEL[m]}</span>
            </Button>
          );
        })}
      </div>

      {(text || streaming || error) && mode && (
        <div className="mt-3 rounded-lg border border-border bg-muted/40 p-4 animate-fade-in">
          <div className="text-[10px] uppercase tracking-wider text-primary mb-2 flex items-center gap-2">
            <Sparkles className="w-3 h-3" strokeWidth={2} />
            <span>{LABEL[mode]}</span>
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

import { useRef } from "react";
import type { NewsAccentColor } from "@axiomic/types";
import { NEWS_ACCENT_COLORS } from "@axiomic/types";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { VizPickerButton } from "../VizPickerButton";
import { NewsCover } from "./NewsCover";

const ACCENT_DOT: Record<NewsAccentColor, string> = {
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
  amber: "bg-amber-500",
  sky: "bg-sky-500",
  violet: "bg-violet-500",
};

export interface NewsDraft {
  slug: string;
  title: string;
  summary: string;
  body: string;
  coverEmoji: string;
  accentColor: NewsAccentColor;
  tags: string[];
}

interface Props {
  draft: NewsDraft;
  onChange: (next: NewsDraft) => void;
  // When true, slug field is editable (create + propose modes); when
  // false, slug is read-only (direct edit by author).
  slugEditable: boolean;
  // Render the title-area as a text input. False on propose mode (we
  // still show it but allow edit), true on create + edit. Always true
  // for now — kept as a hook for future reduced-form modes.
  showMetaFields?: boolean;
  // Toggles the preview pane (set by parent so it can persist across
  // unrelated state changes).
  showPreview: boolean;
  onTogglePreview: () => void;
}

export function NewsEditor({
  draft,
  onChange,
  slugEditable,
  showPreview,
  onTogglePreview,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const set = <K extends keyof NewsDraft>(k: K, v: NewsDraft[K]) =>
    onChange({ ...draft, [k]: v });

  const insertAtCursor = (snippet: string) => {
    const ta = textareaRef.current;
    const current = draft.body;
    if (!ta) {
      set("body", current + snippet);
      return;
    }
    const start = ta.selectionStart ?? current.length;
    const end = ta.selectionEnd ?? current.length;
    const next = current.slice(0, start) + snippet + current.slice(end);
    set("body", next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + snippet.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="space-y-4">
      {/* Live cover preview — updates with the emoji + accent. */}
      <div className="rounded-xl overflow-hidden border border-border">
        <NewsCover emoji={draft.coverEmoji || "📰"} accent={draft.accentColor} size="md" />
      </div>

      <div className="grid sm:grid-cols-[1fr_auto_auto] gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Title
          </label>
          <input
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="A bold, magazine-style headline."
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-base font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Cover emoji
          </label>
          <input
            value={draft.coverEmoji}
            onChange={(e) => set("coverEmoji", e.target.value)}
            placeholder="📰"
            maxLength={4}
            className="w-20 px-3 py-2 rounded-md border border-input bg-background text-2xl text-center focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Accent
          </label>
          <div className="flex gap-1 py-2">
            {NEWS_ACCENT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set("accentColor", c)}
                aria-label={c}
                className={`w-6 h-6 rounded-full ${ACCENT_DOT[c]} transition-transform ${
                  draft.accentColor === c
                    ? "ring-2 ring-offset-2 ring-offset-background ring-foreground scale-110"
                    : "hover:scale-110"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Slug{" "}
          <span className="font-mono text-[10px]">(/news/{draft.slug || "..."})</span>
        </label>
        <input
          value={draft.slug}
          onChange={(e) => slugEditable && set("slug", e.target.value)}
          placeholder="kebab-case-headline"
          disabled={!slugEditable}
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          One-line summary
        </label>
        <input
          value={draft.summary}
          onChange={(e) => set("summary", e.target.value)}
          placeholder="One sentence that hooks the reader on the list view."
          maxLength={500}
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Tags{" "}
          <span className="text-[10px]">(comma-separated, max 8)</span>
        </label>
        <input
          value={draft.tags.join(", ")}
          onChange={(e) =>
            set(
              "tags",
              e.target.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            )
          }
          placeholder="research, transformers, tokenization"
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {draft.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {draft.tags.slice(0, 8).map((t) => (
              <span
                key={t}
                className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Body</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onTogglePreview}
            className={`px-3 py-1 rounded-md text-xs ${
              showPreview ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
            }`}
          >
            {showPreview ? "Editor" : "Preview"}
          </button>
          {!showPreview && <VizPickerButton onPick={insertAtCursor} />}
        </div>
      </div>

      {showPreview ? (
        <div className="min-h-[400px] p-6 rounded-lg border border-border bg-card">
          <MarkdownRenderer content={draft.body} />
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={draft.body}
          onChange={(e) => set("body", e.target.value)}
          className="w-full min-h-[400px] p-4 rounded-lg border border-input bg-background font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder={"Markdown supported, plus $LaTeX$, fenced code, and ::viz[name] embeds.\n\nTip: drop a heatmap or tokenizer into the middle of an article with the + Insert viz button."}
        />
      )}
    </div>
  );
}

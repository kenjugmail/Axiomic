import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { NewsAccentColor } from "@axiomic/types";
import { NEWS_ACCENT_COLORS } from "@axiomic/types";
import { api } from "../../lib/api";
import { RichComposer } from "../composer/RichComposer";
import { NewsCover } from "./NewsCover";

const ACCENT_DOT: Record<NewsAccentColor, string> = {
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
  amber: "bg-amber-500",
  sky: "bg-sky-500",
  violet: "bg-violet-500",
};

export interface NewsDraftReference {
  text: string;
  url?: string;
}

export interface NewsDraft {
  slug: string;
  title: string;
  summary: string;
  body: string;
  coverEmoji: string;
  accentColor: NewsAccentColor;
  tags: string[];
  abstract: string;
  references: NewsDraftReference[];
  coauthors: string[];
}

interface Props {
  draft: NewsDraft;
  onChange: (next: NewsDraft) => void;
  // When true, slug field is editable (create + propose modes); when
  // false, slug is read-only (direct edit by author).
  slugEditable: boolean;
}

export function NewsEditor({ draft, onChange, slugEditable }: Props) {
  const set = <K extends keyof NewsDraft>(k: K, v: NewsDraft[K]) =>
    onChange({ ...draft, [k]: v });

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

      <TagsRow draft={draft} setTags={(tags) => set("tags", tags)} />

      <ResearchPaperFields
        draft={draft}
        setAbstract={(abstract) => set("abstract", abstract)}
        setReferences={(refs) => set("references", refs)}
        setCoauthors={(co) => set("coauthors", co)}
      />

      <div>
        <span className="text-xs font-medium text-muted-foreground">Body</span>
      </div>

      <RichComposer
        value={draft.body}
        onChange={(body) => set("body", body)}
        rows={18}
        showCodeButton
        placeholder={
          "Markdown supported, plus $LaTeX$, fenced code, ::viz[name] embeds, and :::code[python] runnable cells.\n\nTip: drop a heatmap or runnable code block from the toolbar."
        }
      />
    </div>
  );
}

function TagsRow({
  draft,
  setTags,
}: {
  draft: NewsDraft;
  setTags: (next: string[]) => void;
}) {
  const [suggesting, setSuggesting] = useState(false);

  const suggest = async () => {
    if (suggesting || !draft.title.trim()) return;
    setSuggesting(true);
    try {
      const res = await api.ai.suggestTags({
        title: draft.title,
        summary: draft.summary,
        body: draft.body,
      });
      // Merge suggestions on top of existing tags, dedupe, cap at 8.
      const merged: string[] = [];
      for (const t of [...res.tags, ...draft.tags]) {
        if (!merged.includes(t)) merged.push(t);
        if (merged.length >= 8) break;
      }
      setTags(merged);
    } catch {
      // ignore
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-medium text-muted-foreground">
          Tags{" "}
          <span className="text-[10px]">(comma-separated, max 8)</span>
        </label>
        <button
          type="button"
          onClick={suggest}
          disabled={suggesting || !draft.title.trim()}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50 transition-colors duration-fast"
          title="Suggest tags from the title + summary + body"
        >
          <Sparkles className="w-3 h-3" strokeWidth={2} />
          {suggesting ? "Thinking…" : "Suggest tags"}
        </button>
      </div>
      <input
        value={draft.tags.join(", ")}
        onChange={(e) =>
          setTags(
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
  );
}


function ResearchPaperFields({
  draft,
  setAbstract,
  setReferences,
  setCoauthors,
}: {
  draft: NewsDraft;
  setAbstract: (s: string) => void;
  setReferences: (refs: NewsDraftReference[]) => void;
  setCoauthors: (cos: string[]) => void;
}) {
  const hasContent =
    draft.abstract.length > 0 ||
    draft.references.length > 0 ||
    draft.coauthors.length > 0;

  return (
    <details className="rounded-lg border border-border bg-muted/30" open={hasContent}>
      <summary className="px-4 py-2 cursor-pointer text-sm font-medium select-none">
        Research-paper fields{" "}
        <span className="text-xs text-muted-foreground font-normal">
          (abstract · references · coauthors — optional)
        </span>
      </summary>
      <div className="px-4 pb-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Abstract
          </label>
          <textarea
            value={draft.abstract}
            onChange={(e) => setAbstract(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="One or two paragraphs that frame the article. Renders above the body in the article view."
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Coauthors{" "}
            <span className="text-[10px]">
              (comma-separated usernames; you don't need to add yourself)
            </span>
          </label>
          <input
            value={draft.coauthors.join(", ")}
            onChange={(e) =>
              setCoauthors(
                e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
            placeholder="alice, bob"
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-muted-foreground">
              References ({draft.references.length})
            </label>
            <button
              type="button"
              onClick={() =>
                setReferences([...draft.references, { text: "", url: "" }])
              }
              className="text-xs px-2 py-1 rounded border border-dashed border-border hover:bg-accent/40"
            >
              + Add reference
            </button>
          </div>
          <ol className="space-y-2 list-decimal list-inside">
            {draft.references.map((ref, i) => (
              <li key={i} className="ml-2">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px_auto] gap-2 items-start">
                  <input
                    value={ref.text}
                    onChange={(e) => {
                      const next = [...draft.references];
                      next[i] = { ...ref, text: e.target.value };
                      setReferences(next);
                    }}
                    placeholder="Vaswani et al., Attention Is All You Need (2017)"
                    className="px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <input
                    value={ref.url ?? ""}
                    onChange={(e) => {
                      const next = [...draft.references];
                      next[i] = { ...ref, url: e.target.value };
                      setReferences(next);
                    }}
                    placeholder="https://arxiv.org/abs/1706.03762"
                    className="px-3 py-1.5 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setReferences(draft.references.filter((_, idx) => idx !== i))
                    }
                    className="text-xs px-2 py-1 rounded text-muted-foreground hover:text-destructive"
                    aria-label="Remove reference"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-[10px] text-muted-foreground mt-2">
            In the body, cite as [1], [2], etc. References are auto-numbered
            on save.
          </p>
        </div>
      </div>
    </details>
  );
}

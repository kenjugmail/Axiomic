import { useEffect, useRef, useState } from "react";
import {
  Bold,
  BookOpen,
  Code,
  Heading,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Paperclip,
  Quote,
  Sparkles,
  Terminal,
} from "lucide-react";
import { VizPicker, type VizCatalogEntry } from "../lesson/VizPicker";
import { uploadFile, type UploadResult } from "../../lib/uploads";
import { api } from "../../lib/api";
import { toast } from "../../stores/toast";

interface Props {
  // The textarea / contenteditable to insert into. We keep this loose
  // so the toolbar can drive a textarea in the wiki editor and a
  // textarea-backed forum composer with the same code.
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  // Called whenever text is inserted; consumers update their state.
  onChange: (next: string) => void;
  // Whether the viz button should be visible. Forum + lesson-text
  // surfaces want it; question editors do not.
  showVizButton?: boolean;
  // Whether file/image upload buttons should be visible. Forum/wiki
  // both want this.
  showUploadButton?: boolean;
  // Sprint 22 — opt-in code-cell insertion button. Off by default;
  // surfaces that render their content with a trusted codeKernelKey
  // (research papers, news articles, lessons, wiki) flip this on.
  showCodeButton?: boolean;
  // Trailing slot — used to drop in AI helper buttons.
  trailing?: React.ReactNode;
}

// Insert text at the current selection, replacing it. Updates the
// textarea + fires onChange. wraps mode wraps the selection with
// before/after markers; otherwise the placeholder is inserted.
function insertAt(
  textarea: HTMLTextAreaElement,
  before: string,
  after: string,
  placeholder: string,
  onChange: (next: string) => void,
) {
  const value = textarea.value;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = value.slice(start, end) || placeholder;
  const next = value.slice(0, start) + before + selected + after + value.slice(end);
  onChange(next);
  // Move cursor past the inserted block.
  requestAnimationFrame(() => {
    textarea.focus();
    const cursor = start + before.length + selected.length + after.length;
    textarea.setSelectionRange(cursor, cursor);
  });
}

function insertLine(
  textarea: HTMLTextAreaElement,
  prefix: string,
  placeholder: string,
  onChange: (next: string) => void,
) {
  const value = textarea.value;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = value.slice(start, end);
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const head = value.slice(0, lineStart);
  const body = value.slice(lineStart, end) || placeholder;
  const next =
    head + prefix + body + value.slice(end);
  onChange(next);
  requestAnimationFrame(() => {
    textarea.focus();
    const cursor = lineStart + prefix.length + body.length;
    textarea.setSelectionRange(cursor, cursor);
  });
  void selected;
}

export function MarkdownToolbar({
  textareaRef,
  onChange,
  showVizButton = true,
  showUploadButton = true,
  showCodeButton = false,
  trailing,
}: Props) {
  const [vizOpen, setVizOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Sprint 17 — concept-link picker. Clicking the button drops a
  // small floating search box; selecting a result inserts a
  // `[[slug]]` snippet at the caret. Reuses the existing wiki search
  // endpoint (apps/server/src/routes/wiki.ts).
  const [conceptPickerOpen, setConceptPickerOpen] = useState(false);
  const [conceptQuery, setConceptQuery] = useState("");
  const [conceptResults, setConceptResults] = useState<
    Array<{ slug: string; title: string }>
  >([]);
  const conceptDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!conceptPickerOpen) {
      setConceptResults([]);
      return;
    }
    if (conceptDebounceRef.current) {
      window.clearTimeout(conceptDebounceRef.current);
    }
    const q = conceptQuery.trim();
    if (q.length < 2) {
      setConceptResults([]);
      return;
    }
    conceptDebounceRef.current = window.setTimeout(() => {
      api.wiki
        .search(q)
        .then((r) =>
          setConceptResults(
            r.results.slice(0, 6).map((p: any) => ({
              slug: p.slug,
              title: p.title,
            })),
          ),
        )
        .catch(() => setConceptResults([]));
    }, 150);
    return () => {
      if (conceptDebounceRef.current) {
        window.clearTimeout(conceptDebounceRef.current);
      }
    };
  }, [conceptQuery, conceptPickerOpen]);

  const ta = () => textareaRef.current;

  const onUpload = async (file: File) => {
    if (!ta() || uploading) return;
    setUploading(true);
    try {
      const r: UploadResult = await uploadFile(file);
      const isImage = r.kind === "image";
      const isVideo = r.kind === "video";
      const snippet = isImage
        ? `\n\n![${r.originalName}](${r.url})\n\n`
        : isVideo
          ? `\n\n:::video[id=${r.id}]\n\n`
          : `\n\n[${r.originalName}](${r.url})\n\n`;
      const t = ta()!;
      const value = t.value;
      const pos = t.selectionEnd;
      onChange(value.slice(0, pos) + snippet + value.slice(pos));
      requestAnimationFrame(() => {
        t.focus();
        const cursor = pos + snippet.length;
        t.setSelectionRange(cursor, cursor);
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onPickConcept = (slug: string) => {
    if (!ta()) return;
    const t = ta()!;
    const value = t.value;
    const start = t.selectionStart;
    const end = t.selectionEnd;
    const selected = value.slice(start, end);
    // Selected text becomes the display label; otherwise just the slug.
    const snippet =
      selected && selected !== slug ? `[[${slug}|${selected}]]` : `[[${slug}]]`;
    const next = value.slice(0, start) + snippet + value.slice(end);
    onChange(next);
    setConceptPickerOpen(false);
    setConceptQuery("");
    setConceptResults([]);
    requestAnimationFrame(() => {
      t.focus();
      const cursor = start + snippet.length;
      t.setSelectionRange(cursor, cursor);
    });
  };

  const onPickViz = (entry: VizCatalogEntry) => {
    if (!ta()) return;
    const snippet = `\n\n:::viz[${entry.name}]\n\n`;
    const t = ta()!;
    const value = t.value;
    const pos = t.selectionEnd;
    onChange(value.slice(0, pos) + snippet + value.slice(pos));
    requestAnimationFrame(() => {
      t.focus();
      const cursor = pos + snippet.length;
      t.setSelectionRange(cursor, cursor);
    });
  };

  // Sprint 22 — insert an empty :::code[python] block at the caret.
  // The reader runs it via the embedded CodeCell once published.
  const onInsertCodeCell = () => {
    if (!ta()) return;
    const snippet = `\n\n:::code[python]\n# Edit and run\nimport numpy as np\nx = np.linspace(0, 1, 5)\nprint(x)\n:::\n\n`;
    const t = ta()!;
    const value = t.value;
    const pos = t.selectionEnd;
    onChange(value.slice(0, pos) + snippet + value.slice(pos));
    requestAnimationFrame(() => {
      t.focus();
      const cursor = pos + snippet.length;
      t.setSelectionRange(cursor, cursor);
    });
  };

  const btnClass =
    "p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40 disabled:opacity-50";

  return (
    <div className="flex items-center gap-0.5 flex-wrap p-1 border border-border rounded-md bg-card">
      <button
        type="button"
        title="Bold"
        onClick={() => ta() && insertAt(ta()!, "**", "**", "bold", onChange)}
        className={btnClass}
      >
        <Bold className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
      <button
        type="button"
        title="Italic"
        onClick={() => ta() && insertAt(ta()!, "*", "*", "italic", onChange)}
        className={btnClass}
      >
        <Italic className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
      <button
        type="button"
        title="Heading"
        onClick={() => ta() && insertLine(ta()!, "## ", "Heading", onChange)}
        className={btnClass}
      >
        <Heading className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
      <button
        type="button"
        title="Quote"
        onClick={() => ta() && insertLine(ta()!, "> ", "quote", onChange)}
        className={btnClass}
      >
        <Quote className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
      <button
        type="button"
        title="Bulleted list"
        onClick={() => ta() && insertLine(ta()!, "- ", "list item", onChange)}
        className={btnClass}
      >
        <List className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
      <button
        type="button"
        title="Numbered list"
        onClick={() => ta() && insertLine(ta()!, "1. ", "list item", onChange)}
        className={btnClass}
      >
        <ListOrdered className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
      <button
        type="button"
        title="Link"
        onClick={() =>
          ta() && insertAt(ta()!, "[", "](https://)", "text", onChange)
        }
        className={btnClass}
      >
        <LinkIcon className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
      <button
        type="button"
        title="Inline code"
        onClick={() => ta() && insertAt(ta()!, "`", "`", "code", onChange)}
        className={btnClass}
      >
        <Code className="w-3.5 h-3.5" strokeWidth={2} />
      </button>

      {showUploadButton && (
        <>
          <div className="w-px h-5 bg-border mx-1" />
          <label
            className={`${btnClass} cursor-pointer inline-flex items-center`}
            title="Upload image (png/jpg/gif/webp)"
          >
            <ImageIcon className="w-3.5 h-3.5" strokeWidth={2} />
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
                e.target.value = "";
              }}
            />
          </label>
          <label
            className={`${btnClass} cursor-pointer inline-flex items-center`}
            title="Upload file (mp4/webm/pdf)"
          >
            <Paperclip className="w-3.5 h-3.5" strokeWidth={2} />
            <input
              type="file"
              accept="video/mp4,video/webm,application/pdf"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
                e.target.value = "";
              }}
            />
          </label>
        </>
      )}

      <div className="w-px h-5 bg-border mx-1" />
      {/* Sprint 17 — concept-link picker. Inserts `[[slug]]` (or
          `[[slug|selected text]]` when there's a selection) so prose
          across wiki / forum / news / lessons cross-links to wiki
          concepts with hover previews. */}
      <div className="relative">
        <button
          type="button"
          title="Link to a concept"
          onClick={() => setConceptPickerOpen((v) => !v)}
          className={`${btnClass} inline-flex items-center gap-1`}
        >
          <BookOpen className="w-3.5 h-3.5" strokeWidth={2} />
          <span className="text-[11px]">concept</span>
        </button>
        {conceptPickerOpen && (
          <div className="absolute top-full left-0 mt-1 z-30 w-64 rounded-md border border-border bg-card shadow-floating p-1.5">
            <input
              autoFocus
              value={conceptQuery}
              onChange={(e) => setConceptQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setConceptPickerOpen(false);
                  setConceptQuery("");
                }
              }}
              placeholder="Search concepts…"
              className="w-full px-2 py-1 rounded border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="mt-1 max-h-56 overflow-y-auto">
              {conceptResults.length === 0 ? (
                <p className="text-xs text-muted-foreground p-2 italic">
                  {conceptQuery.length < 2
                    ? "Type to search wiki pages."
                    : "No matches."}
                </p>
              ) : (
                conceptResults.map((r) => (
                  <button
                    key={r.slug}
                    type="button"
                    onClick={() => onPickConcept(r.slug)}
                    className="w-full text-left px-2 py-1 rounded hover:bg-accent/40"
                  >
                    <div className="text-sm font-medium">{r.title}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">
                      [[{r.slug}]]
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {showVizButton && (
        <>
          <div className="w-px h-5 bg-border mx-1" />
          <button
            type="button"
            title="Insert visualization"
            onClick={() => setVizOpen(true)}
            className={`${btnClass} inline-flex items-center gap-1`}
          >
            <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
            <span className="text-[11px]">viz</span>
          </button>
        </>
      )}

      {showCodeButton && (
        <>
          <div className="w-px h-5 bg-border mx-1" />
          <button
            type="button"
            title="Insert runnable Python cell"
            onClick={onInsertCodeCell}
            className={`${btnClass} inline-flex items-center gap-1`}
          >
            <Terminal className="w-3.5 h-3.5" strokeWidth={2} />
            <span className="text-[11px]">code</span>
          </button>
        </>
      )}

      {trailing && (
        <>
          <div className="w-px h-5 bg-border mx-1" />
          {trailing}
        </>
      )}

      <VizPicker
        open={vizOpen}
        onClose={() => setVizOpen(false)}
        onPick={onPickViz}
      />
    </div>
  );
}

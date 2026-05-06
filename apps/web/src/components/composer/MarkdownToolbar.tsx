import { useState } from "react";
import {
  Bold,
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
} from "lucide-react";
import { VizPicker, type VizCatalogEntry } from "../lesson/VizPicker";
import { uploadFile, type UploadResult } from "../../lib/uploads";

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
  trailing,
}: Props) {
  const [vizOpen, setVizOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

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
      alert(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
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

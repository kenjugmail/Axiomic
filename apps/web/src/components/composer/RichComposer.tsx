import { useEffect, useRef, useState } from "react";
import { Eye, Pencil } from "lucide-react";
import { api } from "../../lib/api";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { MarkdownToolbar } from "./MarkdownToolbar";

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  // Fields disable a few affordances on tiny composer surfaces (e.g. the
  // forum quick-reply could pass `compact` to hide preview tab + viz).
  compact?: boolean;
  // The viz button defaults on; comment-style surfaces may want it off.
  showVizButton?: boolean;
  // Whether @mention autocomplete is wired. Off for surfaces with no
  // social context (none today, but a knob for future).
  enableMentions?: boolean;
}

// Shared rich-composer used by forum topic creation, forum replies, and
// any other markdown-text input that wants formatting + uploads + viz +
// @mentions + a live preview tab.
export function RichComposer({
  value,
  onChange,
  placeholder,
  rows = 6,
  compact = false,
  showVizButton = true,
  enableMentions = true,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [view, setView] = useState<"edit" | "preview">("edit");

  // @mention state. We track the partial token after the most recent
  // unescaped "@" relative to the cursor, query the user-search endpoint
  // (debounced), and render an absolutely-positioned dropdown beneath
  // the textarea.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<
    Array<{ username: string; displayName: string | null }>
  >([]);
  const [mentionIdx, setMentionIdx] = useState(0);

  useEffect(() => {
    if (!enableMentions || mentionQuery === null) {
      setMentionResults([]);
      return;
    }
    const t = setTimeout(() => {
      api.social
        .searchUsers(mentionQuery)
        .then((r) => {
          setMentionResults(r.users);
          setMentionIdx(0);
        })
        .catch(() => setMentionResults([]));
    }, 120);
    return () => clearTimeout(t);
  }, [mentionQuery, enableMentions]);

  // Detect a mention token when the cursor is in or directly after one.
  // We look back from the cursor for an "@" not preceded by a word char,
  // until we hit whitespace or hit the limit.
  const detectMentionToken = () => {
    if (!enableMentions) return;
    const ta = textareaRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart;
    const text = ta.value;
    let i = cursor - 1;
    let token = "";
    while (i >= 0 && /[a-zA-Z0-9_-]/.test(text[i])) {
      token = text[i] + token;
      i--;
    }
    if (i < 0 || text[i] !== "@") {
      setMentionQuery(null);
      return;
    }
    if (i > 0 && /[a-zA-Z0-9_]/.test(text[i - 1])) {
      // The "@" is glued to a word — probably an email. Skip.
      setMentionQuery(null);
      return;
    }
    setMentionQuery(token);
  };

  const acceptMention = (username: string) => {
    if (!textareaRef.current) return;
    const ta = textareaRef.current;
    const cursor = ta.selectionStart;
    const text = ta.value;
    // Find the @ + token start.
    let i = cursor - 1;
    while (i >= 0 && /[a-zA-Z0-9_-]/.test(text[i])) i--;
    if (i < 0 || text[i] !== "@") return;
    const next = text.slice(0, i + 1) + username + " " + text.slice(cursor);
    onChange(next);
    setMentionQuery(null);
    setMentionResults([]);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = i + 1 + username.length + 1;
      ta.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionResults.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIdx((i) => (i + 1) % mentionResults.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIdx(
          (i) => (i - 1 + mentionResults.length) % mentionResults.length,
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const pick = mentionResults[mentionIdx];
        if (pick) acceptMention(pick.username);
        return;
      }
      if (e.key === "Escape") {
        setMentionQuery(null);
        setMentionResults([]);
        return;
      }
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <MarkdownToolbar
          textareaRef={textareaRef}
          onChange={onChange}
          showVizButton={showVizButton}
        />
        {!compact && (
          <div className="flex gap-1 p-0.5 rounded-md bg-muted text-xs">
            <button
              type="button"
              onClick={() => setView("edit")}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded ${
                view === "edit"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Pencil className="w-3 h-3" strokeWidth={2} /> Edit
            </button>
            <button
              type="button"
              onClick={() => setView("preview")}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded ${
                view === "preview"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Eye className="w-3 h-3" strokeWidth={2} /> Preview
            </button>
          </div>
        )}
      </div>

      <div className="relative">
        {view === "preview" ? (
          <div
            className="min-h-[8rem] p-4 rounded-md border border-border bg-card prose-sm max-w-none"
            style={{ minHeight: `${Math.max(8, rows * 1.5)}rem` }}
          >
            {value.trim() ? (
              <MarkdownRenderer content={value} untrusted />
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Nothing to preview yet.
              </p>
            )}
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              detectMentionToken();
            }}
            onKeyUp={detectMentionToken}
            onKeyDown={onKeyDown}
            onClick={detectMentionToken}
            onBlur={() =>
              setTimeout(() => {
                setMentionQuery(null);
                setMentionResults([]);
              }, 150)
            }
            placeholder={placeholder}
            rows={rows}
            className="w-full p-3 rounded-md border border-input bg-background text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          />
        )}

        {view === "edit" && mentionResults.length > 0 && (
          <div className="absolute left-3 bottom-3 z-20 min-w-[200px] rounded-md border border-border bg-card shadow-elevated py-1">
            <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              Mention
            </div>
            {mentionResults.map((u, i) => (
              <button
                key={u.username}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  acceptMention(u.username);
                }}
                onMouseEnter={() => setMentionIdx(i)}
                className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between gap-3 ${
                  i === mentionIdx
                    ? "bg-accent/40 text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                <span className="font-mono">@{u.username}</span>
                {u.displayName && (
                  <span className="text-xs text-muted-foreground truncate">
                    {u.displayName}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

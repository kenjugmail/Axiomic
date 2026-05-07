import { useState } from "react";
import { Link } from "react-router-dom";
import { X, MessageSquarePlus, AlertTriangle } from "lucide-react";
import type { ClaimThread } from "@axiomic/types";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { RichComposer } from "../composer/RichComposer";
import { useAuthStore } from "../../stores/auth";

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

interface ViewProps {
  mode: "view";
  thread: ClaimThread;
  // True when the article was edited and the original passage no longer
  // exists in the rendered DOM. Surfaced as a small note so participants
  // know why the highlight isn't visible inline.
  anchorLost: boolean;
  onSubmitReply: (content: string) => Promise<void>;
  onClose: () => void;
}

interface CreateProps {
  mode: "create";
  // The selection the user wants to discuss. Shown as a quote at the top.
  exact: string;
  onSubmit: (body: string) => Promise<void>;
  onClose: () => void;
}

type Props = ViewProps | CreateProps;

export function ClaimThreadPanel(props: Props) {
  const user = useAuthStore((s) => s.user);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!draft.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (props.mode === "create") {
        await props.onSubmit(draft.trim());
      } else {
        await props.onSubmitReply(draft.trim());
      }
      setDraft("");
    } catch (e: any) {
      setError(e?.message ?? "Could not post");
    } finally {
      setSubmitting(false);
    }
  };

  const exact = props.mode === "create" ? props.exact : props.thread.exact;
  const titleText =
    props.mode === "create"
      ? "Discuss this claim"
      : `Thread by @${props.thread.authorUsername}`;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-[28rem] flex flex-col bg-card border-l border-border shadow-floating animate-fade-in">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider text-primary mb-0.5 flex items-center gap-1.5">
            <MessageSquarePlus className="w-3 h-3" strokeWidth={2} />
            Claim thread
          </div>
          <h2 className="text-sm font-semibold truncate">{titleText}</h2>
        </div>
        <button
          onClick={props.onClose}
          className="text-muted-foreground hover:text-foreground -mr-1"
          aria-label="Close panel"
        >
          <X className="w-5 h-5" strokeWidth={1.8} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <blockquote className="text-sm border-l-4 border-primary/40 pl-3 py-1 italic text-foreground/80">
          “{exact}”
        </blockquote>

        {props.mode === "view" && props.anchorLost && (
          <div className="flex items-start gap-2 text-xs px-3 py-2 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" strokeWidth={2} />
            <span>
              The passage was edited or removed in a later revision. The
              discussion is preserved here, but no longer highlights inline
              in the article.
            </span>
          </div>
        )}

        {props.mode === "view" && (
          <div className="space-y-3">
            {props.thread.replies.map((r) => (
              <div key={r.id} className="text-sm">
                <div className="flex items-baseline gap-2 text-xs text-muted-foreground mb-0.5">
                  <Link
                    to={`/profile/${r.username}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    @{r.username}
                  </Link>
                  <span>{timeAgo(r.createdAt)}</span>
                  {r.editedAt && <span className="italic">· edited</span>}
                </div>
                <MarkdownRenderer
                  content={r.content}
                  className="[&_p]:mb-1 [&_p]:text-sm"
                  untrusted
                  allowViz={false}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-border space-y-2">
        {!user ? (
          <p className="text-sm text-muted-foreground">
            <Link to="/login" className="text-primary hover:underline">
              Sign in
            </Link>{" "}
            to join this thread.
          </p>
        ) : (
          <>
            <RichComposer
              value={draft}
              onChange={setDraft}
              placeholder={
                props.mode === "create"
                  ? "What's your take on this claim?"
                  : "Reply to the thread…"
              }
              rows={3}
              compact
              showVizButton={false}
            />
            {error && <div className="text-xs text-destructive">{error}</div>}
            <div className="flex justify-end">
              <button
                onClick={submit}
                disabled={submitting || !draft.trim()}
                className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
              >
                {submitting
                  ? "Posting…"
                  : props.mode === "create"
                    ? "Start thread"
                    : "Reply"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

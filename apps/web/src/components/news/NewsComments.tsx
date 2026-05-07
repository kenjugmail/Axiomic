import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import type { NewsCommentNode } from "@axiomic/types";
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

interface Props {
  articleSlug: string;
}

export function NewsComments({ articleSlug }: Props) {
  const user = useAuthStore((s) => s.user);
  const [comments, setComments] = useState<NewsCommentNode[] | null>(null);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const refresh = () => {
    api.news
      .listComments(articleSlug)
      .then((r) => setComments(r.comments))
      .catch(() => setComments([]));
  };

  useEffect(refresh, [articleSlug]);

  const post = async (content: string, parentId?: string) => {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.news.addComment(articleSlug, {
        content: content.trim(),
        parentId,
      });
      if (parentId) {
        setReplyTo(null);
        setReplyDraft("");
      } else {
        setDraft("");
      }
      refresh();
    } catch (e: any) {
      alert(e?.message ?? "Could not post");
    } finally {
      setSubmitting(false);
    }
  };

  const saveEdit = async (id: string) => {
    if (!editDraft.trim()) return;
    setSubmitting(true);
    try {
      await api.news.editComment(id, { content: editDraft.trim() });
      setEditingId(null);
      setEditDraft("");
      refresh();
    } catch (e: any) {
      alert(e?.message ?? "Edit failed");
    } finally {
      setSubmitting(false);
    }
  };

  const totalCount = (() => {
    if (!comments) return 0;
    let n = 0;
    const walk = (list: NewsCommentNode[]) => {
      for (const c of list) {
        n++;
        walk(c.children);
      }
    };
    walk(comments);
    return n;
  })();

  const renderComment = (c: NewsCommentNode, depth: number) => {
    const isMine = !!user && user.id === c.userId;
    const isEditing = editingId === c.id;
    return (
      <div
        key={c.id}
        id={`comment-${c.id}`}
        className={`pt-3 ${depth > 0 ? "border-l border-border pl-4 ml-2" : ""}`}
      >
        <div className="flex items-baseline gap-2 text-sm">
          <Link
            to={`/profile/${c.username}`}
            className="font-medium hover:underline"
          >
            @{c.username}
          </Link>
          <span className="text-xs text-muted-foreground">
            {timeAgo(c.createdAt)}
            {c.editedAt && " · edited"}
          </span>
        </div>
        {isEditing ? (
          <div className="mt-2 space-y-2">
            <RichComposer
              value={editDraft}
              onChange={setEditDraft}
              rows={3}
              compact
              showVizButton={false}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => saveEdit(c.id)}
                disabled={submitting}
                className="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditingId(null);
                  setEditDraft("");
                }}
                className="px-3 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-1 text-sm">
            <MarkdownRenderer
              content={c.content}
              className="[&_p]:mb-1 [&_p]:text-sm"
              untrusted
              allowViz={false}
            />
          </div>
        )}
        {!isEditing && (
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
            {user && depth < 3 && (
              <button
                onClick={() => {
                  setReplyTo(replyTo === c.id ? null : c.id);
                  setReplyDraft("");
                }}
                className="hover:text-foreground"
              >
                {replyTo === c.id ? "Cancel" : "Reply"}
              </button>
            )}
            {isMine && (
              <button
                onClick={() => {
                  setEditingId(c.id);
                  setEditDraft(c.content);
                }}
                className="hover:text-foreground"
              >
                Edit
              </button>
            )}
          </div>
        )}
        {replyTo === c.id && (
          <div className="mt-2 space-y-2">
            <RichComposer
              value={replyDraft}
              onChange={setReplyDraft}
              rows={2}
              placeholder={`Reply to @${c.username}…`}
              compact
              showVizButton={false}
            />
            <button
              onClick={() => post(replyDraft, c.id)}
              disabled={submitting || !replyDraft.trim()}
              className="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
            >
              Reply
            </button>
          </div>
        )}
        {c.children.length > 0 && (
          <div className="mt-2">
            {c.children.map((child) => renderComment(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="mt-12 pt-8 border-t border-border">
      <h2 className="text-xl font-bold mb-4">
        Discussion {totalCount > 0 && <span className="text-muted-foreground font-normal text-sm">· {totalCount}</span>}
      </h2>

      {user ? (
        <div className="space-y-2 mb-6">
          <RichComposer
            value={draft}
            onChange={setDraft}
            rows={3}
            placeholder="Share your thoughts on this article…"
            compact
            showVizButton={false}
          />
          <button
            onClick={() => post(draft)}
            disabled={submitting || !draft.trim()}
            className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            Post comment
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground mb-6">
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>{" "}
          to join the discussion.
        </p>
      )}

      {comments === null ? (
        <div className="h-20 animate-pulse bg-muted rounded-md" />
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <div className="divide-y divide-border">
          {comments.map((c) => renderComment(c, 0))}
        </div>
      )}
    </section>
  );
}

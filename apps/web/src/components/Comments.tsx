import { useState, useEffect, useCallback } from "react";
import { api, type Comment } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { RichComposer } from "./composer/RichComposer";
import { formatDate } from "../lib/dates";

interface CommentsProps {
  pageId: string;
}

export function Comments({ pageId }: CommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [sort, setSort] = useState("new");
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const user = useAuthStore((s) => s.user);

  const loadComments = useCallback(() => {
    setLoading(true);
    api.comments
      .list(pageId, sort)
      .then((data) => setComments(data.comments))
      .finally(() => setLoading(false));
  }, [pageId, sort]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const handleSubmit = async () => {
    if (!newComment.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.comments.create({ pageId, content: newComment.trim() });
      setNewComment("");
      loadComments();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-8 border-t border-border pt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Discussion</h3>
        <div className="flex gap-1 text-sm">
          {["new", "top", "controversial"].map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`px-2 py-1 rounded capitalize ${
                sort === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* New comment form */}
      {user ? (
        <div className="mb-6">
          <RichComposer
            value={newComment}
            onChange={setNewComment}
            placeholder="Share your thoughts... (Markdown and LaTeX supported)"
            rows={3}
            compact
            showVizButton={false}
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={handleSubmit}
              disabled={submitting || !newComment.trim()}
              className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? "Posting..." : "Post comment"}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground mb-6">
          <a href="/login" className="text-primary hover:underline">Sign in</a> to join the discussion.
        </p>
      )}

      {/* Comments list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse h-20 bg-muted rounded-lg" />
          ))}
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No comments yet. Start the discussion!
        </p>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              pageId={pageId}
              onUpdate={loadComments}
              depth={0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CommentItem({
  comment,
  pageId,
  onUpdate,
  depth,
}: {
  comment: Comment;
  pageId: string;
  onUpdate: () => void;
  depth: number;
}) {
  const [replying, setReplying] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const user = useAuthStore((s) => s.user);

  const handleReply = async () => {
    if (!replyContent.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.comments.create({ pageId, content: replyContent.trim(), parentId: comment.id });
      setReplyContent("");
      setReplying(false);
      onUpdate();
    } finally {
      setSubmitting(false);
    }
  };

  const handleVote = async (value: 1 | -1) => {
    if (!user) return;
    await api.comments.vote(comment.id, value);
    onUpdate();
  };

  return (
    <div
      id={`comment-${comment.id}`}
      className={`scroll-mt-20 ${depth > 0 ? "ml-6 border-l-2 border-border pl-4" : ""}`}
    >
      <div className="flex gap-3">
        {/* Vote buttons */}
        <div className="flex flex-col items-center gap-0.5 text-muted-foreground">
          <button
            onClick={() => handleVote(1)}
            className={`p-0.5 hover:text-primary ${comment.userVote === 1 ? "text-primary" : ""}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <span className={`text-xs font-medium ${comment.score > 0 ? "text-primary" : comment.score < 0 ? "text-destructive" : ""}`}>
            {comment.score}
          </span>
          <button
            onClick={() => handleVote(-1)}
            className={`p-0.5 hover:text-destructive ${comment.userVote === -1 ? "text-destructive" : ""}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span className="font-medium text-foreground">{comment.username}</span>
            <span>&middot;</span>
            <span>{formatDate(comment.createdAt)}</span>
            {comment.editedAt && <span className="italic">(edited)</span>}
          </div>
          <div className="text-sm">
            <MarkdownRenderer
              content={comment.content}
              className="[&_p]:mb-1 [&_p]:text-sm"
              untrusted
              allowViz={false}
            />
          </div>
          <div className="flex gap-3 mt-1">
            {user && depth < 3 && (
              <button
                onClick={() => setReplying(!replying)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Reply
              </button>
            )}
          </div>

          {/* Reply form */}
          {replying && (
            <div className="mt-2">
              <RichComposer
                value={replyContent}
                onChange={setReplyContent}
                placeholder="Write a reply..."
                rows={2}
                compact
                showVizButton={false}
              />
              <div className="flex gap-2 mt-1">
                <button
                  onClick={handleReply}
                  disabled={submitting || !replyContent.trim()}
                  className="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs hover:bg-primary/90 disabled:opacity-50"
                >
                  Reply
                </button>
                <button
                  onClick={() => { setReplying(false); setReplyContent(""); }}
                  className="px-3 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Children */}
          {comment.children && comment.children.length > 0 && (
            <div className="mt-3 space-y-3">
              {comment.children.map((child) => (
                <CommentItem
                  key={child.id}
                  comment={child}
                  pageId={pageId}
                  onUpdate={onUpdate}
                  depth={depth + 1}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Network } from "lucide-react";
import { PetByUsername } from "../pet";
import {
  api,
  type ForumPost,
  type ForumTopicDetail,
  type PostType,
} from "../lib/api";
import type { ForumPoll, NewsReactionKind } from "@axiomic/types";
import { useAuthStore } from "../stores/auth";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { TutorMount } from "../components/ai/TutorMount";
import { RelatedRail } from "../components/cross/RelatedRail";
import { RichComposer } from "../components/composer/RichComposer";
import { PostTypeBadge } from "../components/PostTypeBadge";
import { PollEmbed } from "../components/forum/PollEmbed";
import { BookmarkButton } from "../components/social/BookmarkButton";
import { ReactionStrip } from "../components/social/ReactionStrip";
import { formatDate } from "../lib/dates";

export function ForumTopicPage() {
  const { slug } = useParams<{ slug: string }>();
  const [topic, setTopic] = useState<ForumTopicDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  // Sprint 63h — root for the selection-to-chat popover.
  const threadBodyRef = useRef<HTMLDivElement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<string>("");
  const [summarizing, setSummarizing] = useState(false);
  const user = useAuthStore((s) => s.user);

  const load = () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    api.forum
      .getTopic(slug)
      .then((d) => setTopic(d.topic))
      .catch((e) =>
        setError(e?.message ?? "Couldn't load this topic. Try again."),
      )
      .finally(() => setLoading(false));
  };

  // Cancellable initial/route-change load so a slow response for a
  // previous slug can't overwrite the current topic. `load()` stays
  // for user-initiated refreshes (reply/summarize).
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.forum
      .getTopic(slug)
      .then((d) => {
        if (!cancelled) setTopic(d.topic);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e?.message ?? "Couldn't load this topic. Try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const handleReply = async () => {
    if (!slug || !reply.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.forum.reply(slug, { body: reply.trim() });
      setReply("");
      load();
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoteTopic = async (value: 1 | -1) => {
    if (!slug || !user) return;
    await api.forum.voteTopic(slug, value);
    load();
  };

  const handleSummarize = async () => {
    if (!slug) return;
    setSummary("");
    setSummarizing(true);
    try {
      const res = await api.forum.summarize(slug);
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") return;
          try {
            const evt = JSON.parse(data);
            if (evt.token) setSummary((s) => s + evt.token);
          } catch {}
        }
      }
    } finally {
      setSummarizing(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="h-32 animate-pulse bg-muted rounded-lg" />
      </div>
    );
  }

  if (error || !topic) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-3">
        <h1 className="text-xl font-semibold">Couldn't load this topic</h1>
        <p className="text-sm text-muted-foreground">
          {error ?? "The topic may have been deleted or moved."}
        </p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={load}
            className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent/40"
          >
            Retry
          </button>
          <Link
            to="/forum"
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            Back to forum
          </Link>
        </div>
      </div>
    );
  }

  const showSummarize = topic.posts.reduce(
    (count, p) => count + 1 + (p.children?.length || 0),
    0
  ) >= 3;

  return (
    <div ref={threadBodyRef} className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link
        to="/forum"
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        ← Back to forum
      </Link>

      <div className="mt-3 mb-2 flex items-center gap-2">
        <PostTypeBadge type={topic.postType as PostType} />
        <Link
          to={`/forum/${topic.domainSlug}`}
          className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          {topic.domainTitle}
        </Link>
        {topic.wikiPageSlug && (
          <Link
            to={`/wiki/${topic.wikiPageSlug}`}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ↳ {topic.wikiPageTitle}
          </Link>
        )}
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">{topic.title}</h1>
      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 mb-4">
        {/* Phase 10B — bumped from xs (24px) to sm (36px) so the pet
            actually reads as a recognizable mascot next to the OP. */}
        <PetByUsername username={topic.authorUsername} size="sm" />
        <Link
          to={`/profile/${topic.authorUsername}`}
          className="hover:text-foreground"
        >
          @{topic.authorUsername}
        </Link>
        <span>·</span>
        <span>{formatDate(topic.createdAt)}</span>
        <span>·</span>
        <span>{topic.postCount} replies</span>
        {topic.postCount >= 2 && (
          <>
            <span>·</span>
            <Link
              to={`/forum/graph?slug=${encodeURIComponent(topic.slug)}`}
              className="hover:text-foreground inline-flex items-center gap-1"
            >
              <Network className="w-3 h-3" strokeWidth={2} />
              View as graph
            </Link>
          </>
        )}
      </div>

      <div className="flex gap-4">
        <div className="flex flex-col items-center gap-0.5 text-muted-foreground">
          <button
            onClick={() => handleVoteTopic(1)}
            disabled={!user}
            className={`p-0.5 disabled:opacity-50 hover:text-primary ${
              topic.userVote === 1 ? "text-primary" : ""
            }`}
            aria-label="Upvote topic"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <span className="text-sm font-medium">{topic.score}</span>
          <button
            onClick={() => handleVoteTopic(-1)}
            disabled={!user}
            className={`p-0.5 disabled:opacity-50 hover:text-destructive ${
              topic.userVote === -1 ? "text-destructive" : ""
            }`}
            aria-label="Downvote topic"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
        <div className="flex-1 prose prose-sm dark:prose-invert max-w-none">
          <MarkdownRenderer content={topic.body} untrusted />
          {topic.poll && (
            <PollEmbed
              topicSlug={topic.slug}
              poll={topic.poll}
              signedIn={!!user}
              onChange={(next) => setTopic({ ...topic, poll: next })}
            />
          )}
        </div>
      </div>

      {/* Reactions + bookmark — same component used on news articles. */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <ReactionStrip
          signedIn={!!user}
          reactionCounts={topic.reactionCounts}
          myReactions={topic.myReactions}
          onReact={async (kind: NewsReactionKind) => {
            if (!user) return;
            try {
              const res = await api.forum.react(topic.slug, kind);
              setTopic({
                ...topic,
                reactionCounts: res.reactionCounts,
                myReactions: res.myReactions,
              });
            } catch {
              // ignore
            }
          }}
        />
        {user && (
          <BookmarkButton
            bookmarked={topic.myBookmark}
            onToggle={async () => {
              try {
                const res = await api.forum.toggleBookmark(topic.slug);
                setTopic({ ...topic, myBookmark: res.bookmarked });
              } catch {
                // ignore
              }
            }}
          />
        )}
      </div>

      {/* Summarize */}
      {showSummarize && (
        <div className="mt-6 border border-border rounded-lg p-4 bg-card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">AI thread summary</h3>
            <button
              onClick={handleSummarize}
              disabled={summarizing}
              className="text-xs px-2 py-1 rounded-md bg-secondary text-secondary-foreground disabled:opacity-50"
            >
              {summarizing
                ? "Summarizing…"
                : summary
                  ? "Regenerate"
                  : "Summarize thread"}
            </button>
          </div>
          {summary && (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <MarkdownRenderer content={summary} untrusted />
            </div>
          )}
        </div>
      )}

      {/* Sprint 16 — "Practice this" rail when this topic discusses a
          wiki concept that's also taught in mastery nodes. Lets a
          reader who's missing background drop into the lesson before
          weighing in. Hidden when no nodes link in. */}
      {topic.linkedNodes && topic.linkedNodes.length > 0 && (
        <RelatedRail
          title="Background lesson"
          icon="lesson"
          items={topic.linkedNodes.map((n) => ({ kind: "node" as const, ...n }))}
          emptyHint={null}
        />
      )}

      {/* Replies */}
      <div className="mt-8 border-t border-border pt-6">
        <h2 className="text-lg font-semibold mb-4">Replies</h2>
        {user ? (
          <div className="mb-6">
            <RichComposer
              value={reply}
              onChange={setReply}
              rows={4}
              placeholder="Add a reply… Markdown + LaTeX supported. Drag a file to attach. Use @ to mention."
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={handleReply}
                disabled={submitting || !reply.trim()}
                className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting ? "Posting…" : "Post reply"}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground mb-6">
            <Link to="/login" className="text-primary hover:underline">
              Sign in
            </Link>{" "}
            to reply.
          </p>
        )}
        {topic.posts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No replies yet.
          </p>
        ) : (
          <div className="space-y-4">
            {topic.posts.map((p) => (
              <PostItem key={p.id} post={p} slug={topic.slug} onUpdate={load} depth={0} />
            ))}
          </div>
        )}
      </div>

      {/* Sprint 63h — AI tutor mount: floating button + sidebar +
          selection-to-chat for any post body. */}
      <TutorMount
        pageSlug={topic.slug}
        pageTitle={topic.title}
        tier="forum"
        articleRef={threadBodyRef}
      />
    </div>
  );
}

function PostItem({
  post,
  slug,
  onUpdate,
  depth,
}: {
  post: ForumPost;
  slug: string;
  onUpdate: () => void;
  depth: number;
}) {
  const [replying, setReplying] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const user = useAuthStore((s) => s.user);

  const handleReply = async () => {
    if (!replyBody.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.forum.reply(slug, {
        body: replyBody.trim(),
        parentId: post.id,
      });
      setReplyBody("");
      setReplying(false);
      onUpdate();
    } finally {
      setSubmitting(false);
    }
  };

  const handleVote = async (value: 1 | -1) => {
    if (!user) return;
    await api.forum.votePost(post.id, value);
    onUpdate();
  };

  return (
    <div
      id={`post-${post.id}`}
      className={`scroll-mt-20 ${depth > 0 ? "ml-6 border-l-2 border-border pl-4" : ""}`}
    >
      <div className="flex gap-3">
        <div className="flex flex-col items-center gap-0.5 text-muted-foreground">
          <button
            onClick={() => handleVote(1)}
            disabled={!user}
            className={`p-0.5 disabled:opacity-50 hover:text-primary ${
              post.userVote === 1 ? "text-primary" : ""
            }`}
            aria-label="Upvote post"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <span
            className={`text-xs font-medium ${
              post.score > 0
                ? "text-primary"
                : post.score < 0
                  ? "text-destructive"
                  : ""
            }`}
          >
            {post.score}
          </span>
          <button
            onClick={() => handleVote(-1)}
            disabled={!user}
            className={`p-0.5 disabled:opacity-50 hover:text-destructive ${
              post.userVote === -1 ? "text-destructive" : ""
            }`}
            aria-label="Downvote post"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            {/* S88 — pet next to reply author. PetByUsername caches
                per-username at module level, so a thread with N
                replies fires at most one fetch per unique author. */}
            {/* Phase 10B — sm (36px) so equipped cosmetics actually
                render in replies. */}
            <PetByUsername username={post.authorUsername} size="sm" />
            <Link
              to={`/profile/${post.authorUsername}`}
              className="font-medium text-foreground hover:text-primary"
            >
              {post.authorUsername}
            </Link>
            <span>·</span>
            <span>
              {formatDate(post.createdAt)}
            </span>
            {post.editedAt && <span className="italic">(edited)</span>}
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <MarkdownRenderer content={post.body} untrusted />
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
          {replying && (
            <div className="mt-2">
              <RichComposer
                value={replyBody}
                onChange={setReplyBody}
                rows={3}
                placeholder="Write a reply…"
                compact
                showVizButton={false}
              />
              <div className="flex gap-2 mt-1">
                <button
                  onClick={handleReply}
                  disabled={submitting || !replyBody.trim()}
                  className="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs hover:bg-primary/90 disabled:opacity-50"
                >
                  Reply
                </button>
                <button
                  onClick={() => {
                    setReplying(false);
                    setReplyBody("");
                  }}
                  className="px-3 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {post.children && post.children.length > 0 && (
            <div className="mt-3 space-y-3">
              {post.children.map((c) => (
                <PostItem
                  key={c.id}
                  post={c}
                  slug={slug}
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

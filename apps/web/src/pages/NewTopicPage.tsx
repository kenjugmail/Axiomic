import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { api, type ForumDomain, type PostType } from "../lib/api";
import { POST_TYPES } from "@axiomic/types";
import { useAuthStore } from "../stores/auth";
import { RichComposer } from "../components/composer/RichComposer";
import { PostTypeBadge } from "../components/PostTypeBadge";
import { PollBuilder } from "../components/forum/PollBuilder";
import { toast } from "../stores/toast";

const POST_TYPE_HINTS: Record<PostType, string> = {
  claim: "Stake out a position. State the claim sharply and offer your strongest evidence.",
  question: "A genuine question. Show what you've already considered and where you're stuck.",
  derivation: "Walk through a derivation step by step. Mark assumptions explicitly.",
  critique: "Critique a specific argument or design. Quote what you're disagreeing with.",
  synthesis:
    "Bring multiple threads or papers together into a unified picture. Cite what you're synthesizing.",
  prediction:
    "Make a falsifiable prediction. Include the criterion that would make you abandon it.",
  poll:
    "Ask the community to choose. Frame the question and provide 2-8 options.",
};

export function NewTopicPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const wikiPageId = searchParams.get("wikiPageId") || undefined;
  const wikiPageSlugParam = searchParams.get("wikiPageSlug") || undefined;
  const user = useAuthStore((s) => s.user);

  const [domains, setDomains] = useState<ForumDomain[]>([]);
  const [domainSlug, setDomainSlug] = useState("ml");
  const [postType, setPostType] = useState<PostType>("question");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);

  useEffect(() => {
    api.forum.domains().then((d) => setDomains(d.domains));
  }, []);

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 text-center">
        <h1 className="text-2xl font-semibold mb-2">Sign in to start a topic</h1>
        <p className="text-sm text-muted-foreground mb-4">
          You need an account to post in the forum.
        </p>
        <Link
          to="/login"
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const validPollOptions = pollOptions
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const pollReady =
    postType !== "poll" ||
    (pollQuestion.trim().length >= 3 && validPollOptions.length >= 2);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      let topic;
      if (postType === "poll") {
        ({ topic } = await api.forum.createTopicWithPoll({
          title: title.trim(),
          body: body.trim() || pollQuestion.trim(),
          domainSlug,
          poll: {
            question: pollQuestion.trim(),
            options: validPollOptions.map((label) => ({ label })),
          },
        }));
      } else {
        ({ topic } = await api.forum.createTopic({
          title: title.trim(),
          body: body.trim(),
          postType,
          domainSlug,
          wikiPageId: wikiPageId || null,
        }));
      }
      navigate(`/forum/t/${topic.slug}`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to create topic");
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">New topic</h1>
      {wikiPageSlugParam && (
        <p className="text-xs text-muted-foreground mb-4">
          Anchored to wiki page{" "}
          <Link
            to={`/wiki/${wikiPageSlugParam}`}
            className="text-primary hover:underline"
          >
            {wikiPageSlugParam}
          </Link>
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Type
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
            {POST_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setPostType(t)}
                className={`flex items-center gap-2 px-3 py-2 rounded-md border text-left text-sm ${
                  postType === t
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/40"
                }`}
              >
                <PostTypeBadge type={t} />
                <span className="capitalize">{t}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {POST_TYPE_HINTS[postType]}
          </p>
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Domain
          </label>
          <select
            value={domainSlug}
            onChange={(e) => setDomainSlug(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
          >
            {domains.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Title
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
            minLength={3}
            placeholder="A precise, claim-like title works best"
            className="mt-1 w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
          />
        </div>

        {postType === "poll" && (
          <PollBuilder
            question={pollQuestion}
            options={pollOptions}
            onChange={(next) => {
              setPollQuestion(next.question);
              setPollOptions(next.options);
            }}
          />
        )}

        <div>
          <div className="flex justify-between items-baseline">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              {postType === "poll" ? "Intro (optional)" : "Body (Markdown · LaTeX)"}
            </label>
            <button
              type="button"
              onClick={() => setShowPreview((p) => !p)}
              className="hidden text-xs text-muted-foreground hover:text-foreground"
            >
              {showPreview ? "Edit" : "Preview"}
            </button>
          </div>
          <div className="mt-1">
            <RichComposer
              value={body}
              onChange={setBody}
              rows={postType === "poll" ? 4 : 12}
              placeholder={
                postType === "poll"
                  ? "Optional context for the poll."
                  : "State the case. Quote sources. Make assumptions explicit. Drag images / videos to attach, or use @ to mention someone."
              }
            />
          </div>
        </div>


        <div className="flex gap-2">
          <button
            type="submit"
            disabled={
              submitting ||
              !title.trim() ||
              (postType !== "poll" && !body.trim()) ||
              !pollReady
            }
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? "Posting…" : "Post topic"}
          </button>
          <Link
            to="/forum"
            className="px-4 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

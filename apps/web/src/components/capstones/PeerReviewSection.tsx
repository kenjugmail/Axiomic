// Sprint 39 — Peer review block on the capstone artifact page.
//
// Renders the existing reviews + a submit form for non-author signed
// users. Reviews are scoped per-submission (one milestone), so the
// component takes a single submission and its milestone title.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  MessageSquare,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import type {
  CapstonePeerReview,
  PeerReviewStatus,
} from "@axiomic/types";
import { api } from "../../lib/api";
import { useAuthStore } from "../../stores/auth";

interface Props {
  submissionId: string;
  milestoneTitle: string;
  isOwnSubmission: boolean;
  artifactSlug: string;
  onChange?: () => void;
}

export function PeerReviewSection({
  submissionId,
  milestoneTitle,
  isOwnSubmission,
  artifactSlug,
  onChange,
}: Props) {
  const user = useAuthStore((s) => s.user);
  const [reviews, setReviews] = useState<CapstonePeerReview[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    try {
      const r = await api.capstones.artifactReviews(artifactSlug);
      setReviews(r.reviews.filter((v) => v.submissionId === submissionId));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load reviews");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId, artifactSlug]);

  const myReview = user
    ? reviews?.find((r) => r.reviewerUsername === user.username)
    : null;

  const onWithdraw = async (id: string) => {
    try {
      await api.capstones.deletePeerReview(id);
      await load();
      onChange?.();
    } catch (e: any) {
      setError(e?.message ?? "Failed to withdraw");
    }
  };

  return (
    <div className="rounded-md border border-border bg-card/50 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
          <MessageSquare className="w-3 h-3" strokeWidth={2} />
          Peer review · {milestoneTitle}
        </h4>
        {user && !isOwnSubmission && !showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="text-[11px] px-2 py-1 rounded-md border border-border hover:bg-accent/40"
          >
            {myReview ? "Update review" : "Leave a review"}
          </button>
        )}
      </div>

      {error && (
        <p className="text-[11px] text-rose-600 dark:text-rose-400 mb-2">
          {error}
        </p>
      )}

      {showForm && user && !isOwnSubmission && (
        <ReviewForm
          submissionId={submissionId}
          existing={myReview ?? null}
          onCancel={() => setShowForm(false)}
          onSubmitted={async () => {
            setShowForm(false);
            await load();
            onChange?.();
          }}
        />
      )}

      {reviews === null && !error && (
        <p className="text-[11px] text-muted-foreground">Loading…</p>
      )}

      {reviews && reviews.length === 0 && !showForm && (
        <p className="text-[11px] text-muted-foreground">
          No peer reviews yet.{" "}
          {!user && (
            <>
              <Link to="/login" className="text-primary hover:underline">
                Sign in
              </Link>{" "}
              to leave one.
            </>
          )}
          {user && isOwnSubmission && "Share this artifact's URL to invite reviewers."}
        </p>
      )}

      {reviews && reviews.length > 0 && (
        <ul className="space-y-2">
          {reviews.map((r) => (
            <li
              key={r.id}
              className="rounded-md border border-border bg-background p-2.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                      r.status === "endorsed"
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40"
                        : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40"
                    }`}
                  >
                    {r.status === "endorsed" ? (
                      <CheckCircle2 className="w-2.5 h-2.5" strokeWidth={2} />
                    ) : (
                      <ShieldAlert className="w-2.5 h-2.5" strokeWidth={2} />
                    )}
                    {r.status === "endorsed" ? "Endorsed" : "Changes requested"}
                  </span>
                  <Link
                    to={`/profile/${r.reviewerUsername}`}
                    className="text-xs font-medium hover:underline truncate"
                  >
                    @{r.reviewerUsername}
                  </Link>
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                    {Math.round(r.score * 100)}%
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground shrink-0">
                  <span className="tabular-nums">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                  {user?.username === r.reviewerUsername && (
                    <button
                      type="button"
                      onClick={() => onWithdraw(r.id)}
                      className="hover:text-rose-500"
                      aria-label="Withdraw review"
                      title="Withdraw"
                    >
                      <Trash2 className="w-3 h-3" strokeWidth={2} />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-foreground/85 mt-1.5 whitespace-pre-wrap">
                {r.feedback}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewForm({
  submissionId,
  existing,
  onCancel,
  onSubmitted,
}: {
  submissionId: string;
  existing: CapstonePeerReview | null;
  onCancel: () => void;
  onSubmitted: () => void;
}) {
  const [status, setStatus] = useState<PeerReviewStatus>(
    existing?.status ?? "endorsed",
  );
  const [score, setScore] = useState<number>(existing?.score ?? 0.85);
  const [feedback, setFeedback] = useState(existing?.feedback ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.capstones.submitPeerReview(submissionId, {
        status,
        score,
        feedback: feedback.trim(),
      });
      onSubmitted();
    } catch (e: any) {
      setError(e?.message ?? "Failed to submit");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-md border border-border bg-background p-3 mb-2 space-y-2"
    >
      <div className="flex items-center gap-3 flex-wrap">
        <fieldset className="flex gap-1 p-0.5 rounded-md bg-muted">
          {(["endorsed", "requested_changes"] as PeerReviewStatus[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`text-[11px] px-2 py-1 rounded transition-colors ${
                status === s
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "endorsed" ? "Endorse" : "Request changes"}
            </button>
          ))}
        </fieldset>
        <label className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
          Score
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={score}
            onChange={(e) => setScore(parseFloat(e.target.value))}
            className="accent-primary"
          />
          <span className="font-mono tabular-nums w-9 text-right">
            {Math.round(score * 100)}%
          </span>
        </label>
      </div>
      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        required
        minLength={20}
        rows={4}
        placeholder="What did this submission do well, and what would you change?"
        className="w-full text-xs px-3 py-2 rounded-md border border-border bg-background"
      />
      {error && (
        <p className="text-[11px] text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || feedback.trim().length < 20}
          className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? "Submitting…" : existing ? "Update review" : "Submit review"}
        </button>
      </div>
    </form>
  );
}

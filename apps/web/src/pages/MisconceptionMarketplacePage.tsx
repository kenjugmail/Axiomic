// Sprint 38 — Misconception marketplace.
//
// Public list at /misconceptions. Anyone reads; signed-in users vote
// and submit. Once a submission's net score crosses the promotion
// threshold it auto-promotes into the production catalog and a
// "Merged" badge appears.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Lightbulb,
  Plus,
  Sparkles,
} from "lucide-react";
import type {
  MisconceptionSubmissionListItem,
  MisconceptionSubmissionListResponse,
} from "@axiomic/types";
import { api } from "../lib/api";
import { Skeleton } from "../components/ui";
import { useAuthStore } from "../stores/auth";

type SortKey = "votes" | "recent" | "decided";
type StatusFilter = "open" | "merged" | "all";

const SORT_LABELS: Record<SortKey, string> = {
  votes: "Top voted",
  recent: "Newest",
  decided: "Recently decided",
};

const STATUS_LABELS: Record<StatusFilter, string> = {
  open: "Open",
  merged: "Merged",
  all: "All",
};

export function MisconceptionMarketplacePage() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<MisconceptionSubmissionListResponse | null>(
    null,
  );
  const [error, setError] = useState("");
  const [sort, setSort] = useState<SortKey>("votes");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setError("");
    try {
      const r = await api.misconceptions.list({
        sort,
        status,
        limit: 30,
      });
      setData(r);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, status]);

  const onVote = async (id: string, value: -1 | 0 | 1) => {
    try {
      const r = await api.misconceptions.vote(id, value);
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          submissions: prev.submissions.map((s) =>
            s.id === id
              ? {
                  ...s,
                  voteScore: r.voteScore,
                  myVote: r.myVote,
                  status: r.promoted ? "merged" : s.status,
                  catalogId: r.catalogId ?? s.catalogId,
                }
              : s,
          ),
        };
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to vote");
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
          <Lightbulb className="w-6 h-6 text-primary" strokeWidth={2} />
          Misconception marketplace
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-prose">
          Spot a misconception the platform doesn't know about? Propose it
          here. Once a proposal nets{" "}
          <strong>{data?.promotionThreshold ?? 5} votes</strong> it merges
          into the production catalog and the AI tutor + detector start
          using it.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1 p-1 rounded-md bg-muted">
          {(["votes", "recent", "decided"] as SortKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                sort === k
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {SORT_LABELS[k]}
            </button>
          ))}
        </div>
        <div className="flex gap-1 p-1 rounded-md bg-muted">
          {(["open", "merged", "all"] as StatusFilter[]).map((k) => (
            <button
              key={k}
              onClick={() => setStatus(k)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                status === k
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {STATUS_LABELS[k]}
            </button>
          ))}
        </div>
        {user && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="ml-auto text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2} />
            Propose
          </button>
        )}
      </div>

      {showForm && user && (
        <SubmitForm
          onCancel={() => setShowForm(false)}
          onSubmitted={async () => {
            setShowForm(false);
            await load();
          }}
        />
      )}

      {error && (
        <p className="text-sm text-rose-600 dark:text-rose-400 mb-3">
          {error}
        </p>
      )}

      {!data && !error && (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      )}

      {data && data.submissions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No submissions yet. Be the first.
        </p>
      )}

      {data && data.submissions.length > 0 && (
        <ul className="space-y-2">
          {data.submissions.map((s) => (
            <li key={s.id}>
              <SubmissionRow
                submission={s}
                onVote={onVote}
                canVote={!!user && s.status === "open"}
                threshold={data.promotionThreshold}
              />
            </li>
          ))}
        </ul>
      )}

      {!user && (
        <p className="text-xs text-muted-foreground mt-6">
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>{" "}
          to propose a misconception or vote on existing ones.
        </p>
      )}
    </div>
  );
}

function SubmissionRow({
  submission: s,
  onVote,
  canVote,
  threshold,
}: {
  submission: MisconceptionSubmissionListItem;
  onVote: (id: string, value: -1 | 0 | 1) => void;
  canVote: boolean;
  threshold: number;
}) {
  const remaining = Math.max(0, threshold - s.voteScore);
  return (
    <div className="rounded-md border border-border p-3 hover:bg-accent/20 transition-colors">
      <div className="flex gap-3">
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <button
            type="button"
            disabled={!canVote}
            onClick={() => onVote(s.id, s.myVote === 1 ? 0 : 1)}
            className={`p-0.5 disabled:opacity-40 hover:text-primary ${
              s.myVote === 1 ? "text-primary" : "text-muted-foreground"
            }`}
            aria-label="Upvote"
          >
            <ChevronUp className="w-5 h-5" strokeWidth={2} />
          </button>
          <span
            className={`text-sm font-medium tabular-nums ${
              s.voteScore > 0 ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {s.voteScore}
          </span>
          <button
            type="button"
            disabled={!canVote}
            onClick={() => onVote(s.id, s.myVote === -1 ? 0 : -1)}
            className={`p-0.5 disabled:opacity-40 hover:text-rose-500 ${
              s.myVote === -1 ? "text-rose-500" : "text-muted-foreground"
            }`}
            aria-label="Downvote"
          >
            <ChevronDown className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="text-sm font-medium leading-snug">{s.label}</h3>
            {s.status === "merged" && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40">
                <CheckCircle2 className="w-2.5 h-2.5" strokeWidth={2} />
                Merged
              </span>
            )}
            {s.status === "rejected" && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/40">
                Rejected
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {s.descriptionPreview}
          </p>
          <div className="flex items-baseline gap-2 mt-2 text-[11px] text-muted-foreground flex-wrap">
            <Link
              to={`/wiki/${s.conceptSlug}`}
              className="hover:text-foreground inline-flex items-center gap-1"
            >
              <code className="px-1 py-0.5 rounded bg-muted text-[10px]">
                {s.conceptSlug}
              </code>
              {s.conceptTitle && <span>· {s.conceptTitle}</span>}
            </Link>
            <span>·</span>
            <Link
              to={`/profile/${s.proposerUsername}`}
              className="hover:text-foreground"
            >
              @{s.proposerUsername}
            </Link>
            <span>·</span>
            <span>{new Date(s.createdAt).toLocaleDateString()}</span>
            {s.status === "open" && remaining > 0 && (
              <>
                <span>·</span>
                <span className="text-primary inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3" strokeWidth={2} />
                  {remaining} more vote{remaining === 1 ? "" : "s"} to merge
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SubmitForm({
  onCancel,
  onSubmitted,
}: {
  onCancel: () => void;
  onSubmitted: () => void;
}) {
  const [conceptSlug, setConceptSlug] = useState("");
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [probesText, setProbesText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const probes = probesText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      await api.misconceptions.submit({
        conceptSlug: conceptSlug.trim(),
        key: key.trim(),
        label: label.trim(),
        description: description.trim(),
        probeQuestions: probes.length > 0 ? probes : undefined,
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
      className="rounded-lg border border-border bg-card p-4 mb-4 space-y-3"
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Propose a misconception
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Concept slug *
          </div>
          <input
            value={conceptSlug}
            onChange={(e) => setConceptSlug(e.target.value)}
            required
            placeholder="e.g. softmax"
            className="w-full px-3 py-1.5 text-sm rounded-md border border-border bg-background"
          />
        </label>
        <label className="block">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Key (kebab-case) *
          </div>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            required
            placeholder="e.g. softmax-temperature-inverted"
            className="w-full px-3 py-1.5 text-sm rounded-md border border-border bg-background"
          />
        </label>
      </div>

      <label className="block">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
          One-line label *
        </div>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
          placeholder="The misconception in plain language"
          className="w-full px-3 py-1.5 text-sm rounded-md border border-border bg-background"
        />
      </label>

      <label className="block">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
          Description (40+ chars) *
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          minLength={40}
          rows={5}
          placeholder="Why this misconception happens, how it shows up, and what the correction looks like."
          className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
        />
      </label>

      <label className="block">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
          Probe questions (one per line)
        </div>
        <textarea
          value={probesText}
          onChange={(e) => setProbesText(e.target.value)}
          rows={3}
          placeholder="If you raise the temperature, does the model become more deterministic or more random?"
          className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
        />
      </label>

      {error && (
        <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
      )}

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? "Submitting…" : "Propose"}
        </button>
      </div>
    </form>
  );
}

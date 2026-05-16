// Phase 28C/D — research bounty detail.
//
// Adapts by viewer role + bounty status:
// - Everyone: header, description, claim slots.
// - Signed-in non-poster: Claim button (if open + slots free).
// - Claimant: submission form (writeup + artifact links).
// - Poster: review panel — every claim, its submission, and
//   Accept / Reject. Accepting mints the signed credential +
//   XP + optional badge (server-side fan-out).

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Check,
  ChevronLeft,
  Plus,
  Send,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { Skeleton } from "../components/ui";
import { toast } from "../stores/toast";

type Detail = Awaited<ReturnType<typeof api.bounties.get>>;
type Artifact = { kind: string; url: string; label: string };

export function BountyDetailPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    try {
      setData(await api.bounties.get(slug));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load");
    }
  };

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    api.bounties
      .get(slug)
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Link
          to="/bounties"
          className="text-sm text-primary hover:underline inline-flex items-center gap-1"
        >
          <ChevronLeft className="w-3 h-3" /> Back
        </Link>
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const { bounty: b, claims, submissions, myClaim } = data;
  const isPoster = b.isPoster;
  const slotsTaken = claims.length;
  const canClaim =
    !!me &&
    !isPoster &&
    !myClaim &&
    b.status === "open" &&
    slotsTaken < b.maxClaimants;

  const claim = async () => {
    setBusy(true);
    try {
      await api.bounties.claim(slug);
      toast.success("Claimed — submit your work below.");
      await reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Claim failed");
    } finally {
      setBusy(false);
    }
  };

  const removeBounty = async () => {
    if (!window.confirm("Delete this bounty? Only allowed while open.")) return;
    try {
      await api.bounties.delete(slug);
      toast.success("Deleted");
      navigate("/bounties");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Delete failed");
    }
  };

  const mySubmission =
    myClaim != null
      ? submissions.find((s) => s.claimId === myClaim.id) ?? null
      : null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link
        to="/bounties"
        className="text-sm text-primary hover:underline inline-flex items-center gap-1"
      >
        <ChevronLeft className="w-3 h-3" /> All bounties
      </Link>

      <header className="mt-3 mb-6 rounded-lg border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <span className="shrink-0 w-11 h-11 rounded-md bg-primary/10 text-primary inline-flex items-center justify-center">
            <Target className="w-6 h-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                {b.title}
              </h1>
              <StatusBadge status={b.status} />
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-2 flex flex-wrap items-center gap-2">
              <span className="px-1.5 py-0.5 rounded-full border border-border">
                {b.kind}
              </span>
              <span className="text-primary font-semibold">
                {b.rewardXp} XP
              </span>
              {b.rewardBadgeSlug && (
                <>
                  <span>·</span>
                  <span>badge · {b.rewardBadgeSlug}</span>
                </>
              )}
              <span>·</span>
              <span>
                {slotsTaken}/{b.maxClaimants} claimed
              </span>
              {b.deadlineAt && (
                <>
                  <span>·</span>
                  <span>
                    deadline {new Date(b.deadlineAt).toLocaleDateString()}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {b.descriptionMd && (
        <section className="mb-6 prose prose-sm dark:prose-invert max-w-none">
          <MarkdownRenderer content={b.descriptionMd} />
        </section>
      )}

      {/* Claim CTA */}
      {canClaim && (
        <div className="mb-6 rounded-md border border-primary/30 bg-primary/5 p-4 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm">
            Claim a slot to start working on this bounty.
          </p>
          <button
            type="button"
            onClick={claim}
            disabled={busy}
            className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            {busy ? "Claiming…" : "Claim this bounty"}
          </button>
        </div>
      )}

      {!me && b.status === "open" && (
        <div className="mb-6 rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>{" "}
          to claim this bounty.
        </div>
      )}

      {/* Claimant's submission surface */}
      {myClaim && (
        <ClaimantPanel
          slug={slug}
          status={myClaim.status}
          mySubmission={mySubmission}
          onChanged={reload}
        />
      )}

      {/* Poster review panel */}
      {isPoster && (
        <PosterPanel
          slug={slug}
          claims={claims}
          submissions={submissions}
          onChanged={reload}
        />
      )}

      {/* Public claim roster (non-poster, non-claimant) */}
      {!isPoster && claims.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold mb-2">
            Claimants ({claims.length})
          </h2>
          <ul className="space-y-1.5">
            {claims.map((cl) => (
              <li
                key={cl.id}
                className="text-sm rounded-md border border-border bg-card px-3 py-2 flex items-center justify-between gap-3"
              >
                <span>{cl.displayName ?? `@${cl.username}`}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {cl.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isPoster && b.status === "open" && (
        <div className="mt-8 pt-4 border-t border-border">
          <button
            type="button"
            onClick={removeBounty}
            className="text-xs px-3 py-1.5 rounded-md border border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 inline-flex items-center gap-1.5"
          >
            <Trash2 className="w-3 h-3" />
            Delete bounty
          </button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    open: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    in_review:
      "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    completed:
      "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
    closed: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span
      className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${tone[status] ?? "border-border"}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

// ---------- claimant ----------

function ClaimantPanel({
  slug,
  status,
  mySubmission,
  onChanged,
}: {
  slug: string;
  status: string;
  mySubmission: Detail["submissions"][number] | null;
  onChanged: () => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [writeup, setWriteup] = useState(mySubmission?.writeup ?? "");
  const [artifacts, setArtifacts] = useState<Artifact[]>(
    (mySubmission?.artifacts as Artifact[] | undefined)?.length
      ? (mySubmission!.artifacts as Artifact[])
      : [{ kind: "github", url: "", label: "" }],
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setWriteup(mySubmission?.writeup ?? "");
    const a = mySubmission?.artifacts as Artifact[] | undefined;
    if (a && a.length) setArtifacts(a);
  }, [mySubmission?.id]);

  const accepted = status === "accepted";
  const rejected = status === "rejected";

  const submit = async () => {
    setBusy(true);
    try {
      await api.bounties.submit(slug, {
        writeup,
        artifacts: artifacts
          .filter((a) => a.url.trim())
          .map((a) => ({
            kind: a.kind as
              | "github"
              | "colab"
              | "demo"
              | "paper"
              | "other",
            url: a.url.trim(),
            label: a.label.trim() || a.url.trim(),
          })),
      });
      toast.success("Submitted — the poster will review it.");
      setEditing(false);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-6 rounded-md border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
        <h2 className="text-sm font-semibold">Your claim</h2>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {status}
        </span>
      </div>

      {accepted && (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">
          Accepted — your signed credential, XP, and any badge are in
          your{" "}
          <Link to="/me/credentials" className="underline">
            wallet
          </Link>
          .
        </p>
      )}
      {rejected && (
        <p className="text-sm text-rose-700 dark:text-rose-300">
          This submission was not accepted.
        </p>
      )}

      {!accepted && !rejected && (
        <>
          {!editing && mySubmission ? (
            <div>
              <div className="text-xs text-muted-foreground mb-2">
                submitted{" "}
                {new Date(mySubmission.submittedAt).toLocaleString()}
              </div>
              {mySubmission.writeup && (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <MarkdownRenderer content={mySubmission.writeup} />
                </div>
              )}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="mt-2 text-xs text-primary hover:underline"
              >
                Edit submission
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={writeup}
                onChange={(e) => setWriteup(e.target.value)}
                rows={6}
                placeholder="Writeup (markdown). What you did, what you found, how to reproduce it."
                className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
              />
              <div className="space-y-2">
                <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                  Artifact links
                </span>
                {artifacts.map((a, i) => (
                  <div key={i} className="flex gap-2 flex-wrap">
                    <select
                      value={a.kind}
                      onChange={(e) => {
                        const next = [...artifacts];
                        next[i] = { ...a, kind: e.target.value };
                        setArtifacts(next);
                      }}
                      className="text-sm px-2 py-2 rounded-md border border-border bg-background"
                    >
                      <option value="github">github</option>
                      <option value="colab">colab</option>
                      <option value="demo">demo</option>
                      <option value="paper">paper</option>
                      <option value="other">other</option>
                    </select>
                    <input
                      value={a.url}
                      onChange={(e) => {
                        const next = [...artifacts];
                        next[i] = { ...a, url: e.target.value };
                        setArtifacts(next);
                      }}
                      placeholder="https://…"
                      className="flex-1 min-w-[12rem] text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
                    />
                    <input
                      value={a.label}
                      onChange={(e) => {
                        const next = [...artifacts];
                        next[i] = { ...a, label: e.target.value };
                        setArtifacts(next);
                      }}
                      placeholder="label"
                      className="w-32 text-sm px-3 py-2 rounded-md border border-border bg-background"
                    />
                    {artifacts.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setArtifacts(artifacts.filter((_, j) => j !== i))
                        }
                        className="text-rose-600 dark:text-rose-400 hover:text-rose-500 px-1"
                        aria-label="Remove artifact"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setArtifacts([
                      ...artifacts,
                      { kind: "github", url: "", label: "" },
                    ])
                  }
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add artifact
                </button>
              </div>
              <div className="flex justify-end gap-2">
                {mySubmission && (
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy}
                  className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <Send className="w-3 h-3" />
                  {busy
                    ? "Submitting…"
                    : mySubmission
                      ? "Save submission"
                      : "Submit work"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ---------- poster review ----------

function PosterPanel({
  slug,
  claims,
  submissions,
  onChanged,
}: {
  slug: string;
  claims: Detail["claims"];
  submissions: Detail["submissions"];
  onChanged: () => void | Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const decide = async (
    claimId: string,
    action: "accept" | "reject",
  ) => {
    setBusyId(claimId);
    try {
      if (action === "accept") {
        await api.bounties.accept(slug, claimId);
        toast.success("Accepted — rewards + signed credential issued.");
      } else {
        await api.bounties.reject(slug, claimId);
        toast.success("Rejected — slot freed.");
      }
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="mb-6 rounded-md border border-primary/30 bg-primary/5 p-4">
      <h2 className="text-sm font-semibold mb-3">
        Review claims ({claims.length})
      </h2>
      {claims.length === 0 ? (
        <p className="text-sm text-muted-foreground">No claims yet.</p>
      ) : (
        <ul className="space-y-3">
          {claims.map((cl) => {
            const sub = submissions.find((s) => s.claimId === cl.id) ?? null;
            const decided =
              cl.status === "accepted" || cl.status === "rejected";
            return (
              <li
                key={cl.id}
                className="rounded-md border border-border bg-card p-3"
                data-testid="claim-row"
              >
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div className="text-sm font-medium">
                    {cl.displayName ?? `@${cl.username}`}
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {cl.status}
                  </span>
                </div>
                {sub ? (
                  <div className="mt-2">
                    <div className="text-[10px] text-muted-foreground mb-1">
                      submitted{" "}
                      {new Date(sub.submittedAt).toLocaleString()}
                    </div>
                    {sub.writeup && (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <MarkdownRenderer content={sub.writeup} />
                      </div>
                    )}
                    {Array.isArray(sub.artifacts) &&
                      sub.artifacts.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {(sub.artifacts as Artifact[]).map((a, i) => (
                            <li key={i} className="text-xs">
                              <a
                                href={a.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary hover:underline"
                              >
                                [{a.kind}] {a.label || a.url}
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    {sub.aiReview != null && (
                      <div className="mt-2 rounded-md border border-violet-500/30 bg-violet-500/5 p-2 text-xs">
                        <div className="font-medium mb-1">
                          AI sanity check (advisory)
                        </div>
                        <pre className="whitespace-pre-wrap font-mono text-[11px]">
                          {JSON.stringify(sub.aiReview, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    No submission yet.
                  </p>
                )}
                {!decided && (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => decide(cl.id, "accept")}
                      disabled={busyId === cl.id || !sub}
                      className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                    >
                      <Check className="w-3 h-3" />
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(cl.id, "reject")}
                      disabled={busyId === cl.id}
                      className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 disabled:opacity-50 inline-flex items-center gap-1.5"
                    >
                      <X className="w-3 h-3" />
                      Reject
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

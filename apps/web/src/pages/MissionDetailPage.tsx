// Phase 39 — "Goodness" mission detail.
//
// Public read (open): problem, sub-problems, contributions with a
// verification weight bar + Review controls + (for backing-org
// verifiers) an Attest action, "Backed by {orgs}", an Impact panel
// from GET /public/missions/:slug, and the live working-group room
// toggle for members. Posting / room entry requires membership;
// join is one click (open). Mirrors the ReproductionReviewPage room
// embed + the bounty/cohort detail shape.

import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Globe,
  ExternalLink,
  ShieldCheck,
  Users,
  CheckCircle2,
} from "lucide-react";
import { api, ApiError, type MissionImpact } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";
import { EmptyState } from "../components/ui/EmptyState";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { ReviewRoom } from "../components/ReviewRoom";
import { relativeTime } from "../lib/dates";
import { confirm } from "../stores/confirm";
import { toast } from "../stores/toast";

type MissionDetail = Awaited<ReturnType<typeof api.missions.get>>;
type Contribution = MissionDetail["contributions"][number];

export function MissionDetailPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<MissionDetail | null>(null);
  const [impact, setImpact] = useState<MissionImpact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRoom, setShowRoom] = useState(false);

  // reload() is handed to child forms as `onDone`, so a slow refresh
  // can resolve after this page unmounts or the slug changes. A ref —
  // not a closure flag — is the alive predicate because those callers
  // invoke onDone() with no args. Mirrors the MasteryPathPage /
  // LessonPage cancelled-guard convention.
  const aliveRef = useRef(true);

  const reload = (alive: () => boolean = () => aliveRef.current) => {
    api.missions
      .get(slug)
      .then((d) => {
        if (!alive()) return;
        setData(d);
        setImpact(d.impact);
      })
      .catch((e) => {
        if (!alive()) return;
        setError(e instanceof ApiError ? e.message : "Failed to load");
      });
  };

  useEffect(() => {
    let cancelled = false;
    aliveRef.current = true;
    api.missions
      .get(slug)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setImpact(d.impact);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load");
        }
      });
    // Public impact is also fetched standalone so the panel reflects
    // the no-auth surface third parties see.
    api.missions
      .publicImpact(slug)
      .then((i) => {
        if (!cancelled) setImpact(i);
      })
      .catch(() => {
        /* fall back to the embedded impact */
      });
    return () => {
      cancelled = true;
      aliveRef.current = false;
    };
  }, [slug]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <EmptyState icon={Globe} title="Mission unavailable" description={error} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-3">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  const m = data.mission;
  const isMember = data.membership !== null;

  const join = async () => {
    try {
      await api.missions.join(slug);
      toast.success("You joined the mission.");
      reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Join failed");
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
              <Globe className="w-7 h-7 text-primary" />
              {m.title}
            </h1>
            <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">
              {m.theme} · {m.status} · {relativeTime(m.createdAt)}
            </p>
          </div>
          {user &&
            (isMember ? (
              <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                {data.membership?.role === "organizer"
                  ? "Organizer"
                  : "Member"}
              </span>
            ) : (
              <button
                type="button"
                onClick={join}
                className="text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Join mission
              </button>
            ))}
        </div>

        {data.backers.length > 0 && (
          <p className="mt-3 text-sm text-muted-foreground inline-flex items-center gap-1.5 flex-wrap">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Backed by{" "}
            {data.backers.map((b, i) => (
              <span key={b.slug}>
                <Link
                  to={`/orgs/${b.slug}`}
                  className="text-primary hover:underline"
                >
                  {b.name}
                </Link>
                {i < data.backers.length - 1 ? ", " : ""}
              </span>
            ))}
          </p>
        )}
      </header>

      {m.summaryMd && (
        <p className="text-base text-muted-foreground mb-4">{m.summaryMd}</p>
      )}

      <section className="mb-8">
        <h2 className="font-display text-lg font-semibold mb-2">
          The problem
        </h2>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <MarkdownRenderer content={m.problemMd || "_No description yet._"} />
        </div>
      </section>

      {/* Sub-problems */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display text-lg font-semibold">
            Sub-problems
          </h2>
        </div>
        {data.subproblems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No sub-problems yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.subproblems.map((sp) => (
              <li
                key={sp.id}
                className="rounded-md border border-border bg-card p-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">{sp.title}</span>
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/40">
                    {sp.status}
                  </span>
                </div>
                {sp.descriptionMd && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-3">
                    {sp.descriptionMd}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        {isMember && (
          <SubproblemForm slug={slug} onDone={reload} />
        )}
      </section>

      {/* Impact panel (the public, no-auth surface) */}
      {impact && (
        <section className="mb-8 rounded-lg border border-border bg-card p-4">
          <h2 className="font-display text-lg font-semibold mb-3 inline-flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Verified impact
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 text-center">
            <Stat
              label="Verified"
              value={impact.verifiedContributions.length}
            />
            <Stat label="Sub-problems" value={impact.subproblems.total} />
            <Stat label="Solved" value={impact.subproblems.solved} />
            <Stat
              label="Org attestations"
              value={impact.orgAttestations.length}
            />
          </div>
          {impact.verifiedContributions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No peer-verified contributions yet.
            </p>
          ) : (
            <ul className="text-sm space-y-1">
              {impact.verifiedContributions.map((v) => (
                <li
                  key={v.contributionId}
                  className="flex items-center justify-between gap-2"
                >
                  <span>
                    <strong>{v.username}</strong> · {v.kind}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    weight {v.confirmedWeight?.toFixed(1) ?? "—"} ·{" "}
                    {relativeTime(v.mintedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Live working-group room — members only */}
      {isMember && (
        <section className="mb-8">
          <button
            type="button"
            onClick={() => setShowRoom((s) => !s)}
            className="text-sm px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 inline-flex items-center gap-1.5"
          >
            <Users className="w-4 h-4" />
            {showRoom ? "Hide working-group room" : "Open working-group room"}
          </button>
          {showRoom && (
            <div className="mt-3">
              <ReviewRoom
                kind="mission_working_group"
                roomId={data.mission.id}
              />
            </div>
          )}
        </section>
      )}

      {/* Contributions */}
      <section>
        <h2 className="font-display text-lg font-semibold mb-2">
          Contributions
        </h2>
        {isMember && <ContributionForm slug={slug} subproblems={data.subproblems} onDone={reload} />}
        {data.contributions.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-3">
            No contributions yet.
          </p>
        ) : (
          <ul className="space-y-3 mt-3">
            {data.contributions.map((cn) => (
              <ContributionCard
                key={cn.id}
                slug={slug}
                c={cn}
                backers={data.backers}
                canReview={!!user && user.username !== cn.username}
                onDone={reload}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-accent/30 py-2">
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function SubproblemForm({
  slug,
  onDone,
}: {
  slug: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [descriptionMd, setDescriptionMd] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-xs px-3 py-1.5 rounded-md border border-primary/40 text-primary hover:bg-primary/10"
      >
        Add a sub-problem
      </button>
    );
  }

  const submit = async () => {
    setBusy(true);
    try {
      await api.missions.addSubproblem(slug, {
        title: title.trim(),
        descriptionMd: descriptionMd.trim(),
      });
      toast.success("Sub-problem added.");
      setOpen(false);
      setTitle("");
      setDescriptionMd("");
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-md border border-border bg-background p-3 space-y-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Sub-problem title"
        className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
      />
      <textarea
        value={descriptionMd}
        onChange={(e) => setDescriptionMd(e.target.value)}
        rows={3}
        placeholder="What does solving this look like? (markdown)"
        className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy || title.trim().length < 4}
          className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add"}
        </button>
      </div>
    </div>
  );
}

function ContributionForm({
  slug,
  subproblems,
  onDone,
}: {
  slug: string;
  subproblems: MissionDetail["subproblems"];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<
    "analysis" | "data" | "solution" | "synthesis"
  >("analysis");
  const [subproblemId, setSubproblemId] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [artUrl, setArtUrl] = useState("");
  const [artLabel, setArtLabel] = useState("");
  const [artKind, setArtKind] = useState("link");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-xs px-3 py-1.5 rounded-md border border-primary/40 text-primary hover:bg-primary/10"
      >
        Post a contribution
      </button>
    );
  }

  const submit = async () => {
    setBusy(true);
    try {
      const artifacts = artUrl.trim()
        ? [
            {
              kind: artKind.trim() || "link",
              url: artUrl.trim(),
              label: artLabel.trim(),
            },
          ]
        : [];
      await api.missions.addContribution(slug, {
        kind,
        subproblemId: subproblemId || undefined,
        bodyMd: bodyMd.trim(),
        artifacts,
      });
      toast.success("Contribution posted — awaiting peer review.");
      setOpen(false);
      setBodyMd("");
      setArtUrl("");
      setArtLabel("");
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 rounded-md border border-border bg-background p-3 space-y-2">
      <div className="flex gap-2 flex-wrap">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          className="text-sm px-2 py-1.5 rounded-md border border-border bg-background"
        >
          <option value="analysis">analysis</option>
          <option value="data">data</option>
          <option value="solution">solution</option>
          <option value="synthesis">synthesis</option>
        </select>
        <select
          value={subproblemId}
          onChange={(e) => setSubproblemId(e.target.value)}
          className="text-sm px-2 py-1.5 rounded-md border border-border bg-background"
        >
          <option value="">(no sub-problem)</option>
          {subproblems.map((sp) => (
            <option key={sp.id} value={sp.id}>
              {sp.title}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={bodyMd}
        onChange={(e) => setBodyMd(e.target.value)}
        rows={4}
        placeholder="Your analysis / data summary / solution writeup (markdown). Links + writeups only — no uploads."
        className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
      />
      <div className="flex gap-2 flex-wrap">
        <input
          value={artKind}
          onChange={(e) => setArtKind(e.target.value)}
          placeholder="kind (link/dataset/repo)"
          className="text-sm px-2 py-1.5 rounded-md border border-border bg-background w-40"
        />
        <input
          value={artUrl}
          onChange={(e) => setArtUrl(e.target.value)}
          placeholder="https://… (dataset / repo / writeup)"
          className="text-sm px-2 py-1.5 rounded-md border border-border bg-background flex-1 min-w-[12rem]"
        />
        <input
          value={artLabel}
          onChange={(e) => setArtLabel(e.target.value)}
          placeholder="label"
          className="text-sm px-2 py-1.5 rounded-md border border-border bg-background w-32"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy || bodyMd.trim().length < 1}
          className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? "Posting…" : "Post"}
        </button>
      </div>
    </div>
  );
}

function ContributionCard({
  slug,
  c,
  backers,
  canReview,
  onDone,
}: {
  slug: string;
  c: Contribution;
  backers: MissionDetail["backers"];
  canReview: boolean;
  onDone: () => void;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [verdict, setVerdict] = useState<
    "confirmed" | "refuted" | "inconclusive"
  >("confirmed");
  const [notesMd, setNotesMd] = useState("");
  const [busy, setBusy] = useState(false);

  const pct = Math.min(
    100,
    Math.round((c.confirmedWeight / c.confirmWeightThreshold) * 100),
  );
  const verified = !!c.credentialMintedAt && !c.revoked;

  const submitReview = async () => {
    setBusy(true);
    try {
      await api.missions.review(slug, c.id, verdict, notesMd.trim());
      toast.success("Verdict recorded.");
      setReviewing(false);
      setNotesMd("");
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Review failed");
    } finally {
      setBusy(false);
    }
  };

  const attest = async () => {
    if (backers.length === 0) return;
    const orgSlug = backers[0]!.slug;
    if (
      !(await confirm({
        title: `Attest as ${backers[0]!.name}?`,
        body: "This signs an institution-level attestation on this verified contribution. You must be a verifier/admin of the backing org.",
      }))
    ) {
      return;
    }
    try {
      await api.missions.attest(slug, c.id, orgSlug, "");
      toast.success("Attestation signed.");
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Attest failed");
    }
  };

  return (
    <li
      className="rounded-lg border border-border bg-card p-4"
      data-testid="mission-contribution"
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span className="text-sm font-semibold">
          {c.username} · {c.kind}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {relativeTime(c.createdAt)}
        </span>
      </div>

      <div className="prose prose-sm dark:prose-invert max-w-none mt-2">
        <MarkdownRenderer content={c.bodyMd} />
      </div>

      {c.artifacts.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {c.artifacts.map((a, i) => (
            <a
              key={i}
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {a.label || a.kind} <ExternalLink className="w-3 h-3" />
            </a>
          ))}
        </div>
      )}

      {/* Verification weight bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
          <span>
            {verified
              ? "Peer-verified — signed credential minted"
              : c.revoked
                ? "Revoked after refute"
                : `Verification ${c.confirmedWeight.toFixed(1)} / ${c.confirmWeightThreshold.toFixed(1)}`}
          </span>
          {verified && (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-3 h-3" />
              verified
            </span>
          )}
        </div>
        <div className="h-1.5 rounded-full bg-accent/40 overflow-hidden">
          <div
            className={`h-full ${
              c.revoked
                ? "bg-rose-500"
                : verified
                  ? "bg-emerald-500"
                  : "bg-primary"
            }`}
            style={{ width: `${verified ? 100 : pct}%` }}
          />
        </div>
        {c.revoked && c.revocationReason && (
          <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1">
            {c.revocationReason}
          </p>
        )}
      </div>

      <div className="mt-3 flex gap-2 flex-wrap">
        {canReview &&
          (reviewing ? null : (
            <button
              type="button"
              onClick={() => setReviewing(true)}
              className="text-xs px-3 py-1.5 rounded-md border border-primary/40 text-primary hover:bg-primary/10"
            >
              Review
            </button>
          ))}
        {verified && backers.length > 0 && (
          <button
            type="button"
            onClick={attest}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
          >
            Attest as {backers[0]!.name}
          </button>
        )}
      </div>

      {reviewing && (
        <div className="mt-3 rounded-md border border-border bg-background p-3 space-y-2">
          <div className="flex gap-3 flex-wrap text-sm">
            {(["confirmed", "refuted", "inconclusive"] as const).map((v) => (
              <label key={v} className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name={`verdict-${c.id}`}
                  checked={verdict === v}
                  onChange={() => setVerdict(v)}
                />
                {v}
              </label>
            ))}
          </div>
          <textarea
            value={notesMd}
            onChange={(e) => setNotesMd(e.target.value)}
            rows={3}
            placeholder="Notes (optional) — what you checked, what you saw."
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setReviewing(false)}
              className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitReview}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? "Recording…" : "Submit verdict"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

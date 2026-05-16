// Sprint 33 — Knowledge MRI page.
//
// /me/mri — concept-level diagnostic dashboard. Aggregator-only on the
// server side; this page composes header stats + radial summary +
// per-path heatmap + drill panel.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Brain,
  Flame,
  Activity,
  Target,
  TrendingUp,
} from "lucide-react";
import type { KnowledgeMri, KnowledgeMriNode } from "@axiomic/types";
import { api, ApiError } from "../lib/api";
import { toast } from "../stores/toast";
import { EmptyState } from "../components/ui/EmptyState";
import { useAuthStore } from "../stores/auth";
import { MriHeatmap } from "../components/mri/MriHeatmap";
import { MriRadial } from "../components/mri/MriRadial";
import { MriDrillPanel } from "../components/mri/MriDrillPanel";

type Readiness = Awaited<ReturnType<typeof api.me.readiness>>;

export function KnowledgeMRIPage() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<KnowledgeMri | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<{
    node: KnowledgeMriNode;
    pathSlug: string;
  } | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.me
      .knowledgeMri()
      .then((r) => {
        if (cancelled) return;
        setData(r);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message ?? "Failed to load");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <Brain className="w-10 h-10 mx-auto mb-3 text-muted-foreground" strokeWidth={1.5} />
        <h1 className="font-display text-2xl font-semibold tracking-tight mb-2">
          Knowledge MRI
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          Sign in to see a concept-level diagnostic of your strengths and gaps.
        </p>
        <Link
          to="/login"
          className="inline-block text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-sm text-muted-foreground">Loading your MRI…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-sm text-rose-600 dark:text-rose-400">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const { overall, paths } = data;
  const totalNodes = overall.mastered + overall.inProgress + overall.untouched;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="text-sm text-muted-foreground mb-1">
          <Link to="/dashboard" className="hover:text-foreground">
            Dashboard
          </Link>
          {" / Knowledge MRI"}
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">
          Knowledge MRI
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-prose">
          A concept-level diagnostic across every mastery path you've touched.
          Click any cell for evidence and a recommended next action.
        </p>
      </div>

      {/* Header strip + radial */}
      <div className="rounded-lg border border-border bg-card p-4 sm:p-5 mb-6">
        <div className="grid sm:grid-cols-[auto,1fr] gap-5 items-center">
          <MriRadial paths={paths} />
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Mastered" value={overall.mastered} accent="emerald" />
              <Stat
                label="In progress"
                value={overall.inProgress}
                accent="amber"
              />
              <Stat
                label="Untouched"
                value={overall.untouched}
                accent="muted"
              />
              <Stat
                label="Misconceptions"
                value={overall.activeDiagnoses}
                accent={overall.activeDiagnoses > 0 ? "rose" : "muted"}
                icon={
                  overall.activeDiagnoses > 0 ? (
                    <AlertTriangle className="w-3 h-3" strokeWidth={2} />
                  ) : null
                }
              />
            </div>
            {overall.hottestPath && (
              <div className="mt-3 inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300">
                <Flame className="w-3 h-3" strokeWidth={2} />
                Hottest path: <strong>{overall.hottestPath.title}</strong>
              </div>
            )}
            {totalNodes === 0 && (
              <EmptyState
                compact
                icon={Activity}
                title="No mastery data yet"
                description="Pick a path to start practicing."
                cta={
                  <Link
                    to="/paths"
                    className="text-sm text-primary hover:underline"
                  >
                    Browse paths →
                  </Link>
                }
                className="mt-3"
              />
            )}
          </div>
        </div>
      </div>

      {/* Phase 28E — predictive readiness + dated study plan */}
      <ReadinessPanel />

      {/* Phase 31B — prerequisite-ordered goal path */}
      <GoalPathPanel />

      {/* Phase 32C — target-a-role signed-proof skill gap */}
      <SkillGapPanel />

      {/* Phase 34D — signed learning commitments */}
      <CommitmentsPanel />

      {/* Per-path heatmap */}
      <MriHeatmap
        paths={paths}
        selectedNodeId={selected?.node.nodeId ?? null}
        onSelectNode={(node, pathSlug) => setSelected({ node, pathSlug })}
      />

      {selected && (
        <MriDrillPanel
          node={selected.node}
          pathSlug={selected.pathSlug}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: number;
  accent: "emerald" | "amber" | "rose" | "muted";
  icon?: React.ReactNode;
}) {
  const accentText: Record<typeof accent, string> = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    rose: "text-rose-600 dark:text-rose-400",
    muted: "text-foreground",
  };
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className={`text-2xl font-semibold tabular-nums ${accentText[accent]}`}>
        {value}
      </div>
    </div>
  );
}

function ReadinessPanel() {
  const [data, setData] = useState<Readiness | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.me
      .readiness()
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return null;
  if (!data) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 sm:p-5 mb-6">
        <div className="text-sm text-muted-foreground">
          Loading readiness…
        </div>
      </div>
    );
  }

  const hasTrend = data.snapshots.length >= 2;
  const velocity = data.velocityPerDay;

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5 mb-6">
      <h2 className="text-sm font-semibold mb-3 inline-flex items-center gap-1.5">
        <TrendingUp className="w-4 h-4 text-primary" />
        Readiness
      </h2>

      {data.snapshots.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Open this page over a few days — Axiomic snapshots your
          mastery daily (at no extra cost) and projects when you'll be
          ready, with a dated plan to get there.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Velocity
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {hasTrend ? (
                  <>
                    {velocity > 0 ? "+" : ""}
                    {velocity.toFixed(2)}
                    <span className="text-xs text-muted-foreground font-normal">
                      {" "}
                      /day
                    </span>
                  </>
                ) : (
                  <span className="text-base text-muted-foreground font-normal">
                    need 2+ days
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Blockers
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {data.weakConcepts}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Projected ready
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {data.estimatedReadyOn ? (
                  new Date(data.estimatedReadyOn).toLocaleDateString()
                ) : (
                  <span className="text-base text-muted-foreground font-normal">
                    —
                  </span>
                )}
              </div>
            </div>
          </div>

          {data.snapshots.length >= 2 && (
            <Sparkline points={data.snapshots.map((s) => s.mastered)} />
          )}

          {data.plan.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Dated study plan
              </div>
              <ul className="space-y-1.5">
                {data.plan.map((p) => (
                  <li
                    key={p.conceptSlug}
                    className="text-sm flex items-center justify-between gap-3 rounded-md border border-border px-3 py-1.5"
                  >
                    <Link
                      to={`/wiki/${p.conceptSlug}`}
                      className="text-primary hover:underline min-w-0 truncate"
                    >
                      {p.conceptTitle ?? p.conceptSlug}
                    </Link>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {p.targetDate
                        ? new Date(p.targetDate).toLocaleDateString()
                        : "unscheduled"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 240;
  const h = 40;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = w / (points.length - 1);
  const d = points
    .map((p, i) => {
      const x = i * step;
      const y = h - ((p - min) / span) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full max-w-[240px] h-10 text-primary"
      preserveAspectRatio="none"
      aria-label="Mastery trajectory"
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Phase 31B — pick a target credential; get a prerequisite-ordered
// path from the user's current mastery state to that goal.
function GoalPathPanel() {
  const [kind, setKind] = useState<"capstone" | "track" | "exam">(
    "capstone",
  );
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Awaited<
    ReturnType<typeof api.me.goalPath>
  > | null>(null);

  const plan = async () => {
    if (!slug.trim()) return;
    setBusy(true);
    try {
      setData(await api.me.goalPath(kind, slug.trim()));
    } catch {
      setData(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5 mb-6">
      <h2 className="text-sm font-semibold mb-3 inline-flex items-center gap-1.5">
        <Target className="w-4 h-4 text-primary" />
        Goal path
      </h2>
      <div className="flex gap-2 flex-wrap items-end mb-3">
        <label>
          <span className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Target
          </span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className="text-sm px-2 py-2 rounded-md border border-border bg-background"
          >
            <option value="capstone">Capstone</option>
            <option value="track">Track</option>
            <option value="exam">Exam</option>
          </select>
        </label>
        <label className="flex-1 min-w-[10rem]">
          <span className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Slug
          </span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && plan()}
            placeholder="e.g. transformer-from-scratch"
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
          />
        </label>
        <button
          type="button"
          onClick={plan}
          disabled={busy || !slug.trim()}
          className="text-sm px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? "Planning…" : "Plan"}
        </button>
      </div>

      {data && !data.resolvable && (
        <p className="text-sm text-muted-foreground">
          Couldn't resolve that goal — check the slug.
        </p>
      )}
      {data && data.resolvable && (
        <div className="space-y-3">
          {data.estimatedReadyOn && (
            <div className="text-sm">
              Projected ready:{" "}
              <strong>
                {new Date(data.estimatedReadyOn).toLocaleDateString()}
              </strong>
            </div>
          )}
          {data.blockedOn.length > 0 && (
            <div className="text-xs rounded-md border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 p-2">
              Blocked on:{" "}
              {data.blockedOn.map((b) => b.title).join(", ")}
            </div>
          )}
          {data.steps.length === 0 ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              You've already mastered every prerequisite. 🎉
            </p>
          ) : (
            <ol className="space-y-1.5">
              {data.steps.map((s, i) => (
                <li
                  key={s.nodeId}
                  className="text-sm flex items-center justify-between gap-3 rounded-md border border-border px-3 py-1.5"
                >
                  <span className="min-w-0 truncate">
                    <span className="text-muted-foreground tabular-nums mr-2">
                      {i + 1}.
                    </span>
                    <Link
                      to={`/wiki/${s.slug}`}
                      className="text-primary hover:underline"
                    >
                      {s.title}
                    </Link>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground ml-2">
                      {s.status === "in_progress" ? "in progress" : "untouched"}
                    </span>
                  </span>
                  {s.estimatedDays != null && (
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      ~{s.estimatedDays}d
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

// Phase 32C — diff your *signed-proof* skills against a target
// role (or an ad-hoc skill list) and get a dependency-ordered
// path over the gap. Reuses the GoalPathPanel step rendering.
function SkillGapPanel() {
  const [roles, setRoles] = useState<
    Awaited<ReturnType<typeof api.recruiter.roles>>["roles"]
  >([]);
  const [mode, setMode] = useState<"role" | "skills">("role");
  const [roleSlug, setRoleSlug] = useState("");
  const [skillsText, setSkillsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Awaited<
    ReturnType<typeof api.me.skillGap>
  > | null>(null);

  useEffect(() => {
    api.recruiter
      .roles()
      .then((r) => {
        setRoles(r.roles);
        if (r.roles[0]) setRoleSlug(r.roles[0].slug);
      })
      .catch(() => {});
  }, []);

  const analyze = async () => {
    setBusy(true);
    try {
      if (mode === "role") {
        if (!roleSlug) return;
        setData(await api.me.skillGap({ role: roleSlug }));
      } else {
        const skills = skillsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (skills.length === 0) return;
        setData(await api.me.skillGap({ skills }));
      }
    } catch {
      setData(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5 mb-6">
      <h2 className="text-sm font-semibold mb-1 inline-flex items-center gap-1.5">
        <Target className="w-4 h-4 text-primary" />
        Skill gap vs. a role
      </h2>
      <p className="text-xs text-muted-foreground mb-3">
        Compared against what you've <strong>proven with signed
        credentials</strong> — not self-reported.
      </p>
      <div className="flex gap-2 flex-wrap items-end mb-3">
        <label>
          <span className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Mode
          </span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
            className="text-sm px-2 py-2 rounded-md border border-border bg-background"
          >
            <option value="role">Role</option>
            <option value="skills">Ad-hoc skills</option>
          </select>
        </label>
        {mode === "role" ? (
          <label className="flex-1 min-w-[12rem]">
            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Target role
            </span>
            <select
              value={roleSlug}
              onChange={(e) => setRoleSlug(e.target.value)}
              className="w-full text-sm px-2 py-2 rounded-md border border-border bg-background"
            >
              {roles.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="flex-1 min-w-[12rem]">
            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Skill slugs (comma-separated)
            </span>
            <input
              value={skillsText}
              onChange={(e) => setSkillsText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && analyze()}
              placeholder="probability, gradient-descent, attention"
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
            />
          </label>
        )}
        <button
          type="button"
          onClick={analyze}
          disabled={busy}
          className="text-sm px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? "Analyzing…" : "Analyze"}
        </button>
      </div>

      {data && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              {data.gap.proven.length} proven
            </span>
            <span className="px-2 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">
              {data.gap.weak.length} weak
            </span>
            <span className="px-2 py-1 rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300">
              {data.gap.missing.length} missing
            </span>
            <span className="px-2 py-1 rounded-full border border-border text-muted-foreground">
              {Math.round(data.gap.coverage * 100)}% covered
            </span>
          </div>
          {(data.gap.weak.length > 0 || data.gap.missing.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {data.gap.weak.map((w) => (
                <span
                  key={`w-${w.slug}`}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300"
                >
                  {w.title}
                </span>
              ))}
              {data.gap.missing.map((m) => (
                <span
                  key={`m-${m.slug}`}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-300"
                >
                  {m.title}
                </span>
              ))}
            </div>
          )}
          {data.path && data.path.resolvable && data.path.steps.length > 0 ? (
            <ol className="space-y-1.5">
              {data.path.steps.map((s, i) => (
                <li
                  key={s.nodeId}
                  className="text-sm flex items-center justify-between gap-3 rounded-md border border-border px-3 py-1.5"
                >
                  <span className="min-w-0 truncate">
                    <span className="text-muted-foreground tabular-nums mr-2">
                      {i + 1}.
                    </span>
                    <Link
                      to={`/wiki/${s.slug}`}
                      className="text-primary hover:underline"
                    >
                      {s.title}
                    </Link>
                  </span>
                  {s.estimatedDays != null && (
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      ~{s.estimatedDays}d
                    </span>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              No prerequisite gap to close for this target. 🎉
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Phase 34D — commit to a goal by a deadline. Completion mints a
// signed "commitment_kept" credential + a transparency leaf.
function CommitmentsPanel() {
  const [list, setList] = useState<
    Awaited<ReturnType<typeof api.me.commitments>>["commitments"] | null
  >(null);
  const [kind, setKind] = useState<
    "capstone" | "track" | "exam" | "skills"
  >("skills");
  const [slug, setSlug] = useState("");
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    api.me
      .commitments()
      .then((r) => setList(r.commitments))
      .catch(() => setList([]));
  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    if (!slug.trim() || !deadline) return;
    setBusy(true);
    try {
      await api.me.createCommitment({
        goalKind: kind,
        goalSlug: slug.trim(),
        deadlineAt: new Date(deadline).toISOString(),
      });
      toast.success("Commitment made");
      setSlug("");
      setDeadline("");
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not commit");
    } finally {
      setBusy(false);
    }
  };

  const act = async (id: string, kindOf: "complete" | "abandon") => {
    try {
      if (kindOf === "complete") {
        await api.me.completeCommitment(id);
        toast.success("Commitment kept — signed credential minted");
      } else {
        await api.me.abandonCommitment(id);
        toast.info("Commitment abandoned");
      }
      load();
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "Action failed",
      );
    }
  };

  const active = (list ?? []).filter((c) => c.status === "active");

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5 mb-6">
      <h2 className="text-sm font-semibold mb-1 inline-flex items-center gap-1.5">
        <Target className="w-4 h-4 text-primary" />
        Learning commitments
      </h2>
      <p className="text-xs text-muted-foreground mb-3">
        Commit to a goal by a date. Keeping it mints a signed,
        transparency-logged credential.
      </p>
      <div className="flex gap-2 flex-wrap items-end mb-3">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          className="text-sm px-2 py-2 rounded-md border border-border bg-background"
        >
          <option value="skills">Skills</option>
          <option value="capstone">Capstone</option>
          <option value="track">Track</option>
          <option value="exam">Exam</option>
        </select>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder={
            kind === "skills" ? "slug-a,slug-b" : "target slug"
          }
          className="flex-1 min-w-[10rem] text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
        />
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="text-sm px-2 py-2 rounded-md border border-border bg-background"
        />
        <button
          type="button"
          onClick={create}
          disabled={busy || !slug.trim() || !deadline}
          className="text-sm px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Commit
        </button>
      </div>
      {active.length > 0 && (
        <ul className="space-y-1.5">
          {active.map((c) => (
            <li
              key={c.id}
              className="text-sm flex items-center justify-between gap-3 rounded-md border border-border px-3 py-1.5 flex-wrap"
            >
              <span>
                <strong>{c.goalTitle}</strong>{" "}
                <span className="text-muted-foreground">
                  · due {new Date(c.deadlineAt).toLocaleDateString()}
                </span>
              </span>
              <span className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => act(c.id, "complete")}
                  className="text-xs px-2 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Mark kept
                </button>
                <button
                  type="button"
                  onClick={() => act(c.id, "abandon")}
                  className="text-xs px-2 py-1 rounded-md border border-border hover:bg-accent/40"
                >
                  Abandon
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

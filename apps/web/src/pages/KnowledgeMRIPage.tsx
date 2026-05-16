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
  TrendingUp,
} from "lucide-react";
import type { KnowledgeMri, KnowledgeMriNode } from "@axiomic/types";
import { api } from "../lib/api";
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

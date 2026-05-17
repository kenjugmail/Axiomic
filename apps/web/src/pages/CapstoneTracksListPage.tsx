// Sprint 52 — Capstone tracks list.
//
// A track bundles 4-6 capstones into a single curated path. Completing
// all required sub-capstones auto-mints a track-level signed artifact.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Award, Compass, Sparkles, TrendingUp } from "lucide-react";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";
import { EmptyState } from "../components/ui/EmptyState";

const ACCENT_BG: Record<string, string> = {
  indigo: "from-indigo-500/15 to-indigo-500/5",
  emerald: "from-emerald-500/15 to-emerald-500/5",
  rose: "from-rose-500/15 to-rose-500/5",
  amber: "from-amber-500/15 to-amber-500/5",
  sky: "from-sky-500/15 to-sky-500/5",
  violet: "from-violet-500/15 to-violet-500/5",
};

type Track = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  coverEmoji: string;
  accentColor: string;
  tags: string[];
  capstoneCount: number;
  requiredCount: number;
  optionalCount: number;
  earnedBy: number;
  updatedAt: string;
  myCompletedRequired: number;
};

export function CapstoneTracksListPage() {
  const { user } = useAuthStore();
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.tracks
      .list()
      .then((r) => {
        if (!cancelled) setTracks(r.tracks);
      })
      .catch((e) => {
        if (cancelled) return;
        // Clear loading state on failure so the skeleton doesn't
        // render forever (perma-loading bug).
        setTracks([]);
        setError(e?.message ?? "Failed to load tracks");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Capstone tracks
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Curated bundles of capstones. Complete the bundle, earn one signed credential.
          </p>
        </div>
        {user && (
          <Link
            to="/tracks/new"
            className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            New track
          </Link>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {tracks === null && !error && (
        <div className="space-y-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      )}

      {tracks?.length === 0 && (
        <EmptyState
          icon={Compass}
          title="No capstone tracks yet"
          description="Tracks bundle 4-6 capstones into a single learning credential. Start with mastery paths in the meantime."
          cta={
            <Link
              to="/paths"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-foreground text-background text-sm font-medium hover:bg-foreground/90"
            >
              Browse paths
            </Link>
          }
        />
      )}

      <TrackSections tracks={tracks ?? []} signedIn={!!user} />
    </div>
  );
}

// Phase 16D — group tracks into "In progress" / "Recommended for you"
// / "All tracks". Falls back to the flat list when the user is
// signed out, so the legacy behavior is preserved.
function TrackSections({
  tracks,
  signedIn,
}: {
  tracks: Track[];
  signedIn: boolean;
}) {
  const groups = useMemo(() => groupTracks(tracks, signedIn), [tracks, signedIn]);
  if (tracks.length === 0) return null;
  if (!signedIn) {
    return <TrackGrid tracks={tracks} />;
  }
  return (
    <div className="space-y-10">
      {groups.inProgress.length > 0 && (
        <section data-testid="section-in-progress">
          <SectionHeading icon={TrendingUp} title="In progress" />
          <TrackGrid tracks={groups.inProgress} />
        </section>
      )}
      {groups.recommended.length > 0 && (
        <section data-testid="section-recommended">
          <SectionHeading icon={Sparkles} title="Recommended for you" />
          <TrackGrid tracks={groups.recommended} />
        </section>
      )}
      <section data-testid="section-all">
        <SectionHeading icon={Compass} title="All tracks" />
        <TrackGrid tracks={tracks} />
      </section>
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
}: {
  icon: typeof Sparkles;
  title: string;
}) {
  return (
    <h2 className="font-display text-lg font-semibold tracking-tight mb-3 inline-flex items-center gap-2">
      <Icon className="w-5 h-5 text-primary" />
      {title}
    </h2>
  );
}

function TrackGrid({ tracks }: { tracks: Track[] }) {
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {tracks.map((t) => {
        const accent = ACCENT_BG[t.accentColor] ?? ACCENT_BG.violet;
        const progressPct =
          t.requiredCount > 0
            ? Math.round((t.myCompletedRequired / t.requiredCount) * 100)
            : 0;
        return (
          <li key={t.id}>
            <Link
              to={`/tracks/${t.slug}`}
              className={`block rounded-lg border border-border bg-gradient-to-br ${accent} p-5 transition-shadow hover:shadow-md`}
            >
              <div className="flex items-start gap-3">
                <span className="text-3xl shrink-0" aria-hidden>
                  {t.coverEmoji}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-lg font-semibold tracking-tight">
                    {t.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-3">
                    {t.summary}
                  </p>
                  <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      {t.requiredCount} required
                      {t.optionalCount > 0
                        ? ` · ${t.optionalCount} optional`
                        : ""}
                    </span>
                    {t.earnedBy > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Award className="w-3 h-3" />
                        earned by {t.earnedBy}
                      </span>
                    )}
                  </div>
                  {t.myCompletedRequired > 0 && t.requiredCount > 0 && (
                    <div
                      className="mt-3"
                      data-testid="track-progress"
                    >
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        {t.myCompletedRequired} of {t.requiredCount} · {progressPct}%
                      </div>
                    </div>
                  )}
                  {t.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {t.tags.slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] px-1.5 py-0.5 rounded-full border border-border text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

interface TrackGroups {
  inProgress: Track[];
  recommended: Track[];
}

// Splits tracks into discovery groups. Exported for unit testing the
// ranking logic without rendering React.
export function groupTracks(tracks: Track[], signedIn: boolean): TrackGroups {
  if (!signedIn) {
    return { inProgress: [], recommended: [] };
  }
  const inProgress = tracks.filter(
    (t) =>
      t.requiredCount > 0 &&
      t.myCompletedRequired > 0 &&
      t.myCompletedRequired < t.requiredCount,
  );
  const inProgressIds = new Set(inProgress.map((t) => t.id));

  // Tag affinity scores: sum the user's tag frequency (from in-progress
  // tracks) for each candidate track's tags. Tracks with zero progress
  // and the highest affinity float to the top of "Recommended". Fall
  // back to `earnedBy` when the user has no signal yet.
  const userTagFreq = new Map<string, number>();
  for (const t of inProgress) {
    for (const tag of t.tags) {
      userTagFreq.set(tag, (userTagFreq.get(tag) ?? 0) + 1);
    }
  }
  const hasSignal = userTagFreq.size > 0;
  const candidates = tracks.filter(
    (t) => !inProgressIds.has(t.id) && t.myCompletedRequired === 0,
  );
  const scored = candidates.map((t) => {
    const affinity = hasSignal
      ? t.tags.reduce((s, tag) => s + (userTagFreq.get(tag) ?? 0), 0)
      : 0;
    return { t, affinity };
  });
  scored.sort((a, b) => {
    if (b.affinity !== a.affinity) return b.affinity - a.affinity;
    return b.t.earnedBy - a.t.earnedBy;
  });
  const recommended = scored
    .filter((s) => (hasSignal ? s.affinity > 0 : s.t.earnedBy > 0))
    .slice(0, 4)
    .map((s) => s.t);

  return { inProgress, recommended };
}

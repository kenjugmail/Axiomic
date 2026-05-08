// Sprint 52 — Capstone tracks list.
//
// A track bundles 4-6 capstones into a single curated path. Completing
// all required sub-capstones auto-mints a track-level signed artifact.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Award } from "lucide-react";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";

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
};

export function CapstoneTracksListPage() {
  const { user } = useAuthStore();
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.tracks
      .list()
      .then((r) => setTracks(r.tracks))
      .catch((e) => setError(e?.message ?? "Failed to load tracks"));
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
        <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No tracks published yet.
        </div>
      )}

      <ul className="grid gap-4 md:grid-cols-2">
        {tracks?.map((t) => {
          const accent = ACCENT_BG[t.accentColor] ?? ACCENT_BG.violet;
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
                    <h2 className="font-display text-lg font-semibold tracking-tight">
                      {t.title}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-3">
                      {t.summary}
                    </p>
                    <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>
                        {t.requiredCount} required
                        {t.optionalCount > 0 ? ` · ${t.optionalCount} optional` : ""}
                      </span>
                      {t.earnedBy > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Award className="w-3 h-3" />
                          earned by {t.earnedBy}
                        </span>
                      )}
                    </div>
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
    </div>
  );
}

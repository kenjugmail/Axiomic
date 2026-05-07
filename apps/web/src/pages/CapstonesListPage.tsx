// Sprint 26 — Capstones list (published, public).
//
// The flagship surface for the "public, runnable thesis projects"
// wedge. Cards show milestone count + estimated weeks + tag chips so
// a learner can pick a multi-week commitment with eyes open.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { GraduationCap, Plus } from "lucide-react";
import type { CapstoneSummary } from "@axiomic/types";
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

export function CapstonesListPage() {
  const { user } = useAuthStore();
  const [capstones, setCapstones] = useState<CapstoneSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);

  useEffect(() => {
    api.capstones
      .list({ tag: tag ?? undefined })
      .then((r) => setCapstones(r.capstones))
      .catch((e) => setError(e?.message ?? "Failed to load capstones"));
  }, [tag]);

  const allTags = useMemo(() => {
    if (!capstones) return [];
    const counts = new Map<string, number>();
    for (const c of capstones) {
      for (const t of c.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [capstones]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Capstones
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Public, runnable thesis projects that prove what you actually know.
          </p>
        </div>
        {user && (
          <div className="flex gap-2 flex-wrap">
            <Link
              to="/capstones/me/drafts"
              className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
            >
              My drafts
            </Link>
            <Link
              to="/capstones/me/enrollments"
              className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
            >
              My capstones
            </Link>
            <Link
              to="/capstones/new"
              className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
              New capstone
            </Link>
          </div>
        )}
      </div>

      {allTags.length > 0 && (
        <div className="flex items-center gap-1.5 mb-6 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
            Tags
          </span>
          <button
            type="button"
            onClick={() => setTag(null)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              tag === null
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          {allTags.map(([t]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTag(tag === t ? null : t)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                tag === t
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm mb-4">
          {error}
        </div>
      )}

      {capstones === null ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="card" className="h-48" />
          ))}
        </div>
      ) : capstones.length === 0 ? (
        <div className="text-center py-12">
          <GraduationCap className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            No capstones yet. Build the first one.
          </p>
        </div>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-4">
          {capstones.map((c) => (
            <li key={c.id}>
              <Link
                to={`/capstones/${c.slug}`}
                className="block rounded-lg border border-border overflow-hidden hover:shadow-soft transition-shadow"
              >
                <div
                  className={`px-5 py-4 bg-gradient-to-br ${
                    ACCENT_BG[c.accentColor] ?? ACCENT_BG.violet
                  }`}
                >
                  <div className="text-3xl">{c.coverEmoji}</div>
                </div>
                <div className="px-5 py-4">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex-wrap">
                    <span className="font-medium text-primary">
                      {c.estimatedWeeks}w · {c.milestoneCount} milestones
                    </span>
                    {c.tags.slice(0, 2).map((t) => (
                      <span key={t}>· #{t}</span>
                    ))}
                  </div>
                  <h2 className="font-semibold leading-snug mb-1">{c.title}</h2>
                  {c.summary && (
                    <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                      {c.summary}
                    </p>
                  )}
                  <div className="text-xs text-muted-foreground mt-2">
                    by{" "}
                    <span className="font-medium text-foreground">
                      {c.authorDisplayName || c.authorUsername}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

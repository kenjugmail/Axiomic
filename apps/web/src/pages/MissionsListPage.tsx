// Phase 39 — "Goodness" missions list.
//
// Open discovery surface: anyone signed in can browse + open a
// mission. Mirrors the BountiesList / Cohorts list shape. The
// "Start a mission" CTA routes to /missions/new (any auth user).

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Globe, Plus, Users } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";
import { EmptyState } from "../components/ui/EmptyState";
import { relativeTime } from "../lib/dates";

type DiscoverMission = Awaited<
  ReturnType<typeof api.missions.discover>
>["missions"][number];

export function MissionsListPage() {
  const user = useAuthStore((s) => s.user);
  const [items, setItems] = useState<DiscoverMission[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.missions
      .discover()
      .then((r) => {
        if (!cancelled) setItems(r.missions);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load");
          setItems([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
            <Globe className="w-7 h-7 text-primary" />
            Goodness missions
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">
            Big real-world problems — hunger, poverty, climate, health
            — decomposed into sub-problems. Join one, contribute
            analysis / data / solutions with links + writeups, and get
            your work peer- and expert-verified into a signed,
            tamper-evident credential.
          </p>
        </div>
        {user && (
          <Link
            to="/missions/new"
            className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Start a mission
          </Link>
        )}
      </header>

      {error && (
        <p className="text-sm text-rose-600 dark:text-rose-400 mb-3">
          {error}
        </p>
      )}

      {items === null && (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      )}

      {items && items.length === 0 && (
        <EmptyState
          icon={Globe}
          title="No missions yet"
          description="Be the first to frame a problem worth solving together."
        />
      )}

      {items && items.length > 0 && (
        <ul className="space-y-3">
          {items.map((m) => (
            <li
              key={m.slug}
              className="rounded-lg border border-border bg-card p-4"
              data-testid="mission-row"
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <Link
                  to={`/missions/${m.slug}`}
                  className="font-display text-base font-semibold hover:text-primary"
                >
                  {m.title}
                </Link>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {m.theme} · {relativeTime(m.createdAt)}
                </span>
              </div>
              {m.summaryMd && (
                <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
                  {m.summaryMd}
                </p>
              )}
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {m.memberCount}{" "}
                  {m.memberCount === 1 ? "member" : "members"}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-accent/40 uppercase tracking-wider text-[10px]">
                  {m.status}
                </span>
                {m.topicTags.slice(0, 3).map((t) => (
                  <span key={t} className="text-muted-foreground">
                    #{t}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

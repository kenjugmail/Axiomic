// Phase 17C — Cohort detail surface. The list page links here but
// until now the route 404'd. Shows the cohort header, members, and
// a recent-activity feed aggregated from existing tables (joins,
// passed milestone submissions, completed capstones).

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Activity,
  Award,
  CheckCircle2,
  ExternalLink,
  UserPlus,
  Users,
} from "lucide-react";
import { Skeleton } from "../components/ui";
import { EmptyState } from "../components/ui/EmptyState";

interface CohortMember {
  username: string;
  displayName: string | null;
  role: string;
  joinedAt: string;
}

interface CohortDetail {
  id: string;
  slug: string;
  name: string;
  description: string;
  capstone: { slug: string; title: string; coverEmoji: string } | null;
  visibility: "open" | "invite";
  creatorUsername: string;
  members: CohortMember[];
  memberCount: number;
  myRole: string | null;
  createdAt: string;
}

type ActivityEvent =
  | {
      kind: "joined";
      ts: string;
      actorUsername: string;
      refSlug: null;
      refTitle: null;
    }
  | {
      kind: "submitted_milestone" | "completed_capstone";
      ts: string;
      actorUsername: string;
      refSlug: string;
      refTitle: string;
    };

export function CohortDetailPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [cohort, setCohort] = useState<CohortDetail | null>(null);
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setError("");
    setCohort(null);
    setEvents(null);
    Promise.all([
      fetch(`/api/v1/cohorts/${slug}`, { credentials: "include" }),
      fetch(`/api/v1/cohorts/${slug}/activity`, { credentials: "include" }),
    ])
      .then(async ([detailRes, activityRes]) => {
        if (!detailRes.ok) throw new Error("Cohort not found");
        const detailJson = (await detailRes.json()) as { cohort: CohortDetail };
        if (cancelled) return;
        setCohort(detailJson.cohort);
        if (activityRes.ok) {
          const activityJson = (await activityRes.json()) as {
            events: ActivityEvent[];
          };
          if (!cancelled) setEvents(activityJson.events);
        } else {
          if (!cancelled) setEvents([]);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load cohort");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link to="/cohorts" className="text-sm text-primary hover:underline">
          ← Back to cohorts
        </Link>
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }
  if (!cohort) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link to="/cohorts" className="text-sm text-primary hover:underline">
        ← Back to cohorts
      </Link>

      <header className="mt-3 rounded-lg border border-border bg-card p-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight inline-flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" />
          {cohort.name}
        </h1>
        {cohort.description && (
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            {cohort.description}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            {cohort.memberCount} member{cohort.memberCount === 1 ? "" : "s"}
          </span>
          <span>·</span>
          <span>
            organized by{" "}
            <Link
              to={`/profile/${cohort.creatorUsername}`}
              className="hover:text-foreground"
            >
              @{cohort.creatorUsername}
            </Link>
          </span>
          <span>·</span>
          <span
            className={
              cohort.visibility === "open"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-600 dark:text-amber-400"
            }
          >
            {cohort.visibility === "open" ? "Open" : "Invite-only"}
          </span>
          {cohort.capstone && (
            <>
              <span>·</span>
              <Link
                to={`/capstones/${cohort.capstone.slug}`}
                className="hover:text-foreground inline-flex items-center gap-1"
              >
                <span>{cohort.capstone.coverEmoji}</span>
                <span>building {cohort.capstone.title}</span>
              </Link>
            </>
          )}
        </div>
      </header>

      <div className="grid md:grid-cols-2 gap-6 mt-6">
        <section>
          <h2 className="font-display text-lg font-semibold tracking-tight mb-3 inline-flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Members
          </h2>
          {cohort.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {cohort.members.map((m) => (
                <li
                  key={m.username}
                  className="rounded-md border border-border bg-card px-3 py-2 flex items-baseline justify-between gap-2"
                >
                  <Link
                    to={`/profile/${m.username}`}
                    className="text-sm font-medium hover:text-primary"
                  >
                    {m.displayName ?? `@${m.username}`}
                  </Link>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {m.role} · joined{" "}
                    {new Date(m.joinedAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold tracking-tight mb-3 inline-flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Recent activity
          </h2>
          {events === null ? (
            <div className="space-y-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : events.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No recent activity"
              description="Once members join or pass milestones, the feed picks it up."
            />
          ) : (
            <ul className="space-y-2" data-testid="cohort-activity">
              {events.map((e, i) => (
                <li
                  key={`${e.kind}-${e.actorUsername}-${e.ts}-${i}`}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm flex items-start gap-2"
                >
                  <ActivityIcon kind={e.kind} />
                  <div className="min-w-0 flex-1">
                    <div>
                      <Link
                        to={`/profile/${e.actorUsername}`}
                        className="font-medium hover:text-primary"
                      >
                        @{e.actorUsername}
                      </Link>{" "}
                      {phraseFor(e)}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(e.ts).toLocaleString()}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function ActivityIcon({ kind }: { kind: ActivityEvent["kind"] }) {
  if (kind === "joined")
    return (
      <UserPlus
        className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5"
        aria-hidden="true"
      />
    );
  if (kind === "completed_capstone")
    return (
      <Award
        className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
        aria-hidden="true"
      />
    );
  return (
    <CheckCircle2
      className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
      aria-hidden="true"
    />
  );
}

function phraseFor(e: ActivityEvent): React.ReactNode {
  if (e.kind === "joined") return <>joined the cohort</>;
  if (e.kind === "completed_capstone")
    return (
      <>
        completed{" "}
        <Link
          to={`/capstones/${e.refSlug}`}
          className="hover:text-primary inline-flex items-center gap-0.5"
        >
          {e.refTitle}
          <ExternalLink className="w-3 h-3" />
        </Link>
      </>
    );
  return (
    <>
      passed{" "}
      <Link
        to={`/capstones/${e.refSlug}`}
        className="hover:text-primary inline-flex items-center gap-0.5"
      >
        {e.refTitle}
        <ExternalLink className="w-3 h-3" />
      </Link>
    </>
  );
}

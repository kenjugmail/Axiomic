// Phase 17C — Cohort detail surface. The list page links here but
// until now the route 404'd. Shows the cohort header, members, and
// a recent-activity feed aggregated from existing tables (joins,
// passed milestone submissions, completed capstones).

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Activity,
  Award,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { api, ApiError } from "../lib/api";
import { Skeleton } from "../components/ui";
import { EmptyState } from "../components/ui/EmptyState";
import { ReviewRoom } from "../components/ReviewRoom";
import { relativeTime } from "../lib/dates";
import { toast } from "../stores/toast";

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
                      {relativeTime(e.ts)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <CohortProgressPanel slug={slug} />
      <CohortSessionsPanel slug={slug} />
    </div>
  );
}

function CohortProgressPanel({ slug }: { slug: string }) {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof api.cohorts.progress>
  > | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api.cohorts
      .progress(slug)
      .then((r) => !cancelled && setData(r))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [slug]);
  if (failed) return null;
  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-5">
      <h2 className="text-sm font-semibold mb-3 inline-flex items-center gap-1.5">
        <TrendingUp className="w-4 h-4 text-primary" />
        Group progress
        {data && (
          <span className="text-[10px] font-normal text-muted-foreground">
            {data.milestonesCleared} milestone
            {data.milestonesCleared === 1 ? "" : "s"} cleared
          </span>
        )}
      </h2>
      {!data ? (
        <Skeleton className="h-20" />
      ) : data.members.length === 0 ? (
        <p className="text-sm text-muted-foreground">No members yet.</p>
      ) : (
        <ul className="space-y-2">
          {data.members.map((m) => {
            const total = m.mastered + m.weakConcepts || 1;
            const pct = Math.round((m.mastered / total) * 100);
            return (
              <li key={m.username} className="text-sm">
                <div className="flex items-center justify-between gap-3">
                  <Link
                    to={`/profile/${m.username}`}
                    className="hover:text-primary"
                  >
                    {m.displayName ?? `@${m.username}`}
                  </Link>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {m.mastered} mastered · {m.capstonesCompleted} capstone
                    {m.capstonesCompleted === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CohortSessionsPanel({ slug }: { slug: string }) {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof api.cohorts.sessions>
  > | null>(null);
  const [failed, setFailed] = useState(false);
  const [openRoom, setOpenRoom] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");

  const reload = () =>
    api.cohorts
      .sessions(slug)
      .then(setData)
      .catch(() => setFailed(true));
  useEffect(() => {
    let cancelled = false;
    api.cohorts
      .sessions(slug)
      .then((r) => !cancelled && setData(r))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const create = async () => {
    if (!title.trim() || !when) return;
    try {
      await api.cohorts.createSession(slug, {
        title: title.trim(),
        scheduledAt: new Date(when).toISOString(),
      });
      toast.success("Session scheduled");
      setTitle("");
      setWhen("");
      setCreating(false);
      reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't schedule");
    }
  };

  if (failed) return null;
  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold inline-flex items-center gap-1.5">
          <CalendarClock className="w-4 h-4 text-primary" />
          Study sessions
        </h2>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
        >
          {creating ? "Cancel" : "Schedule"}
        </button>
      </div>
      {creating && (
        <div className="flex gap-2 flex-wrap mb-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Session title"
            className="flex-1 min-w-[10rem] text-sm px-3 py-2 rounded-md border border-border bg-background"
          />
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="text-sm px-3 py-2 rounded-md border border-border bg-background"
          />
          <button
            type="button"
            onClick={create}
            disabled={!title.trim() || !when}
            className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Create
          </button>
        </div>
      )}
      {!data ? (
        <Skeleton className="h-16" />
      ) : data.sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No sessions scheduled. Organizers and mentors can schedule
          one.
        </p>
      ) : (
        <ul className="space-y-2">
          {data.sessions.map((s) => (
            <li
              key={s.id}
              className="rounded-md border border-border p-3"
              data-testid="cohort-session"
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm font-medium">{s.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(s.scheduledAt).toLocaleString()} · by{" "}
                    {s.createdByUsername}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setOpenRoom(openRoom === s.id ? null : s.id)
                  }
                  className="text-xs px-3 py-1.5 rounded-md border border-primary/40 text-primary hover:bg-primary/10"
                >
                  {openRoom === s.id ? "Leave room" : "Join live room"}
                </button>
              </div>
              {openRoom === s.id && (
                <div className="mt-3">
                  <ReviewRoom kind="cohort_study" roomId={s.roomId} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
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

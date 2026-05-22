// Phase 34C — the daily "Review & Prove" driver.
//
// One ordered surface fusing SRS-due flashcards, active weak
// concepts, decay signals (stale credentials + long-resolved
// misconceptions), the active commitment's next goal-path steps,
// and the review streak. Each row deep-links to its existing
// action — this is the daily habit loop the supply-side
// investment was missing.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Flame,
  Layers,
  AlertTriangle,
  Clock,
  Target,
  CalendarClock,
  RotateCcw,
} from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";
import { EmptyState } from "../components/ui/EmptyState";

type Today = Awaited<ReturnType<typeof api.me.today>>;

export function TodayPage() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<Today | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api.me
      .today()
      .then((r) => !cancelled && setData(r))
      .catch(
        (e) =>
          !cancelled &&
          setError(e instanceof ApiError ? e.message : "Failed to load"),
      );
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold mb-2">
          Today
        </h1>
        <p className="text-sm text-muted-foreground">
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>{" "}
          to see your daily review queue.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <header className="mb-6 flex items-baseline justify-between gap-3 flex-wrap">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Today
        </h1>
        {data && (
          <span
            className={`text-sm inline-flex items-center gap-1.5 px-3 py-1 rounded-full border ${
              data.streakInDanger
                ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "border-border text-muted-foreground"
            }`}
          >
            <Flame className="w-4 h-4" />
            {data.reviewStreak}-day streak
            {data.streakInDanger ? " · keep it alive" : ""}
          </span>
        )}
      </header>

      {error && (
        <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
      )}
      {!data && !error && (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <Card
            icon={Layers}
            title="Flashcards due"
            count={data.dueFlashcards.count}
            cta={{ to: "/flashcards", label: "Review" }}
          >
            {data.dueFlashcards.sample.slice(0, 3).map((f) => (
              <li key={f.id} className="truncate">
                {f.front}
              </li>
            ))}
          </Card>

          {data.activeCommitment && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <div className="text-sm font-semibold inline-flex items-center gap-1.5">
                <CalendarClock className="w-4 h-4 text-primary" />
                Active commitment
              </div>
              <div className="text-sm mt-1">
                <strong>{data.activeCommitment.goalTitle}</strong> · due{" "}
                {new Date(
                  data.activeCommitment.deadlineAt,
                ).toLocaleDateString()}
              </div>
              {data.goalPathNext.length > 0 && (
                <ol className="mt-2 space-y-1 text-sm">
                  {data.goalPathNext.map((s) => (
                    <li key={s.slug}>
                      <Link
                        to={`/wiki/${s.slug}`}
                        className="text-primary hover:underline"
                      >
                        {s.title}
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
              <Link
                to="/me/mri"
                className="text-xs text-primary hover:underline mt-2 inline-block"
              >
                Open Knowledge MRI →
              </Link>
            </div>
          )}

          <Card
            icon={Target}
            title="Weak concepts"
            count={data.weakConcepts.length}
            cta={{ to: "/me/weak-concepts", label: "Prove them" }}
          >
            {data.weakConcepts.slice(0, 3).map((w) => (
              <li key={w.id} className="truncate">
                {w.label}
              </li>
            ))}
          </Card>

          {data.decay.resolvedToRefresh.length > 0 && (
            <Card
              icon={Clock}
              title="Due for a refresh"
              count={data.decay.resolvedToRefresh.length}
              cta={{ to: "/me/weak-concepts", label: "Re-prove" }}
            >
              {data.decay.resolvedToRefresh.slice(0, 3).map((d) => (
                <li key={d.diagnosisId} className="truncate">
                  {d.label}{" "}
                  <span className="text-muted-foreground">
                    · {d.ageDays}d since resolved
                  </span>
                </li>
              ))}
            </Card>
          )}

          {data.recentlyCompleted.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-sm font-semibold inline-flex items-center gap-1.5">
                <RotateCcw className="w-4 h-4 text-primary" />
                Revisit recent lessons
                <span className="text-muted-foreground">
                  · {data.recentlyCompleted.length}
                </span>
              </div>
              <ul className="mt-2 space-y-1 text-sm">
                {data.recentlyCompleted.map((r) => (
                  <li key={`${r.pathSlug}/${r.nodeSlug}`} className="truncate">
                    <Link
                      to={`/paths/${r.pathSlug}/lessons/${r.nodeSlug}`}
                      className="text-primary hover:underline"
                    >
                      {r.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.decay.staleCredentials.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200 inline-flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                {data.decay.staleCredentials.length} signed credential
                {data.decay.staleCredentials.length === 1 ? "" : "s"} have
                gone stale —{" "}
                <Link
                  to="/me/credentials"
                  className="underline hover:no-underline"
                >
                  re-attest to keep your proof fresh
                </Link>
                .
              </span>
            </div>
          )}

          {data.dueFlashcards.count === 0 &&
            data.weakConcepts.length === 0 &&
            data.decay.resolvedToRefresh.length === 0 &&
            data.decay.staleCredentials.length === 0 &&
            !data.activeCommitment && (
              <EmptyState
                icon={Flame}
                title="All clear for today"
                description="Nothing due. Start a goal path or commit to one to keep momentum."
              />
            )}
        </div>
      )}
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  count,
  cta,
  children,
}: {
  icon: typeof Layers;
  title: string;
  count: number;
  cta: { to: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold inline-flex items-center gap-1.5">
          <Icon className="w-4 h-4 text-primary" />
          {title}
          <span className="text-muted-foreground">· {count}</span>
        </div>
        {count > 0 && (
          <Link
            to={cta.to}
            className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {cta.label}
          </Link>
        )}
      </div>
      {count > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          {children}
        </ul>
      )}
    </div>
  );
}

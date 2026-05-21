import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Flame, Sparkles, AlertCircle, Trophy } from "lucide-react";

// Forward-looking progress dashboard: "what should I do next?"
// Complements ProfilePage (backward-looking — streak + earned
// achievements + history) with in-progress paths, a single
// recommended next lesson, weakest concepts to retry, and a
// what's-new rail.

interface DashboardResponse {
  inProgressPaths: Array<{
    pathSlug: string;
    pathTitle: string;
    total: number;
    completed: number;
  }>;
  recommendedNext: Array<{
    pathSlug: string;
    pathTitle: string;
    nodeSlug: string;
    nodeTitle: string;
    nodeDescription: string;
  }>;
  weakestConcepts: Array<{
    pathSlug: string;
    pathTitle: string;
    nodeSlug: string;
    nodeTitle: string;
    quizScore: number | null;
  }>;
  newPaths: Array<{ id: string; slug: string; title: string; description: string }>;
}

export function LearnNextPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/v1/mastery/dashboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .finally(() => setLoading(false));
    fetch("/api/v1/achievements")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStreak(d?.streak ?? null))
      .catch(() => undefined);
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-1">Learn next</h1>
          <p className="text-muted-foreground text-sm">
            Pick up where you left off. Recommendations come from your prereq DAG + completion state.
          </p>
        </div>
        {streak !== null && (
          <div className="flex items-center gap-1.5 text-sm">
            <Flame className="h-4 w-4 text-orange-500" />
            <span className="font-semibold">{streak}</span>
            <span className="text-muted-foreground">day streak</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse h-24 bg-muted rounded-lg" />
          ))}
        </div>
      ) : !data || (data.inProgressPaths.length === 0 && data.recommendedNext.length === 0) ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">No progress yet — start with a path:</p>
          <Link to="/discover" className="inline-block px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90">
            Browse paths
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Recommended next lesson — hero */}
          {data.recommendedNext.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Recommended next
              </h2>
              <div className="space-y-2">
                {data.recommendedNext.map((n, i) => (
                  <Link
                    key={`${n.pathSlug}-${n.nodeSlug}`}
                    to={`/paths/${n.pathSlug}/lessons/${n.nodeSlug}`}
                    className={`block p-4 rounded-lg border transition-colors hover:bg-accent/40 ${i === 0 ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}
                  >
                    <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
                      <span>{n.pathTitle}</span>
                      {i === 0 && <span className="text-primary font-semibold">· next up</span>}
                    </div>
                    <h3 className="font-semibold mb-1">{n.nodeTitle}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">{n.nodeDescription}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* In-progress paths */}
          {data.inProgressPaths.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Trophy className="h-4 w-4 text-fbbf24" /> In progress
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {data.inProgressPaths.map((p) => {
                  const pct = Math.round((p.completed / p.total) * 100);
                  return (
                    <Link
                      key={p.pathSlug}
                      to={`/paths/${p.pathSlug}`}
                      className="block p-4 rounded-lg border border-border bg-card hover:bg-accent/40"
                    >
                      <div className="flex items-baseline justify-between mb-1">
                        <h3 className="font-semibold">{p.pathTitle}</h3>
                        <span className="text-xs text-muted-foreground tabular-nums">{p.completed}/{p.total}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* Weakest concepts */}
          {data.weakestConcepts.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600" /> Worth a second look
              </h2>
              <ul className="space-y-2">
                {data.weakestConcepts.map((c) => (
                  <li key={`${c.pathSlug}-${c.nodeSlug}`}>
                    <Link
                      to={`/paths/${c.pathSlug}/lessons/${c.nodeSlug}`}
                      className="block p-3 rounded border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10"
                    >
                      <div className="flex items-baseline justify-between">
                        <div>
                          <span className="text-xs text-muted-foreground">{c.pathTitle}</span>
                          <h3 className="font-medium">{c.nodeTitle}</h3>
                        </div>
                        {c.quizScore !== null && (
                          <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300">
                            {Math.round(c.quizScore * 100)}%
                          </span>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Newest paths */}
          {data.newPaths.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-lg font-semibold">Recently added</h2>
                <Link to="/discover" className="text-xs text-muted-foreground hover:text-foreground">browse all →</Link>
              </div>
              <div className="overflow-x-auto -mx-4 px-4 pb-2">
                <div className="flex gap-3 min-w-min">
                  {data.newPaths.map((p) => (
                    <Link
                      key={p.id}
                      to={`/paths/${p.slug}`}
                      className="flex-shrink-0 w-56 p-3 rounded-lg border border-border bg-card hover:bg-accent/40"
                    >
                      <h3 className="text-sm font-semibold mb-1 line-clamp-1">{p.title}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-3">{p.description}</p>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

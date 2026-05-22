import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type MasteryPath } from "../lib/api";
import { findJourney } from "../lib/journeys";

// /journeys/:slug — render a curated multi-path sequence with the
// user's progress on each constituent path. Resolves each path slug
// against the live mastery_paths list; gracefully omits slugs that
// don't exist.

export function JourneyDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const journey = slug ? findJourney(slug) : undefined;
  const [paths, setPaths] = useState<MasteryPath[]>([]);
  const [completion, setCompletion] = useState<Map<string, { completed: number; total: number; fraction: number }>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.mastery
      .getPaths()
      .then((data) => setPaths(data.paths))
      .finally(() => setLoading(false));
    api.mastery
      .getPathsCompletion()
      .then((r) => {
        const m = new Map<string, { completed: number; total: number; fraction: number }>();
        for (const c of r.completion) m.set(c.pathSlug, c);
        setCompletion(m);
      })
      .catch(() => undefined);
  }, []);

  if (!journey) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-2">Journey not found</h1>
        <Link to="/journeys" className="text-primary hover:underline">
          ← All journeys
        </Link>
      </div>
    );
  }

  const byTitle = new Map(paths.map((p) => [p.slug, p]));
  const chain = journey.paths
    .map((slug) => byTitle.get(slug))
    .filter((p): p is MasteryPath => p !== undefined);

  // Aggregate completion across the chain
  const aggCompleted = chain.reduce((sum, p) => sum + (completion.get(p.slug)?.completed ?? 0), 0);
  const aggTotal = chain.reduce((sum, p) => sum + (completion.get(p.slug)?.total ?? 0), 0);
  const aggPct = aggTotal > 0 ? Math.round((aggCompleted / aggTotal) * 100) : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link to="/journeys" className="text-sm text-muted-foreground hover:text-foreground mb-2 inline-block">
        &larr; All journeys
      </Link>
      <div className="flex items-start gap-3 mt-2 mb-2">
        <span className="text-4xl leading-none" aria-hidden>{journey.icon}</span>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{journey.title}</h1>
          <p className="text-muted-foreground mt-1">{journey.tagline}</p>
        </div>
      </div>

      {aggTotal > 0 && aggCompleted > 0 && (
        <div className="mb-8 max-w-md">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-xs text-muted-foreground">Journey progress</span>
            <span className="text-xs font-mono tabular-nums">{aggCompleted}/{aggTotal} nodes ({aggPct}%)</span>
          </div>
          <div className="h-2 bg-muted rounded overflow-hidden">
            <div className={`h-full ${aggPct === 100 ? "bg-green-500" : "bg-primary"} transition-all`} style={{ width: `${aggPct}%` }} />
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {chain.map((_, i) => (
            <div key={i} className="animate-pulse h-20 bg-muted rounded-lg" />
          ))}
        </div>
      ) : chain.length === 0 ? (
        <p className="text-muted-foreground">No paths in this journey are seeded yet.</p>
      ) : (
        <ol className="space-y-3">
          {chain.map((p, idx) => {
            const c = completion.get(p.slug);
            const pct = c && c.total > 0 ? Math.round((c.completed / c.total) * 100) : 0;
            return (
              <li key={p.slug}>
                <Link
                  to={`/paths/${p.slug}`}
                  className="block p-4 rounded-lg border border-border bg-card hover:bg-accent/40 hover:border-primary/40 transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-mono text-muted-foreground tabular-nums mt-1">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between mb-1">
                        <h2 className="font-semibold group-hover:text-primary">{p.title}</h2>
                        {c && c.completed > 0 && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${pct === 100 ? "bg-green-500/20 text-green-700 dark:text-green-300" : "bg-primary/15 text-primary"}`}>
                            {pct === 100 ? "✓" : `${c.completed}/${c.total}`}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{p.description}</p>
                      {c && c.total > 0 && (
                        <div className="h-1 bg-muted rounded mt-2 overflow-hidden">
                          <div className={`h-full ${pct === 100 ? "bg-green-500" : "bg-primary/60"}`} style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

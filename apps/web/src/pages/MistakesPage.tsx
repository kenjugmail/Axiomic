import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { QuizMistakeEntry } from "@axiomic/types";
import { useAuthStore } from "../stores/auth";

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// Group mistakes by node so the user sees their weak areas at a glance.
function groupByNode(
  mistakes: QuizMistakeEntry[],
): Array<{
  nodeSlug: string;
  nodeTitle: string;
  pathSlug: string | null;
  pathTitle: string | null;
  pending: QuizMistakeEntry[];
  resolved: QuizMistakeEntry[];
}> {
  const map = new Map<string, ReturnType<typeof groupByNode>[number]>();
  for (const m of mistakes) {
    let g = map.get(m.nodeSlug);
    if (!g) {
      g = {
        nodeSlug: m.nodeSlug,
        nodeTitle: m.nodeTitle,
        pathSlug: m.pathSlug,
        pathTitle: m.pathTitle,
        pending: [],
        resolved: [],
      };
      map.set(m.nodeSlug, g);
    }
    if (m.resolvedAt) g.resolved.push(m);
    else g.pending.push(m);
  }
  return Array.from(map.values()).sort(
    (a, b) => b.pending.length - a.pending.length,
  );
}

export function MistakesPage() {
  const { user, loading: authLoading } = useAuthStore();
  const [mistakes, setMistakes] = useState<QuizMistakeEntry[] | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    api.mastery
      .mistakes()
      .then((r) => setMistakes(r.mistakes))
      .catch(() => setMistakes([]));
  }, [user, authLoading]);

  if (authLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="animate-pulse h-32 bg-muted rounded-lg" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground mb-4">
          Sign in to see what you've gotten wrong.
        </p>
        <Link to="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </div>
    );
  }

  const grouped = mistakes ? groupByNode(mistakes) : [];
  const totalPending = grouped.reduce((acc, g) => acc + g.pending.length, 0);
  const totalResolved = grouped.reduce((acc, g) => acc + g.resolved.length, 0);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-1">Your mistakes</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Every quiz question you've gotten wrong, grouped by node. Each one
        was auto-saved as a flashcard you can review.
      </p>

      <div className="grid grid-cols-3 gap-2 mb-6">
        <Stat label="Open" value={totalPending} accent="rose" />
        <Stat label="Resolved" value={totalResolved} accent="emerald" />
        <Link
          to="/flashcards"
          className="rounded-lg border border-border p-3 hover:bg-accent/40 text-center"
        >
          <div className="text-xs text-muted-foreground">Flashcards</div>
          <div className="text-2xl font-bold mt-0.5 text-primary">→</div>
        </Link>
      </div>

      {mistakes === null ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse bg-muted rounded-md" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground border border-dashed border-border rounded-xl">
          <div className="text-4xl mb-2">🎯</div>
          <p className="text-base">No mistakes logged yet.</p>
          <p className="text-sm mt-2">
            Take any{" "}
            <Link to="/paths" className="text-primary hover:underline">
              quiz
            </Link>{" "}
            and any wrong answer will land here.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {grouped.map((g) => (
            <li
              key={g.nodeSlug}
              className="rounded-xl border border-border bg-card overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    to={`/wiki/${g.nodeSlug}`}
                    className="font-semibold hover:underline"
                  >
                    {g.nodeTitle}
                  </Link>
                  {g.pathTitle && (
                    <div className="text-xs text-muted-foreground">
                      <Link to={`/paths/${g.pathSlug}`} className="hover:underline">
                        {g.pathTitle}
                      </Link>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider shrink-0">
                  {g.pending.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400">
                      {g.pending.length} open
                    </span>
                  )}
                  {g.resolved.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                      {g.resolved.length} resolved
                    </span>
                  )}
                </div>
              </div>
              <ul className="divide-y divide-border">
                {[...g.pending, ...g.resolved].map((m) => (
                  <li
                    key={m.questionId}
                    className="px-4 py-2.5 flex items-start gap-3"
                  >
                    <span
                      className={`text-lg shrink-0 ${
                        m.resolvedAt
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {m.resolvedAt ? "✓" : "✗"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">
                        {m.questionText ?? (
                          <span className="text-muted-foreground italic">
                            Question text unavailable
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {m.occurrences > 1 && (
                          <>
                            wrong {m.occurrences}× ·{" "}
                          </>
                        )}
                        last {timeAgo(m.lastWrongAt)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "rose" | "emerald";
}) {
  const cls =
    accent === "rose"
      ? "text-rose-600 dark:text-rose-400"
      : "text-emerald-600 dark:text-emerald-400";
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-0.5 ${cls}`}>{value}</div>
    </div>
  );
}

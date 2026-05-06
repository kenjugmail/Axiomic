import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, type MasteryPath, type MasteryNode, type UserNodeProgress } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { QuizModal } from "../components/QuizModal";
import { LessonPlayer } from "../components/LessonPlayer";
import { PathGraph } from "../components/mastery/PathGraph";

const LEVEL_COLORS: Record<string, string> = {
  apprentice: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  practitioner: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  specialist: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  expert: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  researcher: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const LEVEL_ORDER = ["apprentice", "practitioner", "specialist", "expert", "researcher"];
const LEVEL_LABELS: Record<string, string> = {
  apprentice: "Apprentice",
  practitioner: "Practitioner",
  specialist: "Specialist",
  expert: "Expert",
  researcher: "Researcher",
};

function highestLevelIdx(
  nodes: MasteryNode[],
  progress: UserNodeProgress[],
): number {
  let highest = -1;
  const completed = new Set(progress.filter((p) => p.completed).map((p) => p.nodeId));
  for (const n of nodes) {
    if (!completed.has(n.id)) continue;
    const idx = LEVEL_ORDER.indexOf(n.level);
    if (idx > highest) highest = idx;
  }
  return highest;
}

export function MasteryPathPage() {
  const { slug } = useParams<{ slug: string }>();
  const [path, setPath] = useState<MasteryPath | null>(null);
  const [nodes, setNodes] = useState<MasteryNode[]>([]);
  const [progress, setProgress] = useState<UserNodeProgress[]>([]);
  const [nodeMastery, setNodeMastery] = useState<Record<string, number>>({});
  const [lockState, setLockState] = useState<Record<string, boolean>>({});
  const [lastVisitedNodeSlug, setLastVisitedNodeSlug] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [quizFor, setQuizFor] = useState<MasteryNode | null>(null);
  const [lessonFor, setLessonFor] = useState<MasteryNode | null>(null);
  const [view, setView] = useState<"list" | "graph">("list");
  const [levelUpBanner, setLevelUpBanner] = useState<string | null>(null);
  const prevHighestRef = useRef<number>(-2); // sentinel: not initialized yet
  const user = useAuthStore((s) => s.user);

  const loadPath = () => {
    if (!slug) return;
    setLoading(true);
    api.mastery
      .getPath(slug)
      .then((data) => {
        setPath(data.path);
        setNodes(data.nodes);
        setProgress(data.progress);
        setNodeMastery(data.nodeMastery ?? {});
        setLockState(data.lockState ?? {});
        setLastVisitedNodeSlug(data.lastVisitedNodeSlug ?? null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    prevHighestRef.current = -2;
    setLevelUpBanner(null);
    loadPath();
  }, [slug]);

  // Watch for a level transition each time progress changes. Compares the
  // newly-computed highest level against the previously-seen one; pops a
  // banner only on a strictly increasing transition. The first observation
  // (sentinel = -2) is skipped so the banner doesn't fire on initial load.
  useEffect(() => {
    const newHighest = highestLevelIdx(nodes, progress);
    if (prevHighestRef.current !== -2 && newHighest > prevHighestRef.current) {
      setLevelUpBanner(LEVEL_LABELS[LEVEL_ORDER[newHighest]] ?? null);
      const t = setTimeout(() => setLevelUpBanner(null), 6000);
      prevHighestRef.current = newHighest;
      return () => clearTimeout(t);
    }
    prevHighestRef.current = newHighest;
  }, [progress, nodes]);

  const isCompleted = (nodeId: string) => progress.some((p) => p.nodeId === nodeId && p.completed);
  const quizScoreFor = (nodeId: string) => {
    const p = progress.find((p) => p.nodeId === nodeId);
    return p?.quizScore ?? null;
  };

  const handleComplete = async (nodeId: string) => {
    if (!user) return;
    await api.mastery.markComplete(nodeId);
    loadPath();
  };

  const handleQuizPassed = () => {
    loadPath();
  };

  const completedCount = progress.filter((p) => p.completed).length;
  const totalNodes = nodes.length;
  const progressPercent = totalNodes > 0 ? (completedCount / totalNodes) * 100 : 0;

  // Determine current level
  const currentLevel = (() => {
    const idx = highestLevelIdx(nodes, progress);
    return idx >= 0 ? LEVEL_ORDER[idx] : "apprentice";
  })();

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-4 bg-muted rounded w-2/3" />
        </div>
      </div>
    );
  }

  if (!path) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold mb-4">Path not found</h1>
        <Link to="/paths" className="text-primary hover:underline">Browse mastery paths</Link>
      </div>
    );
  }

  const nodesByLevel = LEVEL_ORDER.map((level) => ({
    level,
    label: LEVEL_LABELS[level],
    nodes: nodes.filter((n) => n.level === level).sort((a, b) => a.order - b.order),
  })).filter((g) => g.nodes.length > 0);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <Link to="/paths" className="text-sm text-muted-foreground hover:text-foreground mb-2 inline-block">
          &larr; All Paths
        </Link>
        <h1 className="text-3xl font-bold">{path.title}</h1>
        <p className="text-muted-foreground mt-1">{path.description}</p>
      </div>

      {levelUpBanner && (
        <div className="mb-6 p-4 rounded-lg border border-primary/40 bg-primary/10 flex items-center justify-between animate-in fade-in">
          <div>
            <div className="text-sm font-semibold">🎉 {levelUpBanner} unlocked!</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              You've crossed into a new mastery level on this path.
            </div>
          </div>
          <button
            onClick={() => setLevelUpBanner(null)}
            className="text-xs text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Progress bar */}
      <div className="mb-8 p-4 rounded-lg bg-card border border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${LEVEL_COLORS[currentLevel]}`}>
              {LEVEL_LABELS[currentLevel]}
            </span>
            <span className="text-sm text-muted-foreground">
              {completedCount} / {totalNodes} nodes completed
            </span>
          </div>
          <span className="text-sm font-medium">{Math.round(progressPercent)}%</span>
        </div>
        {user && completedCount > 0 && completedCount === totalNodes && (
          <div className="mt-3">
            <Link
              to={`/paths/${slug}/certificate/${user.username}`}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-medium hover:opacity-90"
            >
              🏆 View certificate
            </Link>
          </div>
        )}
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        {/* Level progression */}
        <div className="flex gap-1 mt-3">
          {LEVEL_ORDER.map((level) => {
            const levelNodes = nodes.filter((n) => n.level === level);
            const levelCompleted = levelNodes.filter((n) => isCompleted(n.id)).length;
            const pct = levelNodes.length > 0 ? (levelCompleted / levelNodes.length) * 100 : 0;
            return (
              <div key={level} className="flex-1">
                <div className="text-[10px] text-muted-foreground text-center mb-0.5 capitalize">{level}</div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Resume CTA + view toggle */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        {lastVisitedNodeSlug ? (
          <Link
            to={`/wiki/${
              nodes.find((n) => n.slug === lastVisitedNodeSlug)?.pageIds[0] ??
              lastVisitedNodeSlug
            }`}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary/10 text-primary text-sm font-medium hover:bg-primary/15"
          >
            ↻ Resume{" "}
            {nodes.find((n) => n.slug === lastVisitedNodeSlug)?.title ?? "where you left off"}
          </Link>
        ) : (
          <span />
        )}
        <div className="flex gap-1 p-1 rounded-md bg-muted text-xs">
          <button
            onClick={() => setView("list")}
            className={`px-3 py-1 rounded transition-colors ${
              view === "list"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            List
          </button>
          <button
            onClick={() => setView("graph")}
            className={`px-3 py-1 rounded transition-colors ${
              view === "graph"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Graph
          </button>
        </div>
      </div>

      {view === "graph" && (
        <div className="mb-8">
          <PathGraph
            nodes={nodes}
            nodeMastery={nodeMastery}
            signedIn={!!user}
            onPick={(n) => {
              if (n.hasLesson) setLessonFor(n);
              else setQuizFor(n);
            }}
          />
        </div>
      )}

      {/* Nodes by level */}
      {view === "list" && <div className="space-y-8">
        {nodesByLevel.map(({ level, label, nodes: levelNodes }) => (
          <div key={level}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${LEVEL_COLORS[level]}`}>
                {label}
              </span>
            </div>
            <div className="space-y-2">
              {levelNodes.map((node) => {
                const completed = isCompleted(node.id);
                const quizScore = quizScoreFor(node.id);
                const mastery = nodeMastery[node.id] ?? 0;
                return (
                  <div
                    key={node.id}
                    className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                      completed
                        ? "bg-primary/5 border-primary/20"
                        : "border-border hover:bg-accent/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center border-2 ${
                          completed ? "bg-primary border-primary text-primary-foreground" : "border-border"
                        }`}
                      >
                        {completed && (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium text-sm">{node.title}</h3>
                          {user && mastery > 0 && (
                            <span
                              className={`text-[10px] uppercase tracking-wider px-1.5 py-px rounded ${
                                mastery >= 70
                                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                  : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                              }`}
                            >
                              Mastery · {mastery}/100
                            </span>
                          )}
                          {completed && quizScore !== null && quizScore !== undefined && (
                            <span className="text-[10px] uppercase tracking-wider px-1.5 py-px rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                              Quiz · {Math.round(quizScore * 100)}%
                            </span>
                          )}
                          {node.estimatedMinutes && (
                            <span className="text-[10px] text-muted-foreground">
                              ~{node.estimatedMinutes}m
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1.5 mt-1">
                          {node.pageIds.map((pageSlug: string) => (
                            <Link
                              key={pageSlug}
                              to={`/wiki/${pageSlug}`}
                              className="text-xs text-primary hover:underline"
                            >
                              {pageSlug}
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
                    {user && !completed && (
                      <div className="flex items-center gap-2 shrink-0">
                        {node.hasLesson && (
                          <button
                            onClick={() => setLessonFor(node)}
                            className="px-3 py-1 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                          >
                            Start lesson
                          </button>
                        )}
                        <button
                          onClick={() => setQuizFor(node)}
                          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                            node.hasLesson
                              ? "bg-secondary hover:bg-secondary/80"
                              : "bg-primary text-primary-foreground hover:bg-primary/90"
                          }`}
                        >
                          Take quiz
                        </button>
                        <button
                          onClick={() => handleComplete(node.id)}
                          className="px-3 py-1 rounded-md text-xs font-medium bg-secondary hover:bg-secondary/80 transition-colors"
                        >
                          Mark complete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>}

      {quizFor && (
        <QuizModal
          nodeId={quizFor.id}
          nodeTitle={quizFor.title}
          onClose={() => setQuizFor(null)}
          onPassed={handleQuizPassed}
        />
      )}

      {lessonFor && (
        <LessonPlayer
          nodeId={lessonFor.id}
          nodeTitle={lessonFor.title}
          onClose={() => setLessonFor(null)}
          onCompleted={handleQuizPassed}
        />
      )}
    </div>
  );
}

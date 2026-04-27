import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, type MasteryPath, type MasteryNode, type UserNodeProgress } from "../lib/api";
import { useAuthStore } from "../stores/auth";

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

export function MasteryPathPage() {
  const { slug } = useParams<{ slug: string }>();
  const [path, setPath] = useState<MasteryPath | null>(null);
  const [nodes, setNodes] = useState<MasteryNode[]>([]);
  const [progress, setProgress] = useState<UserNodeProgress[]>([]);
  const [loading, setLoading] = useState(true);
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
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPath();
  }, [slug]);

  const isCompleted = (nodeId: string) => progress.some((p) => p.nodeId === nodeId && p.completed);

  const handleComplete = async (nodeId: string) => {
    if (!user) return;
    await api.mastery.markComplete(nodeId);
    loadPath();
  };

  const completedCount = progress.filter((p) => p.completed).length;
  const totalNodes = nodes.length;
  const progressPercent = totalNodes > 0 ? (completedCount / totalNodes) * 100 : 0;

  // Determine current level
  const currentLevel = (() => {
    if (completedCount === 0) return "apprentice";
    const lastCompleted = nodes
      .filter((n) => isCompleted(n.id))
      .sort((a, b) => b.order - a.order)[0];
    return lastCompleted?.level || "apprentice";
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

      {/* Nodes by level */}
      <div className="space-y-8">
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
                return (
                  <div
                    key={node.id}
                    className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                      completed ? "bg-primary/5 border-primary/20" : "border-border hover:bg-accent/50"
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
                        <h3 className="font-medium text-sm">{node.title}</h3>
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
                      <button
                        onClick={() => handleComplete(node.id)}
                        className="px-3 py-1 rounded-md text-xs font-medium bg-secondary hover:bg-secondary/80 transition-colors"
                      >
                        Mark complete
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

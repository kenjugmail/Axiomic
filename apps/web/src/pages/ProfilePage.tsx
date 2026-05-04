import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuthStore } from "../stores/auth";
import { api } from "../lib/api";
import type {
  AchievementCatalogEntry,
  EarnedAchievement,
  ActivityHeatmapCell,
  MasterySummaryResponse,
  PathProgressSummary,
  ReputationByDomain,
} from "@axiomic/types";
import { AchievementsGallery } from "../components/AchievementsGallery";
import { ActivityHeatmap } from "../components/ActivityHeatmap";

const LEVEL_COLORS: Record<string, string> = {
  apprentice: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  practitioner: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  specialist: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  expert: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  researcher: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

function PathProgressCard({ path }: { path: PathProgressSummary }) {
  const pct =
    path.totalNodes > 0 ? (path.completedNodes / path.totalNodes) * 100 : 0;
  const last = relativeTime(path.latestCompletionAt);
  return (
    <Link
      to={`/paths/${path.pathSlug}`}
      className="block p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium">{path.pathTitle}</h3>
        <div className="flex items-center gap-2 shrink-0">
          {path.currentLevel && (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${
                LEVEL_COLORS[path.currentLevel] ?? ""
              }`}
            >
              {path.currentLevel}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {path.completedNodes} / {path.totalNodes}
          </span>
        </div>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      {last && (
        <div className="text-[11px] text-muted-foreground mt-2">
          Last activity {last}
        </div>
      )}
    </Link>
  );
}

function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.max(0, Math.floor((now - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function ProfilePage() {
  const { username: paramUsername } = useParams<{ username?: string }>();
  const currentUser = useAuthStore((s) => s.user);
  const username = paramUsername || currentUser?.username;
  const isOwnProfile = !!currentUser && currentUser.username === username;

  const [reputation, setReputation] = useState<{
    total: number;
    domains: ReputationByDomain[];
  } | null>(null);
  const [mastery, setMastery] = useState<MasterySummaryResponse | null>(null);
  const [catalog, setCatalog] = useState<AchievementCatalogEntry[]>([]);
  const [earned, setEarned] = useState<EarnedAchievement[]>([]);
  const [streak, setStreak] = useState(0);
  const [heatmap, setHeatmap] = useState<ActivityHeatmapCell[]>([]);

  useEffect(() => {
    if (!username) return;
    api.forum
      .reputation(username)
      .then((r) => setReputation({ total: r.total, domains: r.domains }))
      .catch(() => setReputation({ total: 0, domains: [] }));
    api.mastery
      .summary(username)
      .then(setMastery)
      .catch(() => setMastery(null));
    api.achievements
      .forUser(username)
      .then((r) => {
        setEarned(r.earned);
        setStreak(r.streak);
        setHeatmap(r.heatmap);
      })
      .catch(() => {});
    api.achievements
      .catalog()
      .then((r) => setCatalog(r.achievements))
      .catch(() => {});
  }, [username]);

  if (!username) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground mb-4">
          You need to be signed in to view your profile.
        </p>
        <Link to="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </div>
    );
  }

  const display = isOwnProfile
    ? currentUser?.displayName || currentUser?.username || username
    : username;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
          {display.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{display}</h1>
          <p className="text-muted-foreground text-sm">@{username}</p>
          {isOwnProfile && currentUser?.createdAt && (
            <p className="text-muted-foreground text-xs mt-0.5">
              Joined {new Date(currentUser.createdAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <section>
          <h2 className="text-lg font-semibold mb-3">Reputation</h2>
          {reputation === null ? (
            <div className="h-16 animate-pulse bg-muted rounded-lg" />
          ) : reputation.domains.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No forum activity yet.{" "}
              <Link to="/forum" className="text-primary hover:underline">
                Browse the forum
              </Link>
              .
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-3xl font-semibold">
                  {reputation.total}
                </span>
                <span className="text-sm text-muted-foreground">total</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {reputation.domains.map((d) => (
                  <Link
                    key={d.domainSlug}
                    to={`/forum/${d.domainSlug}`}
                    className="flex items-center justify-between p-3 rounded-md border border-border hover:bg-accent/30 transition-colors"
                  >
                    <div>
                      <div className="font-medium text-sm">{d.domainTitle}</div>
                      <div className="text-xs text-muted-foreground">
                        {d.topicCount} topics · {d.postCount} replies
                      </div>
                    </div>
                    <span
                      className={`text-lg font-semibold ${
                        d.score > 0
                          ? "text-primary"
                          : d.score < 0
                            ? "text-destructive"
                            : ""
                      }`}
                    >
                      {d.score > 0 ? "+" : ""}
                      {d.score}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Activity heatmap — visible on any profile, gives even the
            public view a pulse. */}
        {heatmap.length > 0 && (
          <section>
            <ActivityHeatmap cells={heatmap} streak={streak} />
          </section>
        )}

        {/* Achievements gallery — also public. Locked rows are greyed
            out. */}
        {catalog.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Achievements</h2>
              <span className="text-xs text-muted-foreground">
                {earned.length} of {catalog.length} earned
              </span>
            </div>
            <AchievementsGallery catalog={catalog} earned={earned} />
          </section>
        )}

        {isOwnProfile && (
          <>
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Learning Progress</h2>
                {mastery && mastery.totalCompleted > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {mastery.totalCompleted} nodes completed
                    {mastery.highestLevel && (
                      <> · highest: <span className="capitalize">{mastery.highestLevel}</span></>
                    )}
                  </span>
                )}
              </div>
              {!mastery ? (
                <div className="h-24 animate-pulse bg-muted rounded-lg" />
              ) : mastery.paths.length === 0 ? (
                <p className="text-sm text-muted-foreground">No paths available.</p>
              ) : (
                <div className="space-y-3">
                  {mastery.paths.map((p) => (
                    <PathProgressCard key={p.pathSlug} path={p} />
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">Account</h2>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Email</span>
                  <span>{currentUser?.email}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Username</span>
                  <span>@{currentUser?.username}</span>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

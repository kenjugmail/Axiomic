import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Flame, Trophy } from "lucide-react";
import { api } from "../lib/api";
import type { LeaderboardEntry, LeaderboardResponse } from "@axiomic/types";
import { useAuthStore } from "../stores/auth";

const RANK_STYLES: Record<number, string> = {
  1: "text-yellow-500",
  2: "text-zinc-400",
  3: "text-amber-700",
};

function Row({
  entry,
  highlight,
}: {
  entry: LeaderboardEntry;
  highlight?: boolean;
}) {
  return (
    <Link
      to={`/profile/${entry.username}`}
      className={`grid grid-cols-[60px_1fr_auto_auto] items-center gap-3 px-4 py-2 rounded-md hover:bg-accent/30 transition-colors ${
        highlight ? "bg-primary/5 border border-primary/20" : ""
      }`}
    >
      <div
        className={`text-lg font-bold tabular-nums ${
          RANK_STYLES[entry.rank] ?? "text-muted-foreground"
        }`}
      >
        #{entry.rank}
      </div>
      <div className="min-w-0">
        <div className="font-medium truncate">
          {entry.displayName || entry.username}
        </div>
        <div className="text-xs text-muted-foreground">@{entry.username}</div>
      </div>
      <div className="text-right text-xs text-muted-foreground tabular-nums hidden sm:flex items-center justify-end gap-2">
        <span className="inline-flex items-center gap-1">
          <Trophy className="w-3 h-3" strokeWidth={2} />
          {entry.achievements}
        </span>
        {entry.streak > 0 && (
          <span className="inline-flex items-center gap-1">
            <Flame className="w-3 h-3" strokeWidth={2} />
            {entry.streak}
          </span>
        )}
      </div>
      <div className="text-right font-semibold tabular-nums">
        {entry.totalPoints.toLocaleString()}{" "}
        <span className="text-xs text-muted-foreground font-normal">pts</span>
      </div>
    </Link>
  );
}

export function LeaderboardPage() {
  const me = useAuthStore((s) => s.user);
  const [data, setData] = useState<LeaderboardResponse | null>(null);

  useEffect(() => {
    api.gamification
      .leaderboard()
      .then(setData)
      .catch(() => setData({ entries: [], me: null }));
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-1">Leaderboard</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Points = 10 per achievement + 3 per node completed + 1 per activity.
      </p>

      {data === null ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 animate-pulse bg-muted rounded-md" />
          ))}
        </div>
      ) : data.entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No data yet.</p>
      ) : (
        <div className="space-y-1">
          {data.entries.map((e) => (
            <Row
              key={e.username}
              entry={e}
              highlight={!!me && e.username === me.username}
            />
          ))}
        </div>
      )}

      {data?.me && data.me.rank > 50 && (
        <>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mt-8 mb-2">
            Your slot
          </div>
          <Row entry={data.me} highlight />
        </>
      )}
    </div>
  );
}

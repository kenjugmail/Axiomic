// S87 — Competition standings.
//
// Ranked list of contenders with the prize cutoff visualized as a
// horizontal divider — entries above the line get the prize.

import { Link } from "react-router-dom";
import { Trophy } from "lucide-react";
import type { CompetitionStandingEntry } from "@axiomic/types";
import { PetByUsername } from "../../pet";

interface CompetitionStandingsProps {
  entries: CompetitionStandingEntry[];
  prizeCosmeticEmoji: string | null;
  prizeWinnerCount: number;
  currentUserId: string | null;
}

export function CompetitionStandings({
  entries,
  prizeCosmeticEmoji,
  prizeWinnerCount,
  currentUserId,
}: CompetitionStandingsProps) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No XP earned in this competition window yet.
      </p>
    );
  }

  return (
    <ol className="space-y-1">
      {entries.map((e, i) => {
        const isMe = e.userId === currentUserId;
        const isCutoff = i === prizeWinnerCount && i > 0;
        return (
          <li key={e.userId}>
            {isCutoff && (
              <div className="flex items-center gap-2 my-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  prize cutoff
                </span>
                <hr className="flex-1 border-dashed border-border" />
              </div>
            )}
            <div
              className={`flex items-center gap-3 p-2 rounded-md ${
                isMe ? "bg-primary/5 border border-primary" : ""
              }`}
            >
              <span className="font-mono text-sm tabular-nums text-muted-foreground w-8 text-right">
                #{e.rank}
              </span>
              {e.username ? (
                <PetByUsername username={e.username} size="xs" />
              ) : null}
              <div className="flex-1 min-w-0">
                {e.username ? (
                  <Link to={`/u/${e.username}`} className="text-sm font-medium hover:underline">
                    {e.displayName || e.username}
                  </Link>
                ) : (
                  <span className="text-sm text-muted-foreground">unknown</span>
                )}
                {isMe && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-primary">you</span>
                )}
              </div>
              <div className="text-sm tabular-nums font-semibold">{e.score} XP</div>
              {e.isWinner && prizeCosmeticEmoji && (
                <span title="Prize winner" className="text-base">
                  {prizeCosmeticEmoji}
                </span>
              )}
              {e.rank === 1 && <Trophy className="w-4 h-4 text-amber-500" />}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

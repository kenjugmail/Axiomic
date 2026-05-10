// S86 — Class XP leaderboard.
//
// Per-row pet preview with equipped cosmetics, XP, and an optional
// "grant cosmetic" affordance for instructors/TAs. Highlight the
// current user's row.

import { useState } from "react";
import { Trophy, Sparkles } from "lucide-react";
import type { ClassLeaderboardEntry, ClassRole } from "@axiomic/types";
import { PetView } from "../pet/PetView";
import { GrantCosmeticDialog } from "../pet/GrantCosmeticDialog";

const SPECIES_EMOJI: Record<string, string> = {
  cat: "🐱",
  dog: "🐶",
  rabbit: "🐰",
  fox: "🦊",
  turtle: "🐢",
  dragon: "🐉",
  owl: "🦉",
  penguin: "🐧",
};

interface LeaderboardProps {
  classSlug: string;
  entries: ClassLeaderboardEntry[];
  currentUserId: string | null;
  myRole: ClassRole;
  onGranted?: () => void;
}

export function Leaderboard({
  classSlug,
  entries,
  currentUserId,
  myRole,
  onGranted,
}: LeaderboardProps) {
  const [grantTo, setGrantTo] = useState<ClassLeaderboardEntry | null>(null);
  const canGrant = myRole === "instructor" || myRole === "ta";

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No XP earned yet. Once students complete readings or homework, the
        leaderboard fills in here.
      </p>
    );
  }

  return (
    <div>
      <ol className="space-y-2">
        {entries.map((e, i) => {
          const isMe = e.userId === currentUserId;
          const speciesEmoji = e.pet ? SPECIES_EMOJI[e.pet.species] ?? "🥚" : "🥚";
          return (
            <li
              key={e.userId}
              className={`flex items-center gap-3 p-3 rounded-md border ${
                isMe ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <span className="font-mono text-sm tabular-nums text-muted-foreground w-8 text-right">
                #{i + 1}
              </span>
              <div className="w-14 shrink-0 flex items-center justify-center">
                {e.pet ? (
                  <PetView
                    speciesEmoji={speciesEmoji}
                    equipped={e.pet.equipped}
                    size="sm"
                  />
                ) : (
                  <span className="text-2xl text-muted-foreground">🥚</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">
                    {e.displayName || e.username}
                  </span>
                  {e.role !== "student" && (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {e.role}
                    </span>
                  )}
                  {isMe && (
                    <span className="text-[10px] uppercase tracking-wider text-primary">you</span>
                  )}
                </div>
                {e.pet && e.pet.name && (
                  <div className="text-xs text-muted-foreground truncate">
                    pet: {e.pet.name}
                  </div>
                )}
              </div>
              <div className="text-sm font-semibold tabular-nums inline-flex items-center gap-1">
                {i === 0 && <Trophy className="w-4 h-4 text-amber-500" />}
                {e.xp} XP
              </div>
              {canGrant && !isMe && (
                <button
                  type="button"
                  onClick={() => setGrantTo(e)}
                  className="text-xs px-2 py-1 rounded-md border border-border hover:bg-accent/40 inline-flex items-center gap-1"
                  title="Grant a cosmetic"
                >
                  <Sparkles className="w-3 h-3" />
                  Grant
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {grantTo && (
        <GrantCosmeticDialog
          classSlug={classSlug}
          recipient={{
            userId: grantTo.userId,
            username: grantTo.username,
            displayName: grantTo.displayName,
          }}
          onClose={() => setGrantTo(null)}
          onGranted={onGranted}
        />
      )}
    </div>
  );
}

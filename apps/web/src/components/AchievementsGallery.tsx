import { Lock } from "lucide-react";
import type {
  AchievementCatalogEntry,
  EarnedAchievement,
} from "@axiomic/types";

interface Props {
  catalog: AchievementCatalogEntry[];
  earned: EarnedAchievement[];
}

// Achievement gallery. Earned achievements are full-color; locked ones
// are greyed out with a subtle padlock so the user knows what's possible.
export function AchievementsGallery({ catalog, earned }: Props) {
  const earnedBySlug = new Map(earned.map((a) => [a.slug, a]));

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {catalog.map((a) => {
        const got = earnedBySlug.get(a.slug);
        const locked = !got;
        return (
          <div
            key={a.slug}
            className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
              locked
                ? "border-border/50 bg-muted/20 opacity-60"
                : "border-emerald-500/30 bg-emerald-500/5"
            }`}
            title={
              got
                ? `Earned ${new Date(got.awardedAt).toLocaleDateString()}`
                : "Locked"
            }
          >
            <div className="shrink-0 w-9 h-9 rounded-md flex items-center justify-center text-xl grayscale-[0.3]">
              {locked ? (
                <Lock className="w-4 h-4 text-muted-foreground" strokeWidth={2} />
              ) : (
                a.icon
              )}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{a.title}</div>
              <div className="text-xs text-muted-foreground line-clamp-2">
                {a.description}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

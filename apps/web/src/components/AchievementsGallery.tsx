import { Lock, Sparkles } from "lucide-react";
import type {
  AchievementCatalogEntry,
  EarnedAchievement,
} from "@axiomic/types";

interface Props {
  catalog: AchievementCatalogEntry[];
  earned: EarnedAchievement[];
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function relativeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return "today";
  if (diff < 2 * day) return "yesterday";
  if (diff < 30 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Achievement gallery. Earned achievements are full-color; locked ones
// are greyed out with a subtle padlock so the user knows what's possible.
// Recently-earned (last 7 days) entries get a small "new" sparkles
// badge and a soft pulse so the user can spot fresh wins at a glance.
export function AchievementsGallery({ catalog, earned }: Props) {
  const earnedBySlug = new Map(earned.map((a) => [a.slug, a]));

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {catalog.map((a) => {
        const got = earnedBySlug.get(a.slug);
        const locked = !got;
        const isFresh =
          !!got && Date.now() - new Date(got.awardedAt).getTime() < SEVEN_DAYS_MS;
        return (
          <div
            key={a.slug}
            className={`relative flex items-start gap-3 p-3 rounded-lg border transition-colors duration-fast ${
              locked
                ? "border-border/50 bg-muted/20 opacity-60"
                : isFresh
                  ? "border-accent-emerald/40 bg-accent-emerald/10 ring-1 ring-accent-emerald/30"
                  : "border-emerald-500/30 bg-emerald-500/5"
            }`}
            title={got ? `Earned ${relativeAgo(got.awardedAt)}` : "Locked"}
          >
            {isFresh && (
              <span className="absolute -top-1.5 -right-1.5 inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-accent-emerald text-background animate-pulse-once">
                <Sparkles className="w-2.5 h-2.5" strokeWidth={2.5} />
                New
              </span>
            )}
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
              {got && (
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Earned {relativeAgo(got.awardedAt)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

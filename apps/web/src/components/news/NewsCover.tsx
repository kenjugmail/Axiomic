import type { NewsAccentColor } from "@axiomic/types";

export const ACCENT_GRADIENT: Record<NewsAccentColor, string> = {
  indigo: "from-indigo-500/30 via-indigo-400/10 to-transparent",
  emerald: "from-emerald-500/30 via-emerald-400/10 to-transparent",
  rose: "from-rose-500/30 via-rose-400/10 to-transparent",
  amber: "from-amber-500/30 via-amber-400/10 to-transparent",
  sky: "from-sky-500/30 via-sky-400/10 to-transparent",
  violet: "from-violet-500/30 via-violet-400/10 to-transparent",
};

export const ACCENT_RING: Record<NewsAccentColor, string> = {
  indigo: "ring-indigo-500/30",
  emerald: "ring-emerald-500/30",
  rose: "ring-rose-500/30",
  amber: "ring-amber-500/30",
  sky: "ring-sky-500/30",
  violet: "ring-violet-500/30",
};

interface CoverProps {
  emoji: string;
  accent: NewsAccentColor;
  size?: "sm" | "md" | "lg";
}

// Gradient cover banner with a centered emoji. Three sizes: sm for the
// list card, md for the editor preview, lg for the article hero.
export function NewsCover({ emoji, accent, size = "md" }: CoverProps) {
  const heightClass = size === "sm" ? "h-24" : size === "md" ? "h-36" : "h-56";
  const emojiSize = size === "sm" ? "text-4xl" : size === "md" ? "text-5xl" : "text-7xl";
  return (
    <div
      className={`relative w-full ${heightClass} bg-gradient-to-br ${ACCENT_GRADIENT[accent]} flex items-center justify-center overflow-hidden`}
    >
      {/* Decorative blur circles for visual interest. */}
      <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -bottom-12 -right-8 w-48 h-48 rounded-full bg-white/5 blur-3xl" />
      <span className={`${emojiSize} drop-shadow-sm select-none relative`}>
        {emoji}
      </span>
    </div>
  );
}

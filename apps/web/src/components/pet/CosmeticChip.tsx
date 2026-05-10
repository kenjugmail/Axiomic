// S86 — Catalog list item for a cosmetic.
// Used in the inventory grid + grant-cosmetic dialog.

import type { CosmeticRarity, CosmeticSlot } from "@axiomic/types";

const RARITY_BORDER: Record<CosmeticRarity, string> = {
  common: "border-border",
  rare: "border-sky-500/50",
  epic: "border-violet-500/60",
  legendary: "border-amber-500/70",
};

const RARITY_BADGE: Record<CosmeticRarity, string> = {
  common: "text-muted-foreground",
  rare: "text-sky-600 dark:text-sky-400",
  epic: "text-violet-600 dark:text-violet-400",
  legendary: "text-amber-600 dark:text-amber-400",
};

interface CosmeticChipProps {
  slug: string;
  name: string;
  emoji: string | null;
  slot: CosmeticSlot;
  rarity: CosmeticRarity;
  description?: string;
  equipped?: boolean;
  onClick?: () => void;
  selected?: boolean;
}

export function CosmeticChip({
  name,
  emoji,
  slot,
  rarity,
  description,
  equipped,
  onClick,
  selected,
}: CosmeticChipProps) {
  const border = RARITY_BORDER[rarity] ?? RARITY_BORDER.common;
  const badge = RARITY_BADGE[rarity] ?? RARITY_BADGE.common;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative text-left p-3 rounded-md border transition-colors ${border} ${
        selected
          ? "ring-2 ring-primary"
          : onClick
            ? "hover:bg-accent/40 cursor-pointer"
            : ""
      } ${equipped ? "bg-emerald-500/5" : "bg-background"}`}
    >
      <div className="flex items-start gap-3">
        <div className="text-2xl leading-none">{emoji ?? "❓"}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{name}</span>
            <span className={`text-[10px] uppercase tracking-wider ${badge}`}>
              {rarity}
            </span>
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {slot}
            {equipped && <span className="ml-1.5 text-emerald-600">· equipped</span>}
          </div>
          {description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {description}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

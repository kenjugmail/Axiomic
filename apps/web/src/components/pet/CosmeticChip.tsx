// S86 — Catalog list item for a cosmetic.
// Used in the inventory grid + grant-cosmetic dialog.
//
// Phase L — rarity colors switched to the --r-* CSS tokens (also
// used by PetAvatar's ring). Cosmetics with emoji=null (the new
// renderKind=svg additions) render an initial-disc fallback in the
// rarity color, identical to PetAvatar's CosmeticOverlay fallback.

import type { CosmeticRarity, CosmeticSlot } from "@axiomic/types";

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
  slug,
  name,
  emoji,
  slot,
  rarity,
  description,
  equipped,
  onClick,
  selected,
}: CosmeticChipProps) {
  const initial = (slug || "?").charAt(0).toUpperCase();

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative text-left p-3 rounded-md border transition-colors ${
        selected
          ? "ring-2 ring-primary"
          : onClick
            ? "hover:bg-accent/40 cursor-pointer"
            : ""
      } ${equipped ? "bg-emerald-500/5" : "bg-background"}`}
      style={{ borderColor: `var(--r-${rarity})` }}
    >
      <div className="flex items-start gap-3">
        {emoji ? (
          <div className="text-2xl leading-none">{emoji}</div>
        ) : (
          // Phase L — emoji=null fallback. Matches PetAvatar's
          // CosmeticOverlay so the catalog + the avatar agree.
          <div
            className={`cos-overlay-fallback rar-${rarity}`}
            style={{ width: 28, height: 28, fontSize: 16 }}
          >
            {initial}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{name}</span>
            <span
              className="text-[10px] uppercase tracking-wider"
              style={{ color: `var(--r-${rarity})` }}
            >
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

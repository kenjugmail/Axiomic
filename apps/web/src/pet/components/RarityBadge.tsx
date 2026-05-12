// Phase M — RarityBadge.
//
// "Rarity is shape + label + hue, not hue alone." (Claude Design)
// Each rarity tier renders with a visually distinct SHAPE so colorblind
// users can still tell them apart:
//
//   - common:    rounded square (border-radius 4px), sans-serif uppercase
//   - rare:      pill (border-radius 999px)
//   - epic:      double-border, rectangular
//   - legendary: dashed-border italic display-font lowercase
//
// Glyphs are plain Unicode lozenges (diamond / star). They are NOT
// emoji — these are text characters used since the dawn of typography.
// The user's "no emoji" rule allows them.

import type { Rarity } from "./CosmeticGlyphSVG";

const RARITY_GLYPH: Record<Rarity, string> = {
  common: "◆",     // ◆ filled diamond (small)
  rare: "◆",       // ◆ filled diamond (in a pill)
  epic: "⧗",       // ⧗ alternative; use ⬥ via codepoint
  legendary: "★",  // ★ filled star
};
// Note: ⧗ isn't ⬥; the design spec uses ⬥ (U+2B25 — BLACK MEDIUM
// LOZENGE). Some fonts render U+2B25 inconsistently — fall back to ◆.
RARITY_GLYPH.epic = "⬥";

const RARITY_LABEL: Record<Rarity, string> = {
  common: "common",
  rare: "rare",
  epic: "epic",
  legendary: "legendary",
};

export interface RarityBadgeProps {
  rarity: Rarity;
  compact?: boolean;
  className?: string;
}

export function RarityBadge({
  rarity,
  compact = false,
  className,
}: RarityBadgeProps): JSX.Element {
  const label = RARITY_LABEL[rarity];
  const glyph = RARITY_GLYPH[rarity];
  return (
    <span
      className={`rar ${rarity}${className ? ` ${className}` : ""}`}
      aria-label={`Rarity: ${label}`}
    >
      <span className="glyph" aria-hidden="true">
        {glyph}
      </span>
      {!compact && <span>{label}</span>}
    </span>
  );
}

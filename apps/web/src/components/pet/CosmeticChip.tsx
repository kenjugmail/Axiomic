// Phase M — CosmeticChip / cos-tile.
//
// Replaces Phase L's flat chip with the design's full .cos-tile spec:
//   - aspect-ratio 1:1.15
//   - rarity radial tile-tint via the .common/.rare/.epic/.legendary class
//   - legendary foil-spin animation when owned
//   - equip-pop animation on the glyph when equipped
//   - .unowned state: grayscale + opacity drop
//   - rarity glyph at top-right corner
//   - RarityBadge + ObtainabilityCallout in the tile's metadata strip
//   - CosmeticGlyphSVG renders the actual cosmetic art

import type { CosmeticRarity, CosmeticSlot } from "@axiomic/types";
import { CosmeticGlyphSVG } from "./CosmeticGlyphSVG";
import { RarityBadge } from "./RarityBadge";
import { ObtainabilityCallout, type Obtain } from "./ObtainabilityCallout";

const RARITY_GLYPH: Record<CosmeticRarity, string> = {
  common: "◆",
  rare: "◆",
  epic: "⬥",
  legendary: "★",
};

interface CosmeticChipProps {
  slug: string;
  name: string;
  slot: CosmeticSlot;
  rarity: CosmeticRarity;
  description?: string;
  equipped?: boolean;
  owned?: boolean;
  // Distinct from `equipped` — "currently selected in a picker" (e.g.
  // when choosing a prize cosmetic for a competition, or a grant target).
  // Renders a ring around the tile.
  selected?: boolean;
  onClick?: () => void;
  // When the tile is unowned in someone else's gallery, surface how to
  // obtain it. The viewer-is-owner case omits the callout (it's already
  // known what they earned).
  obtain?: Obtain;
  obtainCost?: number | null;
}

export function CosmeticChip({
  slug,
  name,
  slot,
  rarity,
  description,
  equipped,
  owned = true,
  selected,
  onClick,
  obtain,
  obtainCost,
}: CosmeticChipProps) {
  const classes = [
    "cos-tile",
    rarity,
    owned ? "owned" : "unowned",
    equipped ? "equipped" : "",
    selected ? "selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      onClick={onClick}
      className={classes}
      title={description || name}
      aria-pressed={!!equipped}
    >
      <span className="corner" aria-hidden="true">
        {RARITY_GLYPH[rarity]}
      </span>
      <span className="glyph">
        <CosmeticGlyphSVG
          slug={slug}
          rarity={rarity}
          size={48}
          tone={owned ? "full" : "muted"}
        />
      </span>
      <span className="nm" title={name}>
        {name}
      </span>
      {/* Metadata strip — rarity + (when unowned + obtainable) callout.
          Phase 9C — slot label removed; the InventoryPage groups tiles
          by slot via a section header instead, matching the prototype's
          CosmeticTile (components.jsx:119-166) which never showed slot. */}
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          marginTop: 2,
          width: "100%",
          flexWrap: "wrap",
        }}
      >
        <RarityBadge rarity={rarity} compact />
        {!owned && obtain && obtain !== "default" && (
          <ObtainabilityCallout obtain={obtain} cost={obtainCost ?? null} />
        )}
      </span>
    </button>
  );
}

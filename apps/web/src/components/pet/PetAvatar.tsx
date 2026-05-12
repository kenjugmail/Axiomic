// Phase L — PetAvatar.
//
// Replaces the older PetView. Same emoji-based pet rendering, but
// the component shape now matches the design-system spec:
//   - numeric `size` prop (px), not a t-shirt size string
//   - slug-keyed `equipped` object, not a slot array
//   - optional `skin` FX layer (gradient bg + particles + glow filter
//     + animated overlay + rarity ring)
//   - optional `ring` rarity (renders an inset border via CSS token)
//   - optional `hero` flag (slightly thicker ring + larger level badge)
//
// Per the Phase L plan, the *inside* still renders the species emoji
// (passed as `speciesEmoji`, resolved server-side). When real per-
// species SVG silhouettes ship, this component's render block is the
// only thing that changes; call sites stay stable.
//
// Cosmetics:
//   - When a cosmetic has an `emoji`, we render the unicode glyph at
//     its slot position (head / eyes / accessory).
//   - When `emoji` is null (all Phase L additions seed with
//     `renderKind=svg, emoji=null`), we render a rarity-tinted disc
//     with the cosmetic's first-letter initial. Drop-in replacement
//     until a real SVG glyph registry lands.
//   - Auto-hide below 36px regardless — the avatar becomes illegible.

import type { CSSProperties } from "react";

export type PetSkinFx = {
  filter: string | null;
  opacity: number;
  glow: { color: string; blur: number; alpha: number } | null;
  bg: string | null;
  particles: "stars" | "embers" | "petals" | "snow" | null;
  ring: string | null;
  animated: "aurora" | "crystal" | null;
};

export interface PetAvatarCosmetic {
  slug: string;
  emoji: string | null;
  rarity?: "common" | "rare" | "epic" | "legendary";
}

export interface PetAvatarProps {
  // Species slug, used for the aria label. Not used to resolve the
  // emoji — that's passed in pre-resolved via `speciesEmoji` so this
  // component never has to know the species catalog.
  species: string;
  // The level-aware emoji glyph (server returns this in MyPetResponse
  // and /users/:username/pet-display as either `speciesEmoji` or
  // `levelEmoji`). Falls back to the egg if absent.
  speciesEmoji?: string;
  level: number;
  equipped?: {
    head?: PetAvatarCosmetic | null;
    eyes?: PetAvatarCosmetic | null;
    acc?: PetAvatarCosmetic | null;
  };
  skin?: PetSkinFx | null;
  size?: number;
  ring?: false | "common" | "rare" | "epic" | "legendary";
  showCosmetics?: boolean;
  hero?: boolean;
  ariaLabel?: string;
}

// Slot positioning is preserved from PetView so visual fidelity at
// existing sizes is identical. Tuned for system-emoji bounding boxes.
const SLOT_STYLE: Record<"head" | "eyes" | "acc", CSSProperties> = {
  head: { top: "-22%", left: "50%", transform: "translateX(-50%) rotate(-8deg)" },
  eyes: { top: "12%", left: "50%", transform: "translateX(-50%)" },
  acc: { bottom: "-8%", right: "-10%" },
};

const COSMETIC_SCALE = 0.55;
// Below this size the cosmetic overlays cease to read; hide for
// legibility. Matches the design's `failSmall` UX intent without
// per-cosmetic metadata.
const COSMETIC_HIDE_BELOW_PX = 36;

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function CosmeticOverlay({
  cos,
  fontSize,
}: {
  cos: PetAvatarCosmetic;
  fontSize: number;
}) {
  if (cos.emoji) {
    return <span style={{ fontSize, lineHeight: 1 }}>{cos.emoji}</span>;
  }
  // Fallback for emoji=null (renderKind=svg) cosmetics. First-letter
  // initial in a rarity-tinted disc. The disc fills the overlay span;
  // initial is sized off the parent font-size.
  const initial = (cos.slug || "?").charAt(0).toUpperCase();
  const rarity = cos.rarity ?? "common";
  return (
    <span
      className={`cos-overlay-fallback rar-${rarity}`}
      style={{
        width: fontSize,
        height: fontSize,
        fontSize: Math.round(fontSize * 0.6),
      }}
    >
      {initial}
    </span>
  );
}

function SkinFX({ fx }: { fx: PetSkinFx }) {
  return (
    <>
      {fx.bg && <div className="pet-skin-bg" style={{ backgroundImage: fx.bg }} />}
      {fx.particles && (
        <div className={`pet-particles ${fx.particles}`} aria-hidden="true" />
      )}
      {fx.animated === "aurora" && <div className="pet-anim-aurora" aria-hidden="true" />}
      {fx.animated === "crystal" && <div className="pet-anim-crystal" aria-hidden="true" />}
    </>
  );
}

export function PetAvatar({
  species,
  speciesEmoji,
  level,
  equipped,
  skin,
  size = 96,
  ring = false,
  showCosmetics = true,
  hero = false,
  ariaLabel,
}: PetAvatarProps) {
  const px = size;
  const petSize = Math.round(px * 0.78);
  const cosmeticSize = Math.round(px * COSMETIC_SCALE);
  const cosmeticsVisible = showCosmetics && px >= COSMETIC_HIDE_BELOW_PX;

  // Resolve the species glyph. Egg is the safe fallback — same as the
  // server-side helper. Caller almost always passes this in.
  const glyph = speciesEmoji ?? "🥚";

  const ringClass = ring ? `ring-${ring}` : "";
  const heroClass = hero ? "hero" : "";
  const stageClass = `pet-stage ${ringClass} ${heroClass}`.trim();

  // Skin filter + glow are inline because they're per-skin and
  // computed (glow needs hex-to-rgba). Keep them on the inner .pet
  // so the rarity ring (on .pet-stage) doesn't inherit the blur.
  const petStyle: CSSProperties = {
    width: petSize,
    height: petSize,
    fontSize: petSize,
    lineHeight: 1,
    opacity: skin?.opacity ?? 1,
  };
  if (skin) {
    const parts: string[] = [];
    if (skin.filter) parts.push(skin.filter);
    if (skin.glow) {
      parts.push(
        `drop-shadow(0 0 ${skin.glow.blur * 0.5}px ${hexToRgba(skin.glow.color, Math.min(1, skin.glow.alpha + 0.1))})`,
      );
    }
    if (parts.length) petStyle.filter = parts.join(" ");
  }

  const showLevelBadge = level >= 1 && (hero || px >= 56);

  // Selectively pick which equipped slots to render. We intentionally
  // drop the 'eyes' slot from the overlay layer — the existing PetView
  // also skipped eyes (kept for hatching/level animations). Matches
  // the design's `equipped.eyes` (currently unused on the overlay).
  const items = cosmeticsVisible
    ? (["head", "acc"] as const)
        .map((slot) => {
          const c = equipped?.[slot] ?? null;
          return c ? { slot, cos: c } : null;
        })
        .filter((x): x is { slot: "head" | "acc"; cos: PetAvatarCosmetic } => !!x)
    : [];

  return (
    <div
      role="img"
      aria-label={ariaLabel ?? `${species} pet, level ${level}`}
      className={stageClass}
      style={{ width: px, height: px, fontSize: px }}
    >
      {skin && (
        <div className="pet-skin-layer">
          <SkinFX fx={skin} />
        </div>
      )}
      <div className="pet" style={petStyle}>
        <span className="pet-emoji">{glyph}</span>
      </div>
      {items.map(({ slot, cos }) => (
        <span
          key={slot}
          className="cos-overlay"
          title={cos.slug}
          style={{
            ...SLOT_STYLE[slot],
            width: cosmeticSize,
            height: cosmeticSize,
            fontSize: cosmeticSize,
          }}
        >
          <CosmeticOverlay cos={cos} fontSize={cosmeticSize} />
        </span>
      ))}
      {showLevelBadge && (
        <span className="pet-level-badge" title={`Level ${level}`}>
          Lv{level}
        </span>
      )}
    </div>
  );
}

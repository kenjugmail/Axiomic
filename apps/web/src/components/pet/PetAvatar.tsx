// Phase M — PetAvatar.
//
// SVG-only renderer. The visual stack from outside in:
//
//   1. .pet-stage  — design-token framed root. Gets rarity-ring class,
//      data-mood, data-action, data-skin-fx, data-skin-trans attrs.
//      Sets stage size from `size` prop. Idle animations (breathe, blink,
//      ear-twitch) and action animations (hop/wiggle/twirl/sniff/pat)
//      are all CSS-driven from pet-tokens.css.
//   2. .pet-skin-layer (optional) — bg gradient + particles + animated.
//   3. .pet — wraps the silhouette; receives skin filter + glow.
//   4. <PetSilhouetteSVG /> — the actual pet art (or egg pre-hatch).
//   5. .cos-overlay × N — slot-positioned <CosmeticGlyphSVG /> overlays.
//   6. .pet-level-badge — small accent pill at bottom-left.
//   7. .pet-emotes — floating heart/sparkle when an action is firing.
//
// No emojis anywhere. `speciesEmoji` prop is gone — silhouette resolves
// the species slug internally, falling back to an SVG egg.

import { Heart, Sparkles } from "lucide-react";
import type { CSSProperties } from "react";
import { PetSilhouetteSVG, type PetMood } from "./PetSilhouetteSVG";
import { CosmeticGlyphSVG, type Rarity } from "./CosmeticGlyphSVG";

export type PetSkinFx = {
  filter: string | null;
  opacity: number;
  glow: { color: string; blur: number; alpha: number } | null;
  bg: string | null;
  particles: "stars" | "embers" | "petals" | "snow" | null;
  ring: string | null;
  animated: "aurora" | "crystal" | null;
};

export type PetAction = "hop" | "wiggle" | "twirl" | "sniff" | "pat";

export interface PetAvatarCosmetic {
  slug: string;
  rarity?: Rarity;
  // Optional per-cosmetic small-size fallback flag. When true, the
  // overlay hides between 24-36px even though showCosmetics is true.
  // Without the flag, default behavior is to hide at <24px only.
  failSmall?: boolean;
}

export interface PetAvatarProps {
  // Species slug. Silhouette renders the egg when undefined / unknown.
  species?: string;
  level?: number;
  equipped?: {
    head?: PetAvatarCosmetic | null;
    eyes?: PetAvatarCosmetic | null;
    acc?: PetAvatarCosmetic | null;
  };
  skin?: PetSkinFx | null;
  size?: number;
  ring?: false | Rarity;
  showCosmetics?: boolean;
  hero?: boolean;
  // Mood drives subtle changes to the silhouette mouth + stage breathe
  // rate via CSS data-mood attr.
  mood?: PetMood;
  // Action fires a one-shot animation on the stage. null/undefined = idle.
  action?: PetAction | null;
  // Triggers the pulsing about-to-evolve glow.
  aboutToEvolve?: boolean;
  // Triggers a one-shot radial burst when set true. Parent should
  // flip to false after ~900ms (the keyframe duration) to allow a
  // re-fire on the next pet_hatched event.
  hatchBurst?: boolean;
  ariaLabel?: string;
  className?: string;
}

// Slot positioning is preserved from PetView so visual fidelity at
// existing sizes is identical. Tuned for the SVG silhouette bounding box.
const SLOT_STYLE: Record<"head" | "eyes" | "acc", CSSProperties> = {
  head: {
    top: "-18%",
    left: "50%",
    transform: "translateX(-50%) rotate(-6deg)",
  },
  eyes: {
    top: "30%",
    left: "50%",
    transform: "translateX(-50%)",
  },
  acc: {
    bottom: "-4%",
    right: "-6%",
  },
};

const COSMETIC_SCALE = 0.42;
// Below 24px, every cosmetic is too small to read; hide all.
const COSMETIC_MIN_PX = 24;
// Between 24 and 36px, only cosmetics flagged failSmall=true hide.
const COSMETIC_FAILSMALL_BREAKPOINT_PX = 36;

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
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

// Floating-emote overlay. The pet-emotes element is animated by
// pet-tokens.css whenever data-action is set on the stage.
function PetEmote({ action }: { action: PetAction | null | undefined }) {
  if (!action) return null;
  const iconSize = 18;
  // Heart for pat, sparkle for hop/wiggle/twirl/sniff (default play).
  if (action === "pat") {
    return (
      <div className="pet-emotes" aria-hidden="true">
        <Heart size={iconSize} fill="currentColor" />
      </div>
    );
  }
  return (
    <div className="pet-emotes" aria-hidden="true">
      <Sparkles size={iconSize} />
    </div>
  );
}

export function PetAvatar({
  species,
  level = 1,
  equipped,
  skin,
  size = 96,
  ring = false,
  showCosmetics = true,
  hero = false,
  mood = "calm",
  action = null,
  aboutToEvolve = false,
  hatchBurst = false,
  ariaLabel,
  className,
}: PetAvatarProps): JSX.Element {
  const px = size;
  const petSize = Math.round(px * 0.82);
  const cosmeticSize = Math.round(px * COSMETIC_SCALE);

  // Cosmetic visibility tiering.
  const tooSmallForAny = px < COSMETIC_MIN_PX;
  const inFailSmallRange = px < COSMETIC_FAILSMALL_BREAKPOINT_PX;

  const ringClass = ring ? `ring-${ring}` : "";
  const heroClass = hero ? "hero" : "";
  const evolveClass = aboutToEvolve ? "about-to-evolve" : "";
  const hatchClass = hatchBurst ? "hatch-burst" : "";
  const stageClass = `pet-stage ${ringClass} ${heroClass} ${evolveClass} ${hatchClass} ${className ?? ""}`
    .replace(/\s+/g, " ")
    .trim();

  // Skin FX intersection with rarity ring is dampened by the stage's
  // data-skin-fx attr; the CSS handles tone-down so we don't have to.
  const hasSkinFx = !!(skin && (skin.particles || skin.animated));
  const skinTrans = !!(skin && skin.opacity < 0.8);

  // Skin filter + glow are inline because they're per-skin and computed
  // (glow needs hex-to-rgba). Keep them on the inner .pet so the rarity
  // ring (on .pet-stage) doesn't inherit the blur.
  const petStyle: CSSProperties = {
    width: petSize,
    height: petSize,
    opacity: skin?.opacity ?? 1,
  };
  if (skin) {
    const parts: string[] = [];
    if (skin.filter) parts.push(skin.filter);
    if (skin.glow) {
      parts.push(
        `drop-shadow(0 0 ${skin.glow.blur * 0.5}px ${hexToRgba(
          skin.glow.color,
          Math.min(1, skin.glow.alpha + 0.1),
        )})`,
      );
    }
    if (parts.length) petStyle.filter = parts.join(" ");
  }

  const showLevelBadge = level >= 1 && (hero || px >= 56);

  // Selectively pick which equipped slots to render. We intentionally
  // drop the 'eyes' slot from the overlay layer — the legacy PetView
  // also skipped eyes and the eye-cosmetic SVGs need different anchor
  // logic per species (future work). Matches the design's behavior of
  // not rendering eye glyphs on the avatar at the current scale.
  const items: Array<{ slot: "head" | "acc"; cos: PetAvatarCosmetic }> = [];
  if (showCosmetics && !tooSmallForAny) {
    const head = equipped?.head ?? null;
    const acc = equipped?.acc ?? null;
    const shouldHide = (c: PetAvatarCosmetic) =>
      inFailSmallRange && c.failSmall === true;
    if (head && !shouldHide(head)) items.push({ slot: "head", cos: head });
    if (acc && !shouldHide(acc)) items.push({ slot: "acc", cos: acc });
  }

  return (
    <div
      role="img"
      aria-label={ariaLabel ?? `${species ?? "egg"} pet, level ${level}`}
      className={stageClass}
      data-mood={mood}
      data-action={action ?? undefined}
      data-skin-fx={hasSkinFx ? "true" : undefined}
      data-skin-trans={skinTrans ? "true" : undefined}
      style={{ width: px, height: px }}
    >
      {skin && (
        <div className="pet-skin-layer">
          <SkinFX fx={skin} />
        </div>
      )}
      <div className="pet" style={petStyle}>
        <PetSilhouetteSVG species={species} level={level} mood={mood} />
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
          }}
        >
          <CosmeticGlyphSVG
            slug={cos.slug}
            rarity={cos.rarity ?? "common"}
            size={cosmeticSize}
          />
        </span>
      ))}
      {showLevelBadge && (
        <span className="pet-level-badge" title={`Level ${level}`}>
          Lv{level}
        </span>
      )}
      <PetEmote action={action} />
    </div>
  );
}

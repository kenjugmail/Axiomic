// Phase 9A (prototype parity) — CosmeticOverlay.
//
// Direct port of the prototype's CosmeticOverlay from
// cosmetics-svg.jsx:526-590 with Axiomic-slug remapping. Each
// equipped cosmetic renders as an absolutely-positioned overlay
// inside .pet-stage; per-item HEAD_OFFSET and ACC_TUNE maps tune
// the lift / dx / dy / rotation so the cap actually sits on the
// head, the mug floats to the side, etc.
//
// Sizes (verbatim from prototype):
//   head: petSize * 0.66
//   eyes: petSize * 0.50  (only fires when the parent isn't using
//                          PetSVG.EYE_STYLES — i.e. legacy species)
//   acc:  petSize * 0.46  × per-item scale multiplier
//
// Positioning:
//   head: top = -size * lift PX, left = 50%, transform translateX(-50%) rotate(-3deg)
//   eyes: top = petSize * 0.34 PX, left = 50%, transform translateX(-50%)
//   acc:  bottom = petSize*(dy/100) PX, right = petSize*(dx/100) PX, rotate(rot)

import { memo } from "react";
import { CosmeticGlyphSVG } from "./CosmeticGlyphSVG";
import { SPECIES_HEAD_ANCHOR_Y, SPECIES_ACC_DY_BOOST } from "./PetSVG";

// Baseline head-anchor (matches the cat/fox/owl/bear majority). The
// per-species offset is computed as (anchor - BASELINE) * petSize
// and added to the head `top` so the cosmetic lands on the actual
// head, not the viewBox top.
const HEAD_ANCHOR_BASELINE = 0.46;

type OverlaySlot = "head" | "eyes" | "acc";

// % of cosmetic-size to push UP above pet. Smaller = lower seat
// on head. Negative = sits BELOW the top of the head (laurel).
// Axiomic-slug keys.
const HEAD_OFFSET: Record<string, number> = {
  "study-cap": 0.06,
  "winter-beanie": 0.10,
  "grad-cap": 0.04,
  crown: 0.20,
  "paper-crown": 0.20,
  "laurel-wreath": -0.04,
  "top-hat": 0.22,
  "honor-roll-halo": 0.34,
  "lab-cap": 0.12,
  goggles: 0.12,
  wildflower: 0.0,
  "study-headphones": 0.08,
  "tiny-antlers": 0.18,
  ribbon: 0.04,
  "study-bandana": 0.06,
  "wizard-hat": 0.22,
  "golden-leaf": 0.08,
  fire: 0.18,
  "baseball-cap": 0.06,
};

// Accessory tuning: dx in % of petSize (positive = further right),
// dy = bottom offset %, rot in degrees, s = scale multiplier.
const ACC_TUNE: Record<
  string,
  { dx: number; dy: number; rot: number; s: number }
> = {
  book: { dx: -2, dy: 4, rot: 4, s: 1.0 },
  "sharp-pencil": { dx: 0, dy: 6, rot: -8, s: 0.94 },
  "office-hours-mug": { dx: -4, dy: 6, rot: 2, s: 0.92 },
  microscope: { dx: -6, dy: 2, rot: 0, s: 1.05 },
  trophy: { dx: -2, dy: 4, rot: 0, s: 1.0 },
  "diploma-scroll": { dx: -2, dy: 6, rot: -4, s: 0.95 },
  "quill-inkwell": { dx: 2, dy: 8, rot: -14, s: 1.0 },
  "brass-telescope": { dx: -2, dy: 8, rot: -10, s: 1.04 },
  "field-backpack": { dx: -2, dy: 4, rot: 0, s: 1.0 },
  "pocket-globe": { dx: -2, dy: 4, rot: 0, s: 1.0 },
  "study-lantern": { dx: 0, dy: 6, rot: -4, s: 1.0 },
  "lab-flask": { dx: -2, dy: 4, rot: 0, s: 1.0 },
  "brass-compass": { dx: -2, dy: 4, rot: 0, s: 0.98 },
  "firefly-jar": { dx: -2, dy: 4, rot: 0, s: 1.0 },
  "honor-medal": { dx: -2, dy: 4, rot: 0, s: 1.0 },
  "card-stack": { dx: -2, dy: 4, rot: 0, s: 1.0 },
  rose: { dx: -2, dy: 6, rot: 0, s: 0.9 },
  "gold-star": { dx: -2, dy: 4, rot: 0, s: 0.95 },
  trophy_default: { dx: -2, dy: 4, rot: 0, s: 1.0 },
  gem: { dx: -2, dy: 4, rot: 0, s: 0.9 },
  rocket: { dx: -2, dy: 6, rot: -14, s: 1.0 },
};

const DEFAULT_ACC = { dx: -2, dy: 4, rot: 4, s: 1 } as const;

interface CosmeticOverlayProps {
  slug: string;
  slot: OverlaySlot;
  rarity?: "common" | "rare" | "epic" | "legendary";
  petSize: number;
  // Phase 10D — drives per-species anchor adjustments (e.g. frog's
  // head sits high in the viewBox; penguin's body is tall, so acc
  // needs lifting off the floor). Unknown / undefined species fall
  // back to baseline behavior.
  species?: string;
}

// Phase 13E — memoized; all props are primitives.
function CosmeticOverlayImpl({
  slug,
  slot,
  rarity,
  petSize,
  species,
}: CosmeticOverlayProps): JSX.Element {
  const baseSz =
    slot === "head"
      ? petSize * 0.66
      : slot === "eyes"
        ? petSize * 0.5
        : petSize * 0.46;
  const accT = slot === "acc" ? (ACC_TUNE[slug] ?? DEFAULT_ACC) : null;
  const sz = Math.round(baseSz * (accT?.s ?? 1));

  // Phase 10D — per-species offsets.
  const speciesAnchor =
    species && SPECIES_HEAD_ANCHOR_Y[species] !== undefined
      ? SPECIES_HEAD_ANCHOR_Y[species]
      : HEAD_ANCHOR_BASELINE;
  const speciesHeadDeltaPx = Math.round(
    (speciesAnchor - HEAD_ANCHOR_BASELINE) * petSize,
  );
  const speciesAccDyBoost =
    species && SPECIES_ACC_DY_BOOST[species] !== undefined
      ? SPECIES_ACC_DY_BOOST[species]
      : 0;

  let pos: React.CSSProperties = {};
  let cssTx = "";
  if (slot === "head") {
    const lift = HEAD_OFFSET[slug] ?? 0.1;
    // Baseline: top = -sz * lift (cap sits above head).
    // Per-species: add speciesHeadDeltaPx so frog (anchor 0.30) gets
    // a NEGATIVE delta (cap moves further up; head is higher), while
    // hedgehog (anchor 0.56) gets a POSITIVE delta (cap moves down
    // onto the lower-sitting head).
    pos = {
      top: `${Math.round(-sz * lift + speciesHeadDeltaPx)}px`,
      left: "50%",
    };
    cssTx = "translateX(-50%) rotate(-3deg)";
  } else if (slot === "eyes") {
    pos = {
      top: `${Math.round(petSize * 0.34 + speciesHeadDeltaPx)}px`,
      left: "50%",
    };
    cssTx = "translateX(-50%)";
  } else {
    const baseDy = accT?.dy ?? DEFAULT_ACC.dy;
    pos = {
      bottom: `${Math.round(petSize * ((baseDy + speciesAccDyBoost) / 100))}px`,
      right: `${Math.round(petSize * ((accT?.dx ?? DEFAULT_ACC.dx) / 100))}px`,
    };
    cssTx = `rotate(${accT?.rot ?? DEFAULT_ACC.rot}deg)`;
  }

  return (
    <div
      className="cos-overlay"
      style={{
        ...pos,
        transform: cssTx,
        // exposed for the cos-in keyframe to animate from
        ["--cos-tx" as string]: cssTx,
      }}
    >
      <CosmeticGlyphSVG slug={slug} rarity={rarity} size={sz} />
    </div>
  );
}

export const CosmeticOverlay = memo(CosmeticOverlayImpl);

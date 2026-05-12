// Public API for the Axiomic Pet System.
//
// Consumers (forum bylines, profile chips, leaderboards, the
// pet hero card, etc.) import from "../pet" exclusively. Nothing
// outside this directory should reach into pet/components/ or
// pet/store.ts directly — keeps the system swappable.
//
// File layout under apps/web/src/pet/:
//   components/  — every renderable React component
//   dev/         — Tweaks panel + species-override context (dev-only)
//   store.ts     — the petMoments singleton + zustand store

// ─── Render-time entry points ─────────────────────────────────
export { PetAvatar } from "./components/PetAvatar";
export type {
  PetAvatarCosmetic,
  PetSkinFx,
  PetAction,
} from "./components/PetAvatar";
export type { PetMood } from "./components/PetSilhouetteSVG";

export { PetByUsername, __clearPetCache } from "./components/PetByUsername";
export { PetSVG, PROTOTYPE_SPECIES } from "./components/PetSVG";
export { PetSilhouetteSVG } from "./components/PetSilhouetteSVG";
export { CosmeticGlyphSVG, __BESPOKE_GLYPH_SLUGS } from "./components/CosmeticGlyphSVG";
export type { Rarity, GlyphTone } from "./components/CosmeticGlyphSVG";
export { CosmeticOverlay } from "./components/CosmeticOverlay";
export { CosmeticChip } from "./components/CosmeticChip";
export { CosmeticDetailSheet } from "./components/CosmeticDetailSheet";
export { SkinTile } from "./components/SkinTile";
export { RarityBadge } from "./components/RarityBadge";
export { ObtainabilityCallout } from "./components/ObtainabilityCallout";
export type { Obtain } from "./components/ObtainabilityCallout";
export { EvolutionChain } from "./components/EvolutionChain";
export { PetWhereCard } from "./components/PetWhereCard";
export { PetActionsRow, usePetAction } from "./components/PetActionsRow";
export { PetSwapStrip } from "./components/PetSwapStrip";
export { FilterChips } from "./components/FilterChips";
export { ProfilePetGallery } from "./components/ProfilePetGallery";
export { GrantCosmeticDialog } from "./components/GrantCosmeticDialog";

// ─── Moments orchestration ────────────────────────────────────
export {
  petMoments,
  usePetMomentsStore,
  type PetMoment,
} from "./store";
export { PetMomentsHost } from "./components/PetMomentsHost";
export { HatchMoment } from "./components/HatchMoment";
export { LevelUpMoment } from "./components/LevelUpMoment";
export { GrantMoment } from "./components/GrantMoment";
export { SkinRevealMoment } from "./components/SkinRevealMoment";
export { CompetitionTeaser } from "./components/CompetitionTeaser";
export { ConfirmDialog } from "./components/ConfirmDialog";
export { RenameMomentModal } from "./components/RenameMomentModal";
export { SwitchPetModal } from "./components/SwitchPetModal";

// ─── Dev affordances ──────────────────────────────────────────
export { TweaksPanel, isDevTweaksEnabled } from "./dev/TweaksPanel";
export {
  DevSpeciesProvider,
  useDevSpeciesOverride,
  useDevSpeciesSet,
} from "./dev/DevSpeciesContext";

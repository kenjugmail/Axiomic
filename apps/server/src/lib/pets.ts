// S86 — Pet species catalog. Hardcoded because the set is small,
// fixed, and changing it should be a deliberate code change rather
// than a seed edit. Cosmetics are a different story — those are
// data (loaded from `seed-content/pet-cosmetics/cosmetics.json`)
// because professors will eventually want to extend the catalog.
//
// S90 — added evolution chain (levels 1-3). No per-level emoji
// today — Phase M switched to SVG-only rendering (no emojis
// anywhere in the pet UI).

export interface PetSpecies {
  slug: string;
  label: string;
}

// 16 species — 8 from Axiomic's original catalog + 8 from the
// Claude Design pet-data.ts. PetSilhouetteSVG on the client owns
// the per-species parameter map; this list just gates which slugs
// are legal at the server.
export const PET_SPECIES: PetSpecies[] = [
  { slug: "cat", label: "Cat" },
  { slug: "dog", label: "Dog" },
  { slug: "rabbit", label: "Rabbit" },
  { slug: "fox", label: "Fox" },
  { slug: "turtle", label: "Turtle" },
  { slug: "dragon", label: "Dragon" },
  { slug: "owl", label: "Owl" },
  { slug: "penguin", label: "Penguin" },
  // Phase M — 8 new species.
  { slug: "hedgehog", label: "Hedgehog" },
  { slug: "capybara", label: "Capybara" },
  { slug: "otter", label: "Otter" },
  { slug: "axolotl", label: "Axolotl" },
  { slug: "frog", label: "Frog" },
  { slug: "panda", label: "Panda" },
  { slug: "ferret", label: "Ferret" },
  { slug: "seal", label: "Seal" },
];

export function petSpeciesBySlug(slug: string): PetSpecies | undefined {
  return PET_SPECIES.find((s) => s.slug === slug);
}

// Random species selection for hatching. Uses Math.random — fine
// for hatch flavor; not security-critical.
export function randomPetSpecies(): PetSpecies {
  return PET_SPECIES[Math.floor(Math.random() * PET_SPECIES.length)];
}

// =============================================================
// S90 — Pet evolution.
// =============================================================
//
// Three levels in v1. Thresholds are lifetime XP totals: pet hatches
// at PET_HATCH_THRESHOLD_XP (50, in xp.ts), so level 1 begins at
// hatch. Levels 2+ are spaced so they're meaningful without being
// punishing — level 2 ≈ couple weeks of class engagement, level 3 ≈
// a full course's worth.
//
// Adding more levels later: append to PET_LEVEL_THRESHOLDS. The
// level computation is "highest threshold the user has crossed"
// so it's robust to adding new tiers.
export const PET_LEVEL_THRESHOLDS: number[] = [50, 250, 750];
export const MAX_PET_LEVEL = PET_LEVEL_THRESHOLDS.length;

// Highest level the user qualifies for given lifetime XP. Returns
// 0 if pre-hatch (below the first threshold). Caller decides what
// to do with that — typically "no pet yet".
export function levelForXp(xp: number): number {
  let level = 0;
  for (let i = 0; i < PET_LEVEL_THRESHOLDS.length; i++) {
    if (xp >= PET_LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  return level;
}

// XP needed to reach the next level, or null if maxed out. Used by
// the /me/pet header to render the progress bar.
export function xpForNextLevel(level: number): number | null {
  if (level >= MAX_PET_LEVEL) return null;
  return PET_LEVEL_THRESHOLDS[level]; // PET_LEVEL_THRESHOLDS is 0-indexed
}

// Phase M — eye-anchor radius per species, used by PetSilhouetteSVG
// to place the cosmetic "eyes" slot proportionally. Adapted from
// the design's EYE_RADIUS_BY_SPECIES table.
export const EYE_RADIUS_BY_SPECIES: Record<string, number> = {
  cat: 2.4,
  dog: 2.4,
  rabbit: 2.0,
  fox: 2.2,
  turtle: 2.0,
  dragon: 2.4,
  owl: 3.4,
  penguin: 2.6,
  hedgehog: 2.2,
  capybara: 2.1,
  otter: 2.3,
  axolotl: 1.8,
  frog: 3.0,
  panda: 2.5,
  ferret: 2.1,
  seal: 2.4,
};

// =============================================================
// Phase L — Pet skin catalog (data-driven; lives in pet_skins).
// =============================================================
//
// Unlike species, skins ARE data — the catalog grows over time as
// designers add seasonal/event skins. Loaded from `pet_skins` once
// per process and cached. Tests run against a fresh seed so the
// cache picks up changes; in dev/prod the cache is fine for a
// process lifetime because the catalog is append-only.

import { getDb, petSkins } from "@axiomic/db";

export type SkinRarity = "common" | "rare" | "epic" | "legendary";
export type SkinObtain = "xp" | "grant" | "comp" | "default";
export type SkinParticles = "stars" | "embers" | "petals" | "snow";
export type SkinAnimated = "aurora" | "crystal";

export interface PetSkinFx {
  filter: string | null;
  opacity: number;
  glow: { color: string; blur: number; alpha: number } | null;
  bg: string | null;
  particles: SkinParticles | null;
  ring: string | null;
  animated: SkinAnimated | null;
}

export interface PetSkinDef {
  slug: string;
  name: string;
  rarity: SkinRarity;
  obtain: SkinObtain;
  xpCost: number | null;
  description: string;
  fx: PetSkinFx;
}

// Row shape (lifted off drizzle's inferred select type) → public
// PetSkinDef. Hoists the nested fx object out of the flat columns.
function rowToSkin(row: typeof petSkins.$inferSelect): PetSkinDef {
  const glow =
    row.fxGlowColor && row.fxGlowBlur != null && row.fxGlowAlpha != null
      ? { color: row.fxGlowColor, blur: row.fxGlowBlur, alpha: row.fxGlowAlpha }
      : null;
  return {
    slug: row.slug,
    name: row.name,
    rarity: row.rarity as SkinRarity,
    obtain: row.obtain as SkinObtain,
    xpCost: row.xpCost ?? null,
    description: row.description,
    fx: {
      filter: row.fxFilter,
      opacity: row.fxOpacity,
      glow,
      bg: row.fxBg,
      particles: (row.fxParticles as SkinParticles | null) ?? null,
      ring: row.fxRing,
      animated: (row.fxAnimated as SkinAnimated | null) ?? null,
    },
  };
}

let SKIN_CACHE: Map<string, PetSkinDef> | null = null;

function loadSkinCache(): Map<string, PetSkinDef> {
  if (SKIN_CACHE) return SKIN_CACHE;
  const rows = getDb().select().from(petSkins).all();
  const map = new Map<string, PetSkinDef>();
  for (const r of rows) map.set(r.slug, rowToSkin(r));
  SKIN_CACHE = map;
  return map;
}

// Test seam: tests reseed the catalog between cases, so they need
// to invalidate the cache. Production code shouldn't call this.
export function _resetPetSkinCache(): void {
  SKIN_CACHE = null;
}

export function petSkinBySlug(slug: string): PetSkinDef | undefined {
  return loadSkinCache().get(slug);
}

// Always returns something — falls back to 'default' if the slug
// is missing (e.g. a stale equipped value pointing at a deleted
// skin). Default itself is always seeded.
export function petSkinBySlugOrDefault(slug: string): PetSkinDef {
  return petSkinBySlug(slug) ?? petSkinBySlug("default") ?? {
    slug: "default",
    name: "Original",
    rarity: "common",
    obtain: "default",
    xpCost: null,
    description: "",
    fx: {
      filter: null,
      opacity: 1,
      glow: null,
      bg: null,
      particles: null,
      ring: null,
      animated: null,
    },
  };
}

export function allPetSkins(): PetSkinDef[] {
  return [...loadSkinCache().values()];
}

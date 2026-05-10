// S86 — Pet species catalog. Hardcoded because the set is small,
// fixed, and changing it should be a deliberate code change rather
// than a seed edit. Cosmetics are a different story — those are
// data (loaded from `seed-content/pet-cosmetics/cosmetics.json`)
// because professors will eventually want to extend the catalog.
//
// S90 — added evolution chain. Each species supplies an emoji per
// level (1, 2, 3). Some species don't have a clean unicode
// progression — those reuse the level-1 emoji at higher levels and
// rely on the level badge for visual signaling.

export interface PetSpecies {
  slug: string;
  label: string;
  emoji: string;
  // Length 3: emojiByLevel[level - 1] for levels 1, 2, 3.
  // Off-by-one because levels are 1-indexed in the data model.
  emojiByLevel: [string, string, string];
}

// Cleanly-progressing species use a different glyph at each level.
// Others repeat — we'd rather have an honest "no visual change" than
// a forced-fit emoji that looks weird ("turtle becomes a whale").
export const PET_SPECIES: PetSpecies[] = [
  { slug: "cat",     label: "Cat",     emoji: "🐱", emojiByLevel: ["🐱", "🐱", "🐈"] },
  { slug: "dog",     label: "Dog",     emoji: "🐶", emojiByLevel: ["🐶", "🐶", "🐕"] },
  { slug: "rabbit",  label: "Rabbit",  emoji: "🐰", emojiByLevel: ["🐰", "🐰", "🐇"] },
  { slug: "fox",     label: "Fox",     emoji: "🦊", emojiByLevel: ["🦊", "🦊", "🦊"] },
  { slug: "turtle",  label: "Turtle",  emoji: "🐢", emojiByLevel: ["🐢", "🐢", "🐢"] },
  { slug: "dragon",  label: "Dragon",  emoji: "🐉", emojiByLevel: ["🐉", "🐉", "🐲"] },
  { slug: "owl",     label: "Owl",     emoji: "🦉", emojiByLevel: ["🐥", "🦉", "🦅"] },
  { slug: "penguin", label: "Penguin", emoji: "🐧", emojiByLevel: ["🐧", "🐧", "🐧"] },
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
// Adding more levels later: append to PET_LEVEL_THRESHOLDS and
// extend each species' emojiByLevel tuple. The level computation
// is "highest threshold the user has crossed" so it's robust to
// adding new tiers.
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

export function emojiForSpeciesAtLevel(speciesSlug: string, level: number): string {
  const sp = petSpeciesBySlug(speciesSlug);
  if (!sp) return "🥚";
  const idx = Math.min(Math.max(0, level - 1), MAX_PET_LEVEL - 1);
  return sp.emojiByLevel[idx];
}

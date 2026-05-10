// S86 — Pet species catalog. Hardcoded because the set is small,
// fixed, and changing it should be a deliberate code change rather
// than a seed edit. Cosmetics are a different story — those are
// data (loaded from `seed-content/pet-cosmetics/cosmetics.json`)
// because professors will eventually want to extend the catalog.

export interface PetSpecies {
  slug: string;
  label: string;
  emoji: string;
}

export const PET_SPECIES: PetSpecies[] = [
  { slug: "cat", label: "Cat", emoji: "🐱" },
  { slug: "dog", label: "Dog", emoji: "🐶" },
  { slug: "rabbit", label: "Rabbit", emoji: "🐰" },
  { slug: "fox", label: "Fox", emoji: "🦊" },
  { slug: "turtle", label: "Turtle", emoji: "🐢" },
  { slug: "dragon", label: "Dragon", emoji: "🐉" },
  { slug: "owl", label: "Owl", emoji: "🦉" },
  { slug: "penguin", label: "Penguin", emoji: "🐧" },
];

export function petSpeciesBySlug(slug: string): PetSpecies | undefined {
  return PET_SPECIES.find((s) => s.slug === slug);
}

// Random species selection for hatching. Uses Math.random — fine
// for hatch flavor; not security-critical.
export function randomPetSpecies(): PetSpecies {
  return PET_SPECIES[Math.floor(Math.random() * PET_SPECIES.length)];
}

// Phase 8A (prototype parity) — catalog seed-file invariants.
//
// Tiny smoke test that guards the cosmetics seed JSON against
// regressions. The seeder in packages/db/src/seed.ts upserts these
// rows on every boot; if a future edit drops or duplicates entries
// the test fails before the seeder runs against a real DB.

import { describe, test, expect } from "bun:test";
import fs from "fs";
import path from "path";

interface CosmeticEntry {
  slug: string;
  name: string;
  slot: "head" | "eyes" | "accessory";
  rarity: "common" | "rare" | "epic" | "legendary";
  description?: string;
  xpCost?: number;
  renderKind?: "emoji" | "svg";
}

const SEED_FILE = path.resolve(
  import.meta.dir,
  "../../../../seed-content/pet-cosmetics/cosmetics.json",
);

function loadSeed(): CosmeticEntry[] {
  const raw = fs.readFileSync(SEED_FILE, "utf-8");
  const parsed = JSON.parse(raw);
  return parsed.cosmetics as CosmeticEntry[];
}

describe("pet cosmetics catalog (Phase 8A)", () => {
  const list = loadSeed();

  test("has exactly 50 entries (43 baseline + 7 Phase 8A additions)", () => {
    expect(list.length).toBe(50);
  });

  test("Phase 8A slugs are present", () => {
    const slugs = new Set(list.map((c) => c.slug));
    for (const slug of [
      "wizard-hat",
      "reading-specs",
      "sleepy-eyes",
      "laser-visor",
      "study-lantern",
      "honor-medal",
      "card-stack",
    ]) {
      expect(slugs.has(slug)).toBe(true);
    }
  });

  test("every entry has the required shape", () => {
    for (const c of list) {
      expect(typeof c.slug).toBe("string");
      expect(c.slug.length).toBeGreaterThan(0);
      expect(typeof c.name).toBe("string");
      expect(["head", "eyes", "accessory"]).toContain(c.slot);
      expect(["common", "rare", "epic", "legendary"]).toContain(c.rarity);
    }
  });

  test("no duplicate slugs", () => {
    const slugs = list.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  test("xpCost is positive when set; grant/comp items omit it", () => {
    for (const c of list) {
      if (c.xpCost != null) {
        expect(c.xpCost).toBeGreaterThan(0);
      }
    }
    // Spot-check the comp-only Phase 8A additions.
    const laser = list.find((c) => c.slug === "laser-visor");
    const medal = list.find((c) => c.slug === "honor-medal");
    expect(laser?.xpCost).toBeUndefined();
    expect(medal?.xpCost).toBeUndefined();
  });
});

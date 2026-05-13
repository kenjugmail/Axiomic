// Phase 9 (UX-bug root cause) — boot-time pet_cosmetics catalog seeder.
//
// THE BUG: pet_cosmetics rows were going stale because the canonical
// seed (packages/db/src/seed.ts) only runs on `bun run seed`, not on
// server boot. So when ensureStarterCosmetics granted study-cap /
// glasses / office-hours-mug, the /me/pet inventory join couldn't
// find slot data for those slugs and fell back to `slot: "accessory"`
// — pushing every starter item through the accessory-slot overlay,
// which is why the cap appeared bottom-right instead of on the head.
//
// THE FIX: read the seed JSON on server boot and upsert pet_cosmetics
// in one pass. Idempotent + fast (one query per slug, ~50 slugs).
// Mirrors the seedPetCosmetics function in packages/db/src/seed.ts.

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb, petCosmetics } from "@axiomic/db";
import { logger } from "./logger";

interface CosmeticEntry {
  slug: string;
  name: string;
  slot: "head" | "eyes" | "accessory";
  rarity: "common" | "rare" | "epic" | "legendary";
  description?: string;
  xpCost?: number;
  renderKind?: "emoji" | "svg";
  emoji?: string | null;
  grantOnly?: boolean;
  failSmall?: boolean;
}

// Resolves relative to the running server binary. In dev/test the
// seed-content/ folder sits at repo root; in a production deploy the
// folder must be shipped alongside the server.
const SEED_FILE = path.resolve(
  process.cwd(),
  "../../seed-content/pet-cosmetics/cosmetics.json",
);

let seededAt = 0;
const RESEED_INTERVAL_MS = 60_000;

export function ensurePetCosmeticsCatalog(force = false): void {
  if (!force && Date.now() - seededAt < RESEED_INTERVAL_MS) return;
  if (!fs.existsSync(SEED_FILE)) {
    // Try a path relative to import.meta.dir for the deploy layout.
    const alt = path.resolve(
      import.meta.dir,
      "../../../../seed-content/pet-cosmetics/cosmetics.json",
    );
    if (!fs.existsSync(alt)) return;
    runSeed(alt);
    seededAt = Date.now();
    return;
  }
  runSeed(SEED_FILE);
  seededAt = Date.now();
}

function runSeed(file: string): void {
  let parsed: { cosmetics: CosmeticEntry[] };
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (err) {
    // Phase 15G — route through the structured logger so prod
    // observability picks it up. Boot-time seed failures are
    // worth a warn.
    logger.warn({
      kind: "pet_catalog_invalid_json",
      msg: "cosmetics.json invalid, skipping catalog seed",
      err: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  const list = Array.isArray(parsed.cosmetics) ? parsed.cosmetics : [];
  const db = getDb();
  let upserted = 0;
  for (const c of list) {
    if (!c?.slug || !c?.name || !c?.slot) continue;
    const existing = db
      .select({ id: petCosmetics.id, slot: petCosmetics.slot })
      .from(petCosmetics)
      .where(eq(petCosmetics.slug, c.slug))
      .get();
    const values = {
      slug: c.slug,
      name: c.name,
      slot: c.slot,
      renderKind: c.renderKind ?? "svg",
      emoji: c.emoji ?? null,
      rarity: c.rarity ?? "common",
      grantOnly: c.grantOnly ?? false,
      description: c.description ?? "",
      xpCost: typeof c.xpCost === "number" && c.xpCost > 0 ? c.xpCost : null,
      failSmall: c.failSmall === true,
    };
    if (existing) {
      // Only update if the slot/data actually drifted, to keep this
      // boot step cheap. Slot drift was the root cause of the bug.
      if (existing.slot !== values.slot) {
        db.update(petCosmetics)
          .set(values)
          .where(eq(petCosmetics.id, existing.id))
          .run();
        upserted++;
      }
    } else {
      db.insert(petCosmetics)
        .values({ id: randomUUID(), ...values })
        .run();
      upserted++;
    }
  }
  if (upserted > 0) {
    logger.info({
      kind: "pet_catalog_synced",
      msg: "pet_cosmetics catalog synced",
      rowsTouched: upserted,
    });
  }
}

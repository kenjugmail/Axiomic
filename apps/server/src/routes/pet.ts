// S86 — Pet routes mounted under /me/pet.
//
// One pet per user (S86). Hatched automatically by `grantXp` once
// the user crosses PET_HATCH_THRESHOLD_XP. Renaming + equipping
// cosmetics is the user's only direct interaction with their pet
// in S86. Cosmetics arrive via instructor grants (see
// classes.ts grant-cosmetic) — there's no XP shop yet.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import {
  petCosmetics,
  petInventory,
  pets,
  users,
  getDb,
} from "@axiomic/db";
import { requireAuth } from "../middleware/auth";
import { totalXpForUser, PET_HATCH_THRESHOLD_XP } from "../lib/xp";
import { petSpeciesBySlug } from "../lib/pets";
import type { Env } from "../env";

export const petRouter = new Hono<Env>();

const equipSchema = z.object({
  cosmeticSlug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase, digits, hyphens"),
});

const renameSchema = z.object({
  name: z.string().min(1).max(40),
});

// GET /me/pet — pet + inventory + total XP + threshold so the UI
// can show "X more XP until your pet hatches" before the first
// cross of the threshold.
petRouter.get("/", requireAuth, (c) => {
  const user = c.get("user")!;
  const db = getDb();

  const pet = db
    .select()
    .from(pets)
    .where(eq(pets.userId, user.id))
    .get();
  const totalXp = totalXpForUser(user.id);

  // Inventory: join against the catalog so the response is
  // self-contained for rendering — no extra round-trip.
  const inventoryRows = db
    .select({
      id: petInventory.id,
      slug: petInventory.cosmeticSlug,
      equipped: petInventory.equipped,
      acquiredAt: petInventory.acquiredAt,
      grantedById: petInventory.grantedById,
      grantedNote: petInventory.grantedNote,
    })
    .from(petInventory)
    .where(eq(petInventory.userId, user.id))
    .all();

  const slugs = inventoryRows.map((r) => r.slug);
  const cosmeticRows = slugs.length
    ? db.select().from(petCosmetics).where(inArray(petCosmetics.slug, slugs)).all()
    : [];
  const bySlug = new Map(cosmeticRows.map((r) => [r.slug, r]));

  const inventory = inventoryRows.map((r) => {
    const cos = bySlug.get(r.slug);
    return {
      id: r.id,
      slug: r.slug,
      name: cos?.name ?? r.slug,
      slot: cos?.slot ?? "accessory",
      emoji: cos?.emoji ?? null,
      rarity: cos?.rarity ?? "common",
      description: cos?.description ?? "",
      equipped: r.equipped,
      acquiredAt: r.acquiredAt,
      grantedNote: r.grantedNote,
    };
  });

  const speciesMeta = pet ? petSpeciesBySlug(pet.species) : null;

  return c.json({
    pet: pet
      ? {
          id: pet.id,
          species: pet.species,
          speciesEmoji: speciesMeta?.emoji ?? "🥚",
          speciesLabel: speciesMeta?.label ?? pet.species,
          name: pet.name,
          hatchedAt: pet.hatchedAt,
        }
      : null,
    totalXp,
    hatchThresholdXp: PET_HATCH_THRESHOLD_XP,
    inventory,
  });
});

// POST /me/pet/equip — equip a cosmetic. Auto-unequips any other
// item in the same slot so renderings always have at most one item
// per slot.
petRouter.post(
  "/equip",
  requireAuth,
  zValidator("json", equipSchema),
  (c) => {
    const user = c.get("user")!;
    const { cosmeticSlug } = c.req.valid("json");
    const db = getDb();

    const owned = db
      .select()
      .from(petInventory)
      .where(
        and(
          eq(petInventory.userId, user.id),
          eq(petInventory.cosmeticSlug, cosmeticSlug),
        ),
      )
      .get();
    if (!owned) {
      return c.json({ error: "You don't own that cosmetic" }, 404);
    }
    const cosmetic = db
      .select()
      .from(petCosmetics)
      .where(eq(petCosmetics.slug, cosmeticSlug))
      .get();
    if (!cosmetic) {
      return c.json({ error: "Cosmetic not found" }, 404);
    }

    // Unequip everything else in this slot.
    const otherInSlot = db
      .select({
        id: petInventory.id,
        slug: petInventory.cosmeticSlug,
      })
      .from(petInventory)
      .innerJoin(petCosmetics, eq(petCosmetics.slug, petInventory.cosmeticSlug))
      .where(
        and(
          eq(petInventory.userId, user.id),
          eq(petCosmetics.slot, cosmetic.slot),
          eq(petInventory.equipped, true),
        ),
      )
      .all();
    for (const o of otherInSlot) {
      if (o.slug !== cosmeticSlug) {
        db.update(petInventory)
          .set({ equipped: false })
          .where(eq(petInventory.id, o.id))
          .run();
      }
    }

    db.update(petInventory)
      .set({ equipped: true })
      .where(eq(petInventory.id, owned.id))
      .run();
    return c.json({ ok: true });
  },
);

// POST /me/pet/unequip — remove a single cosmetic from the pet.
petRouter.post(
  "/unequip",
  requireAuth,
  zValidator("json", equipSchema),
  (c) => {
    const user = c.get("user")!;
    const { cosmeticSlug } = c.req.valid("json");
    const db = getDb();
    db.update(petInventory)
      .set({ equipped: false })
      .where(
        and(
          eq(petInventory.userId, user.id),
          eq(petInventory.cosmeticSlug, cosmeticSlug),
        ),
      )
      .run();
    return c.json({ ok: true });
  },
);

// PUT /me/pet/name — rename the pet.
petRouter.put(
  "/name",
  requireAuth,
  zValidator("json", renameSchema),
  (c) => {
    const user = c.get("user")!;
    const { name } = c.req.valid("json");
    const db = getDb();
    const pet = db
      .select({ id: pets.id })
      .from(pets)
      .where(eq(pets.userId, user.id))
      .get();
    if (!pet) {
      return c.json({ error: "No pet yet — earn XP to hatch one" }, 404);
    }
    db.update(pets)
      .set({ name: name.trim() })
      .where(eq(pets.id, pet.id))
      .run();
    return c.json({ ok: true });
  },
);

// GET /pet-cosmetics — full catalog. Public (no auth) so the UI
// can render the catalog before the user signs in. Used by the
// instructor's grant-cosmetic dialog and the student's "things I
// don't own yet" view.
export const petCatalogRouter = new Hono<Env>();
petCatalogRouter.get("/", (c) => {
  const db = getDb();
  const rows = db.select().from(petCosmetics).orderBy(petCosmetics.slot, petCosmetics.rarity).all();
  return c.json({ cosmetics: rows });
});

// S87 — Public per-username pet display, used by the
// PetByUsername wrapper to render pets next to bylines anywhere
// (forum topics, lesson author, profile page, ...). Returns the
// minimum data PetView needs: speciesEmoji + equipped[]. Returns
// pet=null when the user has no pet yet so the wrapper can fall
// back to its placeholder.
export const petPublicRouter = new Hono<Env>();
petPublicRouter.get("/:username/pet-display", (c) => {
  const username = c.req.param("username")!;
  const db = getDb();
  const user = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .get();
  if (!user) return c.json({ pet: null });

  const pet = db
    .select()
    .from(pets)
    .where(eq(pets.userId, user.id))
    .get();
  if (!pet) return c.json({ pet: null });

  const speciesMeta = petSpeciesBySlug(pet.species);
  const equippedRows = db
    .select({
      slug: petInventory.cosmeticSlug,
      slot: petCosmetics.slot,
      emoji: petCosmetics.emoji,
    })
    .from(petInventory)
    .innerJoin(petCosmetics, eq(petCosmetics.slug, petInventory.cosmeticSlug))
    .where(
      and(
        eq(petInventory.userId, user.id),
        eq(petInventory.equipped, true),
      ),
    )
    .all();

  return c.json({
    pet: {
      species: pet.species,
      speciesEmoji: speciesMeta?.emoji ?? "🥚",
      name: pet.name,
      equipped: equippedRows,
    },
  });
});

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
import { randomUUID } from "crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  petCosmetics,
  petInventory,
  pets,
  users,
  xpPurchases,
  getDb,
} from "@axiomic/db";
import { requireAuth } from "../middleware/auth";
import { totalXpForUser, xpBalanceForUser, PET_HATCH_THRESHOLD_XP } from "../lib/xp";
import {
  petSpeciesBySlug,
  emojiForSpeciesAtLevel,
  xpForNextLevel,
  MAX_PET_LEVEL,
} from "../lib/pets";
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
          // S86 base emoji (level-1 form) — kept for back-compat;
          // the level-aware emoji lives in `levelEmoji` below.
          speciesEmoji: speciesMeta?.emoji ?? "🥚",
          speciesLabel: speciesMeta?.label ?? pet.species,
          name: pet.name,
          hatchedAt: pet.hatchedAt,
          // S90 — pet evolution surface. levelEmoji is what the UI
          // should actually render. nextLevelXp is null at max level.
          level: pet.level,
          maxLevel: MAX_PET_LEVEL,
          levelEmoji: emojiForSpeciesAtLevel(pet.species, pet.level),
          nextLevelXp: xpForNextLevel(pet.level),
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
      // S90 — speciesEmoji follows the pet's current level, so
      // bylines show the level-3 form on a leveled-up pet without
      // any UI changes downstream.
      speciesEmoji: emojiForSpeciesAtLevel(pet.species, pet.level),
      level: pet.level,
      name: pet.name,
      equipped: equippedRows,
    },
  });
});

// =================================================================
// S89 — XP shop.
// =================================================================
// S89 — XP shop.
//
// S95 — daily-featured rotation. One purchasable cosmetic per UTC
// day is "featured" and gets a SHOP_FEATURED_DISCOUNT_PERCENT
// discount. The pick is deterministic from today's date hashed
// against the shop slug list, so the same cosmetic shows everywhere
// for the day and rolls over at midnight UTC. Encourages daily
// shop revisits without inventing a new state model.
// =================================================================

const SHOP_FEATURED_DISCOUNT_PERCENT = 50;

// FNV-1a 32-bit. Tiny, no deps, good-enough distribution for picking
// one cosmetic out of a small list once per day.
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

// Deterministic featured pick for a given UTC day key. Returns the
// cosmetic slug from `shopSlugs` selected by hashing `dayKey`.
// Pure function — testable without a clock.
export function pickFeaturedCosmetic(dayKey: string, shopSlugs: string[]): string | null {
  if (shopSlugs.length === 0) return null;
  const sorted = [...shopSlugs].sort();
  const idx = fnv1a(dayKey) % sorted.length;
  return sorted[idx];
}

function discountedCost(xpCost: number): number {
  // Round UP so the math always favors the shop (and matches the
  // "pay 50%" framing — 25 cost at 50% off is 13, not 12).
  return Math.ceil(xpCost * (1 - SHOP_FEATURED_DISCOUNT_PERCENT / 100));
}

// GET /me/pet/shop — list cosmetics with non-null xpCost plus the
// user's balance + ownership flags. The web shop renders this
// directly without needing the full catalog.
petRouter.get("/shop", requireAuth, (c) => {
  const user = c.get("user")!;
  const db = getDb();

  const items = db
    .select()
    .from(petCosmetics)
    .where(sql`${petCosmetics.xpCost} is not null`)
    .orderBy(petCosmetics.xpCost, petCosmetics.slot)
    .all();

  const ownedSlugs = new Set(
    db
      .select({ slug: petInventory.cosmeticSlug })
      .from(petInventory)
      .where(eq(petInventory.userId, user.id))
      .all()
      .map((r) => r.slug),
  );

  const today = new Date().toISOString().slice(0, 10);
  const featuredSlug = pickFeaturedCosmetic(today, items.map((it) => it.slug));

  const balance = xpBalanceForUser(user.id);
  return c.json({
    balance,
    featuredSlug,
    featuredDiscountPercent: SHOP_FEATURED_DISCOUNT_PERCENT,
    items: items.map((it) => {
      const featured = it.slug === featuredSlug;
      const effectiveCost = featured ? discountedCost(it.xpCost!) : it.xpCost!;
      return {
        slug: it.slug,
        name: it.name,
        slot: it.slot,
        emoji: it.emoji,
        rarity: it.rarity,
        description: it.description,
        xpCost: it.xpCost!,
        effectiveCost,
        featured,
        owned: ownedSlugs.has(it.slug),
        affordable: balance >= effectiveCost,
      };
    }),
  });
});

// POST /me/pet/buy — spend XP to put a cosmetic in your inventory.
// Validates: cosmetic exists, has xpCost, user has balance, not
// already owned. Inserts pet_inventory + xp_purchase atomically
// (a SQLite transaction wraps both writes). Re-buys of an owned
// cosmetic are rejected with 409 — by design, you can't farm
// duplicates.
const buySchema = z.object({
  cosmeticSlug: z.string().min(1).max(64),
});

petRouter.post(
  "/buy",
  requireAuth,
  zValidator("json", buySchema),
  (c) => {
    const user = c.get("user")!;
    const { cosmeticSlug } = c.req.valid("json");
    const db = getDb();

    const cosmetic = db
      .select()
      .from(petCosmetics)
      .where(eq(petCosmetics.slug, cosmeticSlug))
      .get();
    if (!cosmetic) return c.json({ error: "Cosmetic not found" }, 404);
    if (cosmetic.xpCost == null) {
      return c.json({ error: "This cosmetic is not for sale" }, 400);
    }

    const owned = db
      .select({ id: petInventory.id })
      .from(petInventory)
      .where(
        and(
          eq(petInventory.userId, user.id),
          eq(petInventory.cosmeticSlug, cosmeticSlug),
        ),
      )
      .get();
    if (owned) return c.json({ error: "Already owned" }, 409);

    // S95 — recompute the price server-side so a client can't
    // claim a discount that isn't valid today. We don't trust the
    // client to tell us "this is featured" — we re-derive it from
    // today's UTC date against the current shop slug list.
    const allShopSlugs = db
      .select({ slug: petCosmetics.slug })
      .from(petCosmetics)
      .where(sql`${petCosmetics.xpCost} is not null`)
      .all()
      .map((r) => r.slug);
    const today = new Date().toISOString().slice(0, 10);
    const featuredToday = pickFeaturedCosmetic(today, allShopSlugs);
    const finalCost =
      cosmeticSlug === featuredToday
        ? discountedCost(cosmetic.xpCost)
        : cosmetic.xpCost;

    const balance = xpBalanceForUser(user.id);
    if (balance < finalCost) {
      return c.json(
        { error: "Insufficient XP", balance, xpCost: finalCost },
        402,
      );
    }

    // SQLite (better-sqlite3) auto-commits each statement. To make
    // the spend + grant atomic, wrap both writes in a transaction
    // — if the inventory insert collides with a concurrent grant,
    // the purchase rolls back and the user keeps the XP. The
    // recorded purchase amount is the discounted finalCost so the
    // ledger reflects the actual XP burned.
    db.transaction((tx) => {
      tx.insert(xpPurchases)
        .values({
          id: randomUUID(),
          userId: user.id,
          cosmeticSlug,
          amount: finalCost,
        })
        .run();
      tx.insert(petInventory)
        .values({
          id: randomUUID(),
          userId: user.id,
          cosmeticSlug,
          equipped: false,
        })
        .run();
    });

    return c.json(
      {
        ok: true,
        balance: balance - finalCost,
        cosmeticSlug,
        amountSpent: finalCost,
        wasFeatured: cosmeticSlug === featuredToday,
      },
      201,
    );
  },
);

// GET /me/pet/balance — lightweight balance probe. Web pages that
// just want to show "XP: ###" without the full shop payload hit
// this. Returns lifetime XP too so the UI can show "###/### XP" or
// "spent ###" without a second call.
petRouter.get("/balance", requireAuth, (c) => {
  const user = c.get("user")!;
  const lifetimeXp = totalXpForUser(user.id);
  const balance = xpBalanceForUser(user.id);
  return c.json({
    balance,
    lifetimeXp,
    spentXp: lifetimeXp - balance,
  });
});

// =================================================================
// S97 — Public pet showcase / explore page.
// =================================================================
//
// Two leaderboards stitched together:
//   - mostDecorated: top users by equipped cosmetic count. Tie-break
//     by pet level desc, then most recent activity.
//   - recentTopLevel: most recent users to reach level >= 2. Lets
//     visitors see the engagement loop's mid/long-term reward
//     visible without having to drill into a class.
//
// Public on purpose — no auth gate. Pets + usernames are already
// public on profile pages, so aggregating them here doesn't leak
// anything new.
const SHOWCASE_LIMIT = 20;

petPublicRouter.get("/showcase", (c) => {
  const db = getDb();

  // mostDecorated: user → equipped count. Join pets so we can
  // include species + level for the renderer.
  const decoratedRows = db
    .select({
      userId: pets.userId,
      username: users.username,
      displayName: users.displayName,
      species: pets.species,
      petName: pets.name,
      level: pets.level,
      equippedCount: sql<number>`coalesce((select count(*) from pet_inventory pi where pi.user_id = ${pets.userId} and pi.equipped = 1), 0)`,
    })
    .from(pets)
    .innerJoin(users, eq(users.id, pets.userId))
    .orderBy(
      desc(sql`coalesce((select count(*) from pet_inventory pi where pi.user_id = ${pets.userId} and pi.equipped = 1), 0)`),
      desc(pets.level),
    )
    .limit(SHOWCASE_LIMIT)
    .all();

  // Drop users with zero equipped cosmetics — that's not "decorated"
  // by any meaningful read of the word.
  const decoratedFiltered = decoratedRows.filter((r) => r.equippedCount > 0);

  // For each decorated user fetch their equipped slugs + emojis so
  // PetView on the client renders correctly.
  const decoratedUserIds = decoratedFiltered.map((r) => r.userId);
  const decoratedEquipped = decoratedUserIds.length
    ? db
        .select({
          userId: petInventory.userId,
          slug: petInventory.cosmeticSlug,
          slot: petCosmetics.slot,
          emoji: petCosmetics.emoji,
        })
        .from(petInventory)
        .innerJoin(petCosmetics, eq(petCosmetics.slug, petInventory.cosmeticSlug))
        .where(
          and(
            inArray(petInventory.userId, decoratedUserIds),
            eq(petInventory.equipped, true),
          ),
        )
        .all()
    : [];
  const equippedByUser = new Map<string, Array<{ slot: string; emoji: string | null; slug: string }>>();
  for (const e of decoratedEquipped) {
    const arr = equippedByUser.get(e.userId) ?? [];
    arr.push({ slot: e.slot, emoji: e.emoji, slug: e.slug });
    equippedByUser.set(e.userId, arr);
  }

  const mostDecorated = decoratedFiltered.map((r) => ({
    userId: r.userId,
    username: r.username,
    displayName: r.displayName,
    pet: {
      species: r.species,
      speciesEmoji: emojiForSpeciesAtLevel(r.species, r.level),
      level: r.level,
      name: r.petName,
      equipped: equippedByUser.get(r.userId) ?? [],
    },
    equippedCount: Number(r.equippedCount),
  }));

  // recentTopLevel: users at level >= 2, ordered by hatchedAt desc
  // as a proxy for "recently active" (we don't store leveledAt).
  const topLevelRows = db
    .select({
      userId: pets.userId,
      username: users.username,
      displayName: users.displayName,
      species: pets.species,
      petName: pets.name,
      level: pets.level,
      hatchedAt: pets.hatchedAt,
    })
    .from(pets)
    .innerJoin(users, eq(users.id, pets.userId))
    .where(sql`${pets.level} >= 2`)
    .orderBy(desc(pets.hatchedAt))
    .limit(SHOWCASE_LIMIT)
    .all();

  const recentTopLevel = topLevelRows.map((r) => ({
    userId: r.userId,
    username: r.username,
    displayName: r.displayName,
    pet: {
      species: r.species,
      speciesEmoji: emojiForSpeciesAtLevel(r.species, r.level),
      level: r.level,
      name: r.petName,
      // Equipped is not surfaced on this list — keeps the payload
      // small. The client can navigate to the user profile for the
      // dressed-up view.
      equipped: [] as Array<{ slot: string; emoji: string | null; slug: string }>,
    },
    hatchedAt: r.hatchedAt,
  }));

  return c.json({ mostDecorated, recentTopLevel });
});

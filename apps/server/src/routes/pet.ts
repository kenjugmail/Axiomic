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
  petSkinInventory,
  pets,
  users,
  xpGrants,
  xpPurchases,
  getDb,
} from "@axiomic/db";
import { requireAuth, getSessionUser } from "../middleware/auth";
import { ACHIEVEMENTS } from "../lib/achievements";
import { totalXpForUser, xpBalanceForUser, PET_HATCH_THRESHOLD_XP, maybeHatchPet, isDevBypass } from "../lib/xp";
import {
  petSpeciesBySlug,
  randomPetSpecies,
  xpForNextLevel,
  petSkinBySlug,
  petSkinBySlugOrDefault,
  allPetSkins,
  MAX_PET_LEVEL,
  PET_LEVEL_THRESHOLDS,
} from "../lib/pets";
import { notify } from "../lib/notifications";
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
  // S104 — optional petId so users with multiple pets can rename a
  // non-active one without first activating it. Defaults to active.
  petId: z.string().min(1).max(64).optional(),
});

// S104 — multi-pet tuning. Cap at 3 pets to keep the UI digestible
// and prevent XP-farming-for-collection. Hatch thresholds escalate
// to match the user's own level progression — the second pet
// unlocks at level-2 XP (250) and the third at level-3 XP (750),
// so "hatching another pet" feels paced with the player's growth
// rather than as a separate grind.
export const MAX_PETS_PER_USER = 3;
const ADDITIONAL_HATCH_THRESHOLDS: number[] = [
  PET_HATCH_THRESHOLD_XP, // pet 1: 50 XP (existing default)
  250,                    // pet 2
  750,                    // pet 3
];

// Returns the XP threshold for the user's NEXT hatch given how many
// pets they already own. Null when at cap.
export function nextHatchThreshold(currentPetCount: number): number | null {
  if (currentPetCount >= MAX_PETS_PER_USER) return null;
  return ADDITIONAL_HATCH_THRESHOLDS[currentPetCount] ?? null;
}

// GET /me/pet — pet + inventory + total XP + threshold so the UI
// can show "X more XP until your pet hatches" before the first
// cross of the threshold.
petRouter.get("/", requireAuth, (c) => {
  const user = c.get("user")!;
  const db = getDb();

  // Phase X — defensive auto-hatch for users created before the
  // signup-time hatch wiring (e.g., the dev-bypass `alice`, seeded
  // forum users, or anyone whose account predates this change).
  // Idempotent: no-op if a pet already exists.
  maybeHatchPet(user.id);

  // S104 — pet is now the user's ACTIVE pet (one of possibly many).
  // The pets array further down surfaces every pet they own.
  const userRow = db
    .select({ activePetId: users.activePetId })
    .from(users)
    .where(eq(users.id, user.id))
    .get();
  const activePetId = userRow?.activePetId ?? null;
  const allPets = db
    .select()
    .from(pets)
    .where(eq(pets.userId, user.id))
    .all();
  const pet = activePetId
    ? allPets.find((p) => p.id === activePetId) ?? allPets[0] ?? null
    : allPets[0] ?? null;
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
      // Phase M — emoji nulled out for all cosmetics; CosmeticGlyphSVG
      // resolves visuals from slug. Field retained for type compat
      // until next-phase removal.
      emoji: null,
      rarity: cos?.rarity ?? "common",
      description: cos?.description ?? "",
      equipped: r.equipped,
      acquiredAt: r.acquiredAt,
      grantedNote: r.grantedNote,
      failSmall: cos?.failSmall ?? false,
    };
  });

  const speciesMeta = pet ? petSpeciesBySlug(pet.species) : null;

  // Phase L — autoprovision the 'default' skin on first read so
  // the user always has a baseline + the picker has at least one
  // owned tile to show. Cheap (one INSERT OR IGNORE) and lazy.
  const skinInvRows = db
    .select({ slug: petSkinInventory.skinSlug })
    .from(petSkinInventory)
    .where(eq(petSkinInventory.userId, user.id))
    .all();
  let ownedSkinSlugs = skinInvRows.map((r) => r.slug);
  if (ownedSkinSlugs.length === 0) {
    try {
      db.insert(petSkinInventory)
        .values({ id: randomUUID(), userId: user.id, skinSlug: "default" })
        .onConflictDoNothing()
        .run();
      ownedSkinSlugs = ["default"];
    } catch {
      // best-effort; the response still works without ownership rows
    }
  }
  const ownedSkins = ownedSkinSlugs
    .map((slug) => petSkinBySlug(slug))
    .filter((s): s is NonNullable<typeof s> => !!s);
  const activeSkin = pet
    ? petSkinBySlugOrDefault(pet.activeSkinSlug)
    : petSkinBySlugOrDefault("default");

  return c.json({
    pet: pet
      ? {
          id: pet.id,
          species: pet.species,
          speciesLabel: speciesMeta?.label ?? pet.species,
          name: pet.name,
          hatchedAt: pet.hatchedAt,
          // S90 — pet evolution surface. nextLevelXp is null at max level.
          // Phase M — speciesEmoji + levelEmoji removed; PetSilhouetteSVG
          // resolves visuals on the client from the species slug alone.
          level: pet.level,
          maxLevel: MAX_PET_LEVEL,
          nextLevelXp: xpForNextLevel(pet.level),
          // Phase L — currently-equipped skin slug. The full def is
          // hoisted to the top-level `activeSkin` so it sits next to
          // ownedSkins in the response shape.
          activeSkinSlug: pet.activeSkinSlug,
          // S100 — full evolution chain for this species, so the UI
          // can render the past + future forms next to the current
          // pet ("here's what's coming"). Each entry pairs a level
          // with its threshold; no emoji (Phase M).
          evolutionChain: PET_LEVEL_THRESHOLDS.map((threshold, i) => ({
            level: i + 1,
            threshold,
          })),
        }
      : null,
    activeSkin,
    ownedSkins,
    totalXp,
    hatchThresholdXp: PET_HATCH_THRESHOLD_XP,
    // S104 — full pet list so the UI can render the swap strip.
    // Sorted oldest-hatched first so the user's first pet is on the
    // left of the strip.
    pets: allPets
      .slice()
      .sort((a, b) => (a.hatchedAt < b.hatchedAt ? -1 : 1))
      .map((p) => {
        const meta = petSpeciesBySlug(p.species);
        return {
          id: p.id,
          species: p.species,
          speciesLabel: meta?.label ?? p.species,
          level: p.level,
          name: p.name,
          hatchedAt: p.hatchedAt,
          isActive: p.id === pet?.id,
          activeSkinSlug: p.activeSkinSlug,
        };
      }),
    petCap: MAX_PETS_PER_USER,
    // null when at cap or no more thresholds; otherwise the XP
    // threshold for the user's next hatch.
    nextHatchXp: nextHatchThreshold(allPets.length),
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

// PUT /me/pet/name — rename a pet (defaults to active).
// S104 — accepts optional petId so a user with multiple pets can
// rename any of them. The pet must belong to the caller.
petRouter.put(
  "/name",
  requireAuth,
  zValidator("json", renameSchema),
  (c) => {
    const user = c.get("user")!;
    const { name, petId } = c.req.valid("json");
    const db = getDb();
    let targetPet: { id: string } | undefined;
    if (petId) {
      const row = db
        .select({ id: pets.id, userId: pets.userId })
        .from(pets)
        .where(eq(pets.id, petId))
        .get();
      if (!row || row.userId !== user.id) {
        return c.json({ error: "Pet not found" }, 404);
      }
      targetPet = { id: row.id };
    } else {
      const userRow = db
        .select({ activePetId: users.activePetId })
        .from(users)
        .where(eq(users.id, user.id))
        .get();
      if (!userRow?.activePetId) {
        return c.json({ error: "No pet yet — earn XP to hatch one" }, 404);
      }
      targetPet = { id: userRow.activePetId };
    }
    db.update(pets)
      .set({ name: name.trim() })
      .where(eq(pets.id, targetPet.id))
      .run();
    return c.json({ ok: true });
  },
);

// =================================================================
// S104 — Multi-pet.
// =================================================================
//
// petRouter is mounted at /me/pet in apps/server/src/index.ts, so
// the full path here is POST /me/pet/hatch-another. Manually
// hatches an additional pet once the user has earned enough
// lifetime XP. The first hatch is still automatic via maybeHatchPet
// on grantXp; this route is for subsequent pets so users opt in
// (the random species is a surprise they want to summon, not have
// surprise-spammed at them when a milestone trips the threshold).
//
// Auto-activates the new pet so the swap strip's "+" button flips
// the hero pet immediately.
petRouter.post("/hatch-another", requireAuth, (c) => {
  const user = c.get("user")!;
  const db = getDb();

  const owned = db
    .select({ id: pets.id })
    .from(pets)
    .where(eq(pets.userId, user.id))
    .all();
  if (owned.length === 0) {
    // First pet should land via auto-hatch on grantXp; if the user
    // is here without any pet, send them through that path.
    return c.json({ error: "Earn XP to hatch your first pet automatically" }, 400);
  }
  if (owned.length >= MAX_PETS_PER_USER) {
    return c.json({ error: "Pet cap reached", petCap: MAX_PETS_PER_USER }, 409);
  }
  const threshold = nextHatchThreshold(owned.length);
  if (threshold == null) {
    return c.json({ error: "No more hatches available" }, 409);
  }
  const totalXp = totalXpForUser(user.id);
  if (totalXp < threshold) {
    return c.json(
      { error: "Need more XP to hatch another pet", totalXp, threshold },
      402,
    );
  }

  const species = randomPetSpecies();
  const petId = randomUUID();
  db.transaction((tx) => {
    tx.insert(pets)
      .values({
        id: petId,
        userId: user.id,
        species: species.slug,
        name: species.label,
      })
      .run();
    // Auto-activate the new pet so the swap strip flips.
    tx.update(users)
      .set({ activePetId: petId })
      .where(eq(users.id, user.id))
      .run();
  });

  // Surface in the bell — reuses the pet_hatched kind from S88.
  void notify({
    recipientId: user.id,
    actorId: null,
    kind: "pet_hatched",
    subjectType: "pet",
    subjectId: petId,
    contextSlug: null,
    preview: `A new ${species.label} hatched!`,
  });

  return c.json(
    {
      ok: true,
      pet: {
        id: petId,
        species: species.slug,
        name: species.label,
        level: 1,
      },
    },
    201,
  );
});

// POST /me/pet/activate — switch the active pet. The pet must
// belong to the caller; otherwise 404 (same status as a missing
// pet to avoid leaking which pet ids exist on other users).
const activateSchema = z.object({
  petId: z.string().min(1).max(64),
});

petRouter.post(
  "/activate",
  requireAuth,
  zValidator("json", activateSchema),
  (c) => {
    const user = c.get("user")!;
    const { petId } = c.req.valid("json");
    const db = getDb();
    const row = db
      .select({ id: pets.id, userId: pets.userId })
      .from(pets)
      .where(eq(pets.id, petId))
      .get();
    if (!row || row.userId !== user.id) {
      return c.json({ error: "Pet not found" }, 404);
    }
    db.update(users)
      .set({ activePetId: petId })
      .where(eq(users.id, user.id))
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

// Phase L — public skin catalog. Same auth posture as /pet-cosmetics:
// the inventory UI shows ALL skins (owned + unowned) so users see
// what's available to chase.
export const petSkinCatalogRouter = new Hono<Env>();
petSkinCatalogRouter.get("/", (c) => {
  return c.json({ skins: allPetSkins() });
});

// Phase N — Skin showcase enrichment. Each skin gets a source label
// (xp / achievement / competition / starter) plus, if the caller is
// signed in, ownership + per-pet equipped state. The unauth path
// returns ownership/equipped as nulls/empty so the same payload can
// drive a public marketing-style showcase page.
petSkinCatalogRouter.get("/catalog", async (c) => {
  const skins = allPetSkins();
  const db = getDb();

  // Build a slug→achievement reverse index so each skin's source line
  // can mention the awarding achievement by title.
  const achievementBySkinSlug = new Map<string, { slug: string; title: string }>();
  for (const a of ACHIEVEMENTS) {
    if (a.rewardSkinSlug) {
      achievementBySkinSlug.set(a.rewardSkinSlug, { slug: a.slug, title: a.title });
    }
  }

  const sessionUser = await getSessionUser(c);

  // Per-user ownership + per-pet equipped state, only when authed.
  const ownedSlugs = new Set<string>();
  const equippedBySkinSlug = new Map<string, string[]>();
  if (sessionUser) {
    const ownedRows = db
      .select({ slug: petSkinInventory.skinSlug })
      .from(petSkinInventory)
      .where(eq(petSkinInventory.userId, sessionUser.id))
      .all();
    for (const r of ownedRows) ownedSlugs.add(r.slug);

    const userPets = db
      .select({ id: pets.id, activeSkinSlug: pets.activeSkinSlug })
      .from(pets)
      .where(eq(pets.userId, sessionUser.id))
      .all();
    for (const p of userPets) {
      const list = equippedBySkinSlug.get(p.activeSkinSlug) ?? [];
      list.push(p.id);
      equippedBySkinSlug.set(p.activeSkinSlug, list);
    }
  }

  const enriched = skins.map((skin) => {
    let source: "xp" | "achievement" | "competition" | "starter";
    let sourceDetail:
      | { xpCost?: number; achievementSlug?: string; achievementLabel?: string }
      | null = null;

    if (skin.obtain === "default") {
      source = "starter";
    } else if (skin.obtain === "xp") {
      source = "xp";
      if (skin.xpCost != null) sourceDetail = { xpCost: skin.xpCost };
    } else if (skin.obtain === "comp") {
      source = "competition";
    } else {
      // "grant" — match against achievement catalog.
      const ach = achievementBySkinSlug.get(skin.slug);
      if (ach) {
        source = "achievement";
        sourceDetail = {
          achievementSlug: ach.slug,
          achievementLabel: ach.title,
        };
      } else {
        // Grant skins without a matching achievement still exist (e.g.
        // manual instructor grants) — surface as "achievement" without
        // a label so the UI can render a generic "earn this through a
        // grant" line.
        source = "achievement";
      }
    }

    return {
      slug: skin.slug,
      displayName: skin.name,
      rarity: skin.rarity,
      description: skin.description,
      fx: skin.fx,
      source,
      sourceDetail,
      owned: sessionUser ? ownedSlugs.has(skin.slug) : null,
      equippedOnPetIds: equippedBySkinSlug.get(skin.slug) ?? [],
    };
  });

  return c.json({ skins: enriched, authenticated: !!sessionUser });
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
  // S104 — scope to the user's ACTIVE pet. The user may own
  // multiple now; bylines and tooltips render whichever they've
  // chosen as their main.
  const user = db
    .select({ id: users.id, activePetId: users.activePetId })
    .from(users)
    .where(eq(users.username, username))
    .get();
  if (!user) return c.json({ pet: null });
  if (!user.activePetId) return c.json({ pet: null });

  const pet = db
    .select()
    .from(pets)
    .where(eq(pets.id, user.activePetId))
    .get();
  if (!pet) return c.json({ pet: null });

  const equippedRows = db
    .select({
      slug: petInventory.cosmeticSlug,
      slot: petCosmetics.slot,
      rarity: petCosmetics.rarity,
      failSmall: petCosmetics.failSmall,
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
      // Phase M — speciesEmoji dropped; PetSilhouetteSVG renders the
      // species from the slug alone (no emoji anywhere in the pipeline).
      level: pet.level,
      name: pet.name,
      equipped: equippedRows,
      // Phase L — active skin so the byline avatar renders with
      // skin FX in one round-trip (no separate skin fetch).
      activeSkin: petSkinBySlugOrDefault(pet.activeSkinSlug),
    },
  });
});

// =================================================================
// S89 — XP shop.
// Sentinel thrown from inside the buy transaction when the live
// balance falls short. Caught by the route handler and mapped to a
// 402 response so the rollback + status mapping stay co-located.
class InsufficientBalanceError extends Error {
  constructor(readonly balance: number, readonly cost: number) {
    super("Insufficient XP");
  }
}

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
        // Phase M — emoji null across the catalog.
        emoji: null,
        rarity: it.rarity,
        description: it.description,
        xpCost: it.xpCost!,
        effectiveCost,
        featured,
        owned: ownedSlugs.has(it.slug),
        affordable: balance >= effectiveCost,
        failSmall: it.failSmall,
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

    // S-audit fix — concurrent buys of two different cosmetics could
    // both pass a pre-transaction balance check and both succeed at
    // insert (different slugs → no UNIQUE conflict), pushing the
    // balance negative. Recompute balance INSIDE the transaction
    // and abort if it's no longer sufficient. better-sqlite3 wraps
    // db.transaction in BEGIN…COMMIT and serializes writes, so the
    // recheck reflects any concurrent xp_purchases insert that
    // landed first. We throw to roll back; the caller maps the
    // throw to a 402.
    let preTxBalance = -1;
    const devBypass = isDevBypass(user.id);
    try {
      db.transaction((tx) => {
        if (devBypass) {
          // Phase X — dev bypass: unlimited balance, no spend ledger
          // write. Lifetime XP and leaderboard stay untouched.
          preTxBalance = xpBalanceForUser(user.id);
        } else {
          const earnedRow = tx
            .select({ total: sql<number>`coalesce(sum(${xpGrants.amount}), 0)` })
            .from(xpGrants)
            .where(eq(xpGrants.userId, user.id))
            .get();
          const spentRow = tx
            .select({ total: sql<number>`coalesce(sum(${xpPurchases.amount}), 0)` })
            .from(xpPurchases)
            .where(eq(xpPurchases.userId, user.id))
            .get();
          const liveBalance = Number(earnedRow?.total ?? 0) - Number(spentRow?.total ?? 0);
          preTxBalance = liveBalance;
          if (liveBalance < finalCost) {
            // Use a sentinel error so the catch knows to map to 402
            // rather than 500.
            throw new InsufficientBalanceError(liveBalance, finalCost);
          }
          tx.insert(xpPurchases)
            .values({
              id: randomUUID(),
              userId: user.id,
              cosmeticSlug,
              amount: finalCost,
            })
            .run();
        }
        tx.insert(petInventory)
          .values({
            id: randomUUID(),
            userId: user.id,
            cosmeticSlug,
            equipped: false,
          })
          .run();
      });
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        return c.json(
          { error: "Insufficient XP", balance: err.balance, xpCost: err.cost },
          402,
        );
      }
      throw err;
    }

    return c.json(
      {
        ok: true,
        balance: preTxBalance - finalCost,
        cosmeticSlug,
        amountSpent: finalCost,
        wasFeatured: cosmeticSlug === featuredToday,
      },
      201,
    );
  },
);

// =================================================================
// Phase L — Skin endpoints.
// =================================================================
//
// Skins parallel cosmetics but the equipped state is per-pet
// (pets.activeSkinSlug) rather than per-user. The 'default' skin
// is always owned and always available — calls to unequip just
// equip 'default' rather than null the column.

const skinEquipSchema = z.object({
  skinSlug: z.string().min(1).max(64),
  // S104 — optional petId so users with multiple pets can change
  // a non-active pet's skin without first activating it. Defaults
  // to the user's active pet.
  petId: z.string().min(1).max(64).optional(),
});

// POST /me/pet/skin/equip — set pets.active_skin_slug. Verifies
// ownership in pet_skin_inventory unless it's the 'default' skin
// (always allowed). Idempotent.
petRouter.post(
  "/skin/equip",
  requireAuth,
  zValidator("json", skinEquipSchema),
  (c) => {
    const user = c.get("user")!;
    const { skinSlug, petId } = c.req.valid("json");
    const db = getDb();

    const skin = petSkinBySlug(skinSlug);
    if (!skin) return c.json({ error: "Skin not found" }, 404);

    // Owned check (default is always free).
    if (skinSlug !== "default") {
      const owned = db
        .select({ id: petSkinInventory.id })
        .from(petSkinInventory)
        .where(
          and(
            eq(petSkinInventory.userId, user.id),
            eq(petSkinInventory.skinSlug, skinSlug),
          ),
        )
        .get();
      if (!owned) return c.json({ error: "Skin not owned" }, 403);
    }

    // Resolve target pet: explicit petId or fall back to active.
    let targetPetId = petId;
    if (!targetPetId) {
      const userRow = db
        .select({ activePetId: users.activePetId })
        .from(users)
        .where(eq(users.id, user.id))
        .get();
      targetPetId = userRow?.activePetId ?? undefined;
    }
    if (!targetPetId) {
      return c.json({ error: "No pet to equip skin on" }, 404);
    }

    // Verify the pet belongs to the user before mutating.
    const targetPet = db
      .select({ id: pets.id, userId: pets.userId })
      .from(pets)
      .where(eq(pets.id, targetPetId))
      .get();
    if (!targetPet || targetPet.userId !== user.id) {
      return c.json({ error: "Pet not found" }, 404);
    }

    db.update(pets)
      .set({ activeSkinSlug: skinSlug })
      .where(eq(pets.id, targetPetId))
      .run();

    return c.json({ ok: true, activeSkin: skin });
  },
);

// POST /me/pet/skin/unequip — convenience for "go back to default".
// Equivalent to equip({ skinSlug: 'default' }) but doesn't require
// the client to know the magic slug name.
const skinUnequipSchema = z.object({
  petId: z.string().min(1).max(64).optional(),
});
petRouter.post(
  "/skin/unequip",
  requireAuth,
  zValidator("json", skinUnequipSchema),
  (c) => {
    const user = c.get("user")!;
    const { petId } = c.req.valid("json");
    const db = getDb();

    let targetPetId = petId;
    if (!targetPetId) {
      const userRow = db
        .select({ activePetId: users.activePetId })
        .from(users)
        .where(eq(users.id, user.id))
        .get();
      targetPetId = userRow?.activePetId ?? undefined;
    }
    if (!targetPetId) {
      return c.json({ error: "No pet" }, 404);
    }
    const targetPet = db
      .select({ id: pets.id, userId: pets.userId })
      .from(pets)
      .where(eq(pets.id, targetPetId))
      .get();
    if (!targetPet || targetPet.userId !== user.id) {
      return c.json({ error: "Pet not found" }, 404);
    }
    db.update(pets)
      .set({ activeSkinSlug: "default" })
      .where(eq(pets.id, targetPetId))
      .run();
    return c.json({ ok: true, activeSkin: petSkinBySlugOrDefault("default") });
  },
);

// GET /me/pet/skin-shop — purchasable skins (xpCost not null) with
// ownership + affordability flags. Mirrors GET /shop for cosmetics.
petRouter.get("/skin-shop", requireAuth, (c) => {
  const user = c.get("user")!;
  const db = getDb();

  const items = allPetSkins().filter((s) => s.xpCost != null);
  const ownedSlugs = new Set(
    db
      .select({ slug: petSkinInventory.skinSlug })
      .from(petSkinInventory)
      .where(eq(petSkinInventory.userId, user.id))
      .all()
      .map((r) => r.slug),
  );
  const balance = xpBalanceForUser(user.id);
  return c.json({
    balance,
    items: items.map((s) => ({
      slug: s.slug,
      name: s.name,
      rarity: s.rarity,
      description: s.description,
      xpCost: s.xpCost!,
      fx: s.fx,
      owned: ownedSlugs.has(s.slug),
      affordable: balance >= s.xpCost!,
    })),
  });
});

// POST /me/pet/buy-skin — spend XP to own a skin. Mirrors /buy:
// atomic xp_purchases + pet_skin_inventory insert, 402 on
// insufficient balance, 409 on already-owned.
const buySkinSchema = z.object({
  skinSlug: z.string().min(1).max(64),
});
petRouter.post(
  "/buy-skin",
  requireAuth,
  zValidator("json", buySkinSchema),
  (c) => {
    const user = c.get("user")!;
    const { skinSlug } = c.req.valid("json");
    const db = getDb();

    const skin = petSkinBySlug(skinSlug);
    if (!skin) return c.json({ error: "Skin not found" }, 404);
    if (skin.xpCost == null) {
      return c.json({ error: "This skin is not for sale" }, 400);
    }

    const owned = db
      .select({ id: petSkinInventory.id })
      .from(petSkinInventory)
      .where(
        and(
          eq(petSkinInventory.userId, user.id),
          eq(petSkinInventory.skinSlug, skinSlug),
        ),
      )
      .get();
    if (owned) return c.json({ error: "Already owned" }, 409);

    const finalCost = skin.xpCost;
    let preTxBalance = -1;
    const devBypass = isDevBypass(user.id);
    try {
      db.transaction((tx) => {
        if (devBypass) {
          // Phase X — dev bypass: unlimited balance, no spend ledger
          // write. Lifetime XP and leaderboard stay untouched.
          preTxBalance = xpBalanceForUser(user.id);
        } else {
          const earnedRow = tx
            .select({ total: sql<number>`coalesce(sum(${xpGrants.amount}), 0)` })
            .from(xpGrants)
            .where(eq(xpGrants.userId, user.id))
            .get();
          const spentRow = tx
            .select({ total: sql<number>`coalesce(sum(${xpPurchases.amount}), 0)` })
            .from(xpPurchases)
            .where(eq(xpPurchases.userId, user.id))
            .get();
          const liveBalance = Number(earnedRow?.total ?? 0) - Number(spentRow?.total ?? 0);
          preTxBalance = liveBalance;
          if (liveBalance < finalCost) {
            throw new InsufficientBalanceError(liveBalance, finalCost);
          }
          tx.insert(xpPurchases)
            .values({
              id: randomUUID(),
              userId: user.id,
              // xp_purchases.cosmetic_slug is a free-form text field —
              // reusing it for skins keeps one ledger table. Prefix
              // so audits can tell them apart.
              cosmeticSlug: `skin:${skinSlug}`,
              amount: finalCost,
            })
            .run();
        }
        tx.insert(petSkinInventory)
          .values({
            id: randomUUID(),
            userId: user.id,
            skinSlug,
          })
          .run();
      });
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        return c.json(
          { error: "Insufficient XP", balance: err.balance, xpCost: err.cost },
          402,
        );
      }
      throw err;
    }
    return c.json(
      {
        ok: true,
        balance: preTxBalance - finalCost,
        skinSlug,
        amountSpent: finalCost,
      },
      201,
    );
  },
);

// GET /pet-skins — public catalog. Mirror of /pet-cosmetics.
// Mounted via petCatalogRouter below.

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

// =================================================================
// S98 — Profile cosmetic gallery.
// =================================================================
//
// Public per-username view of the entire cosmetic catalog with
// owned/equipped flags. Companion to the achievements gallery on
// ProfilePage. Visitors see what the user has collected; the user
// themself sees what's left to chase.
petPublicRouter.get("/:username/cosmetics-gallery", (c) => {
  const username = c.req.param("username")!;
  const db = getDb();
  const user = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .get();
  if (!user) return c.json({ error: "User not found" }, 404);

  const catalog = db
    .select()
    .from(petCosmetics)
    .orderBy(petCosmetics.slot, petCosmetics.rarity, petCosmetics.name)
    .all();

  const inventoryRows = db
    .select({
      slug: petInventory.cosmeticSlug,
      equipped: petInventory.equipped,
    })
    .from(petInventory)
    .where(eq(petInventory.userId, user.id))
    .all();
  const inventoryBySlug = new Map(inventoryRows.map((r) => [r.slug, r]));

  return c.json({
    items: catalog.map((c) => {
      const inv = inventoryBySlug.get(c.slug);
      return {
        slug: c.slug,
        name: c.name,
        slot: c.slot,
        // Phase M — emoji null across the catalog.
        emoji: null,
        rarity: c.rarity,
        description: c.description,
        failSmall: c.failSmall,
        // Indicates how it can be obtained — purely informational.
        // 'shop' = has xpCost, 'grant' = grantOnly with no xpCost.
        // The server doesn't enforce on this read, just tags.
        obtainability:
          typeof c.xpCost === "number" && c.xpCost > 0
            ? ("shop" as const)
            : ("grant" as const),
        owned: !!inv,
        equipped: inv?.equipped ?? false,
      };
    }),
    ownedCount: inventoryRows.length,
    totalCount: catalog.length,
  });
});

petPublicRouter.get("/showcase", (c) => {
  const db = getDb();

  // mostDecorated: user → equipped count. Join from users so we
  // surface ONE row per user (the active pet); pre-S104 the unique
  // index on pets.userId made this safe by accident. Now that
  // users can own multiple pets, the join goes via users.activePetId
  // so the showcase shows the pet the user actually picked as their
  // public face.
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
    .from(users)
    .innerJoin(pets, eq(pets.id, users.activePetId))
    .orderBy(
      desc(sql`coalesce((select count(*) from pet_inventory pi where pi.user_id = ${pets.userId} and pi.equipped = 1), 0)`),
      desc(pets.level),
    )
    .limit(SHOWCASE_LIMIT)
    .all();

  // Drop users with zero equipped cosmetics — that's not "decorated"
  // by any meaningful read of the word.
  const decoratedFiltered = decoratedRows.filter((r) => r.equippedCount > 0);

  // For each decorated user fetch their equipped slugs + rarity so
  // PetAvatar can render the silhouette + cosmetic overlays. Phase M
  // drops the emoji column — CosmeticGlyphSVG resolves visuals from slug.
  const decoratedUserIds = decoratedFiltered.map((r) => r.userId);
  const decoratedEquipped = decoratedUserIds.length
    ? db
        .select({
          userId: petInventory.userId,
          slug: petInventory.cosmeticSlug,
          slot: petCosmetics.slot,
          rarity: petCosmetics.rarity,
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
  const equippedByUser = new Map<string, Array<{ slot: string; slug: string; rarity: string }>>();
  for (const e of decoratedEquipped) {
    const arr = equippedByUser.get(e.userId) ?? [];
    arr.push({ slot: e.slot, slug: e.slug, rarity: e.rarity });
    equippedByUser.set(e.userId, arr);
  }

  const mostDecorated = decoratedFiltered.map((r) => ({
    userId: r.userId,
    username: r.username,
    displayName: r.displayName,
    pet: {
      species: r.species,
      level: r.level,
      name: r.petName,
      equipped: equippedByUser.get(r.userId) ?? [],
    },
    equippedCount: Number(r.equippedCount),
  }));

  // recentTopLevel: users with their ACTIVE pet at level >= 2,
  // ordered by hatchedAt desc as a proxy for "recently active" (we
  // don't store leveledAt). S104 — scoped to active pet so a user
  // can't surface 3 different rows from owning 3 pets.
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
    .from(users)
    .innerJoin(pets, eq(pets.id, users.activePetId))
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
      level: r.level,
      name: r.petName,
      // Equipped is not surfaced on this list — keeps the payload
      // small. The client can navigate to the user profile for the
      // dressed-up view.
      equipped: [] as Array<{ slot: string; slug: string }>,
    },
    hatchedAt: r.hatchedAt,
  }));

  return c.json({ mostDecorated, recentTopLevel });
});

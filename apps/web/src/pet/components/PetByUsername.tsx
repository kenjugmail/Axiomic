// S87 — PetByUsername.
//
// Wraps PetAvatar with a self-fetched + cached lookup of a user's pet
// + equipped cosmetics. Used wherever a username appears in the UI
// (forum topic OP, lesson author byline, profile page header) so a
// pet renders inline next to the name.
//
// Design notes:
// - Module-level Map cache keyed by username; 60s TTL. Avoids
//   refetching across page transitions for the same author.
// - In-flight Promise dedupe so a single page that mentions the same
//   author twice fires only one request.
// - Renders nothing while loading (no skeleton); once resolved, shows
//   the pet OR a fallback (initial letter, or null if none provided).
// - SSR-safe: does nothing during SSR since it relies on useEffect.

import { useEffect, useState } from "react";
import type { UserPetDisplay } from "@axiomic/types";
import { api } from "../../lib/api";
import { PetAvatar } from "./PetAvatar";

type Pet = NonNullable<UserPetDisplay["pet"]>;
type CacheEntry = { fetchedAt: number; pet: Pet | null };

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<Pet | null>>();

function fetchPet(username: string): Promise<Pet | null> {
  const cached = cache.get(username);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return Promise.resolve(cached.pet);
  }
  const flying = inFlight.get(username);
  if (flying) return flying;
  const p = api.pet
    .byUsername(username)
    .then((r) => {
      cache.set(username, { fetchedAt: Date.now(), pet: r.pet });
      inFlight.delete(username);
      return r.pet;
    })
    .catch((err) => {
      inFlight.delete(username);
      throw err;
    });
  inFlight.set(username, p);
  return p;
}

interface PetByUsernameProps {
  username: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  // Single character (or short string) shown when the user has no
  // pet yet. Lets the wrapper degrade gracefully in places that
  // previously rendered an initial-letter avatar.
  fallbackInitial?: string;
  className?: string;
}

const FALLBACK_PX: Record<NonNullable<PetByUsernameProps["size"]>, number> = {
  xs: 24,
  sm: 36,
  md: 56,
  lg: 80,
  xl: 128,
};

export function PetByUsername({
  username,
  size = "sm",
  fallbackInitial,
  className,
}: PetByUsernameProps) {
  const [pet, setPet] = useState<Pet | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchPet(username)
      .then((p) => {
        if (!cancelled) setPet(p);
      })
      .catch(() => {
        if (!cancelled) setPet(null);
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  // Phase 12D — loading state renders a sized placeholder so the
  // surrounding row (forum byline, profile chip, etc.) reserves the
  // pet's footprint and doesn't visibly jump when the fetch resolves.
  if (pet === undefined) {
    const px = FALLBACK_PX[size];
    return (
      <span
        className={className}
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: px,
          height: px,
          borderRadius: "9999px",
          background: "color-mix(in oklab, var(--ink-4) 10%, transparent)",
        }}
      />
    );
  }

  if (!pet) {
    if (!fallbackInitial) return null;
    const px = FALLBACK_PX[size];
    return (
      <span
        className={className}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: px,
          height: px,
          borderRadius: "9999px",
          backgroundColor: "rgba(99, 102, 241, 0.1)",
          color: "rgb(99, 102, 241)",
          fontSize: Math.round(px * 0.4),
          fontWeight: 600,
          userSelect: "none",
        }}
      >
        {fallbackInitial}
      </span>
    );
  }

  // Phase M — convert API's slot-keyed array to the PetAvatar's
  // {head, eyes, acc} object shape. Server uses 'accessory'; the
  // component uses 'acc' (matching design convention). The API
  // also includes failSmall per cosmetic (Phase M.12); pass it
  // through so byline pets hide failSmall cosmetics at 24px.
  const equippedObj = {
    head: findEquipped(pet.equipped, "head"),
    eyes: findEquipped(pet.equipped, "eyes"),
    acc: findEquipped(pet.equipped, "accessory"),
  };
  const px = FALLBACK_PX[size];

  // Phase 11F — title shows pet name + species on hover so the
  // byline communicates context at small sizes.
  const tooltip = pet.name
    ? `${pet.name}, ${username}'s ${pet.species}`
    : `${username}'s ${pet.species}`;

  return (
    <span
      className={className}
      style={{ display: "inline-block" }}
      title={tooltip}
    >
      <PetAvatar
        species={pet.species}
        level={pet.level}
        equipped={equippedObj}
        skin={pet.activeSkin?.fx ?? null}
        size={px}
      />
    </span>
  );
}

// Helper: server returns equipped as an array; PetAvatar wants slot-keyed
// object. The PetCosmetic shape now omits `emoji` (Phase M.13 drops it),
// but the response may still surface `failSmall` and `rarity` per item.
function findEquipped(
  arr: Pet["equipped"],
  slot: string,
): { slug: string; rarity?: "common" | "rare" | "epic" | "legendary"; failSmall?: boolean } | null {
  const found = arr.find((e) => e.slot === slot);
  if (!found) return null;
  return {
    slug: found.slug,
    rarity: (found as { rarity?: "common" | "rare" | "epic" | "legendary" }).rarity,
    failSmall: (found as { failSmall?: boolean }).failSmall,
  };
}

// Phase 13F — public cache invalidation. Surfaces that mutate the
// current user's pet (equip / unequip / rename / skin equip /
// switch active pet) call this with the user's username so the
// next byline render fetches fresh data instead of waiting up to
// 60 s for the TTL to expire.
export function invalidatePetCacheFor(username: string): void {
  cache.delete(username);
  inFlight.delete(username);
}

// Test hook: clears the module-level cache. Not part of the public
// API; tests can call it via `__clearPetCache()` import.
export function __clearPetCache() {
  cache.clear();
  inFlight.clear();
}

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

  // Loading: render nothing. Page text already shows the username,
  // pet just floats in alongside when ready.
  if (pet === undefined) return null;

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

  // Phase L — convert the API's slot-keyed array to the PetAvatar's
  // {head, eyes, acc} object shape. The server uses 'accessory'; the
  // component uses 'acc' (matching design convention).
  const equippedObj = {
    head: pet.equipped.find((e) => e.slot === "head") ?? null,
    eyes: pet.equipped.find((e) => e.slot === "eyes") ?? null,
    acc: pet.equipped.find((e) => e.slot === "accessory") ?? null,
  };
  const px = FALLBACK_PX[size];

  return (
    <span className={className} style={{ display: "inline-block" }}>
      {/* S90 — speciesEmoji from the API is already level-aware,
          so the byline reflects evolution without level prop. */}
      <PetAvatar
        species={pet.species}
        speciesEmoji={pet.speciesEmoji}
        level={pet.level}
        equipped={equippedObj}
        skin={pet.activeSkin?.fx ?? null}
        size={px}
      />
    </span>
  );
}

// Test hook: clears the module-level cache. Not part of the public
// API; tests can call it via `__clearPetCache()` import.
export function __clearPetCache() {
  cache.clear();
  inFlight.clear();
}

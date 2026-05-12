// Phase 4 (prototype migration) — ProfilePetGallery.
//
// Public profile component combining two prototype sections:
//   1. "Where {Name}'s pet appears" — pet preview at five sizes
//      (24/32/40/56/80 px) so visitors see the same scannability
//      affordances the owner does on /me/pet.
//   2. Cosmetics gallery — full catalog grouped by slot, owned vs.
//      unowned states, equipped tiles ringed, obtain hints on
//      unowned items so the gallery doubles as discovery.
//
// No purchase prompts when viewing someone else's profile.
//
// Server contract: combines two existing endpoints —
//   GET /users/:username/pet-display   (PetByUsername already calls this)
//   GET /users/:username/cosmetics-gallery
// Both are public; no auth required.

import { useEffect, useState } from "react";
import type {
  CosmeticGalleryItem,
  CosmeticGalleryResponse,
  CosmeticSlot,
  UserPetDisplay,
} from "@axiomic/types";
import { api } from "../../lib/api";
import { Skeleton } from "../../components/ui";
import { PetAvatar, type PetAvatarCosmetic } from "./PetAvatar";
import { CosmeticGlyphSVG, type Rarity } from "./CosmeticGlyphSVG";
import { RarityBadge } from "./RarityBadge";

interface Props {
  username: string;
  // Hide the size-preview row on tight profile layouts. Default shows.
  hideSizePreview?: boolean;
}

const SIZES: ReadonlyArray<{ sz: number; ctx: string }> = [
  { sz: 24, ctx: "Nav · comment thread" },
  { sz: 32, ctx: "Sidebar · roster" },
  { sz: 40, ctx: "Inline replies" },
  { sz: 56, ctx: "Profile chip" },
  { sz: 80, ctx: "Hero card" },
];

const SLOT_LABEL: Record<CosmeticSlot, string> = {
  head: "Head",
  eyes: "Eyes",
  accessory: "Accessory",
};

const RARITY_ORDER = ["common", "rare", "epic", "legendary"] as const;

export function ProfilePetGallery({ username, hideSizePreview }: Props): JSX.Element {
  const [display, setDisplay] = useState<UserPetDisplay | null>(null);
  const [gallery, setGallery] = useState<CosmeticGalleryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.pet.byUsername(username)
      .then((r) => { if (!cancelled) setDisplay(r); })
      .catch((e) => { if (!cancelled) setError(e?.message ?? "Failed"); });
    api.pet.galleryFor(username)
      .then((r) => { if (!cancelled) setGallery(r); })
      .catch(() => { /* gallery is optional */ });
    return () => { cancelled = true; };
  }, [username]);

  if (error) return <></>;
  if (!display || !gallery) {
    return <Skeleton variant="card" className="h-48" />;
  }

  const pet = display.pet;
  const equippedObj = pet ? buildEquippedFromArray(pet.equipped) : null;
  const equippedRarities = (pet?.equipped ?? [])
    .map((e) => (e.rarity ?? "common") as Rarity)
    .filter(Boolean);
  const highestRarity = (RARITY_ORDER.slice().reverse() as Rarity[]).find((r) =>
    equippedRarities.includes(r),
  ) || false;

  // Group catalog by slot for the sectioned gallery.
  const bySlot: Record<CosmeticSlot, CosmeticGalleryItem[]> = {
    head: [],
    eyes: [],
    accessory: [],
  };
  for (const it of gallery.items) {
    bySlot[it.slot]?.push(it);
  }

  return (
    <div className="flex flex-col gap-6">
      {pet && !hideSizePreview && (
        <section
          className="rounded-2xl border"
          style={{ borderColor: "var(--line)", background: "var(--bg-elev)" }}
        >
          <header
            className="px-6 py-4"
            style={{ borderBottom: "1px solid var(--line)" }}
          >
            <h3 className="text-base font-semibold">
              Where {username}'s pet appears
            </h3>
            <p className="text-xs mt-1" style={{ color: "var(--ink-3)" }}>
              Same pet, every surface — scannable at a glance.
            </p>
          </header>
          <div className="px-6 py-5">
            <div className="flex flex-wrap items-end gap-7">
              {SIZES.map(({ sz, ctx }) => (
                <div key={sz} className="flex flex-col items-center gap-1.5">
                  <PetAvatar
                    species={pet.species}
                    level={pet.level}
                    equipped={equippedObj ?? {}}
                    skin={pet.activeSkin?.fx ?? null}
                    size={sz}
                    ring={sz >= 32 ? highestRarity : false}
                    showCosmetics={sz >= 32}
                    ariaLabel={`${pet.name}'s pet at ${sz} pixels (${ctx})`}
                  />
                  <span
                    className="text-[10.5px] font-mono"
                    style={{ color: "var(--ink-4)" }}
                  >
                    {sz}px
                  </span>
                </div>
              ))}
              <p
                className="text-xs ml-auto max-w-[16rem]"
                style={{ color: "var(--ink-3)" }}
              >
                Cosmetics hide below 32px to keep the pet readable in dense
                lists and avatar stacks.
              </p>
            </div>
          </div>
        </section>
      )}

      <section
        className="rounded-2xl border"
        style={{ borderColor: "var(--line)", background: "var(--bg-elev)" }}
      >
        <header
          className="px-6 py-4 flex items-baseline justify-between"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <div>
            <h3 className="text-base font-semibold">Cosmetics gallery</h3>
            <p className="text-xs mt-1" style={{ color: "var(--ink-3)" }}>
              {gallery.ownedCount} of {gallery.totalCount} owned. Equipped
              items show a rarity ring.
            </p>
          </div>
        </header>
        <div className="px-6 py-5">
          {(["head", "eyes", "accessory"] as CosmeticSlot[]).map((slot) => {
            const items = bySlot[slot];
            if (items.length === 0) return null;
            const ownedInSlot = items.filter((i) => i.owned).length;
            return (
              <div key={slot} className="mb-6 last:mb-0">
                <div className="flex items-baseline justify-between mb-3">
                  <h4
                    className="text-[13px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--ink-3)" }}
                  >
                    {SLOT_LABEL[slot]}
                  </h4>
                  <span
                    className="text-xs"
                    style={{ color: "var(--ink-4)" }}
                  >
                    {ownedInSlot} / {items.length} owned
                  </span>
                </div>
                <div className="cos-grid">
                  {items.map((it) => (
                    <PublicCosmeticTile key={it.slug} item={it} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function PublicCosmeticTile({ item }: { item: CosmeticGalleryItem }) {
  const obtainHint = !item.owned
    ? item.obtainability === "shop"
      ? "xp"
      : "grant"
    : null;
  return (
    <div
      className={[
        "cos-tile",
        item.rarity,
        item.owned ? "" : "unowned",
        item.equipped ? "equipped" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      title={
        item.owned
          ? item.equipped
            ? `${item.name} — Equipped`
            : item.name
          : `${item.name} — ${item.obtainability === "shop" ? "XP shop" : "Granted only"}`
      }
    >
      <span className="corner" aria-hidden="true">
        {item.rarity[0]!.toUpperCase()}
      </span>
      <span className="glyph">
        <CosmeticGlyphSVG
          slug={item.slug}
          rarity={item.rarity as Rarity}
          size={56}
          tone={item.owned ? "full" : "muted"}
        />
      </span>
      <span className="nm" title={item.name}>{item.name}</span>
      {!item.owned && (
        <div
          className="mt-1 flex items-center justify-center gap-1.5"
          aria-label={obtainHint === "xp" ? "Buy in XP shop" : "Granted only"}
        >
          <RarityBadge rarity={item.rarity as Rarity} compact />
        </div>
      )}
    </div>
  );
}

function buildEquippedFromArray(
  arr: Array<{ slot: string; slug: string; rarity?: Rarity | null; failSmall?: boolean }>,
): {
  head: PetAvatarCosmetic | null;
  eyes: PetAvatarCosmetic | null;
  acc: PetAvatarCosmetic | null;
} {
  const pick = (slot: string): PetAvatarCosmetic | null => {
    const found = arr.find((e) => e.slot === slot);
    if (!found) return null;
    return {
      slug: found.slug,
      rarity: (found.rarity ?? undefined) as Rarity | undefined,
      failSmall: found.failSmall,
    };
  };
  return { head: pick("head"), eyes: pick("eyes"), acc: pick("accessory") };
}

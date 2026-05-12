// Phase 2 (prototype migration) — PetMomentsHost.
//
// Mounted near the root of the app (Layout). Listens to live events
// over the WebSocket and translates pet-relevant notifications into
// celebratory modals. Manual replays (Preview level-up, Replay hatch)
// also flow through the same petMoments store.
//
// Event mapping:
//   pet_hatched      → HatchMoment
//   pet_leveled_up   → LevelUpMoment
//   cosmetic_granted → GrantMoment (cosmetic details resolved from
//                                   the user's inventory on next /me/pet)
//   competition_won  → GrantMoment with "Competition prize" framing
//
// Skin reveals are client-only (fired by MyPetPage on first equip).

import { useEffect, useState } from "react";
import { useLiveEvents } from "../../hooks/useLiveEvents";
import { api } from "../../lib/api";
import { useAuthStore } from "../../stores/auth";
import { usePetMomentsStore } from "../store";
import { HatchMoment } from "./HatchMoment";
import { LevelUpMoment } from "./LevelUpMoment";
import { GrantMoment } from "./GrantMoment";
import { SkinRevealMoment } from "./SkinRevealMoment";
import { CompetitionTeaser } from "./CompetitionTeaser";
import type { MyPetResponse, PetInventoryItem } from "@axiomic/types";

export function PetMomentsHost(): JSX.Element {
  const { user } = useAuthStore();
  const current = usePetMomentsStore((s) => s.current);
  const dismiss = usePetMomentsStore((s) => s.dismiss);

  // Cache the user's pet response so we can resolve event payloads
  // (cosmetic slugs, current pet identity) without bouncing through
  // the API on every notification.
  const [me, setMe] = useState<MyPetResponse | null>(null);

  useEffect(() => {
    if (!user) {
      setMe(null);
      return;
    }
    let alive = true;
    api.pet.me()
      .then((r) => {
        if (alive) setMe(r);
      })
      .catch(() => {
        // PetMomentsHost is best-effort; fall back to whatever the
        // payload carries.
      });
    return () => {
      alive = false;
    };
  }, [user]);

  useLiveEvents({
    onEvent: (e) => {
      if (!user) return;
      if (e.kind !== "notification") return;
      const n = e.notification;
      // Refresh local cache on any pet-related event so the next
      // moment (or page) sees the new state.
      const refreshKinds = new Set([
        "pet_hatched",
        "pet_leveled_up",
        "cosmetic_granted",
        "competition_won",
      ]);
      if (refreshKinds.has(n.kind)) {
        api.pet.me().then(setMe).catch(() => {
          /* ignore */
        });
      }
      if (!me) return;

      if (n.kind === "pet_hatched" && me.pet) {
        usePetMomentsStore.getState().show({
          kind: "hatch",
          pet: {
            species: me.pet.species,
            level: me.pet.level,
            maxLevel: me.pet.maxLevel,
            name: me.pet.name,
            speciesLabel: me.pet.speciesLabel,
          },
        });
        return;
      }
      if (n.kind === "pet_leveled_up" && me.pet) {
        usePetMomentsStore.getState().show({
          kind: "level-up",
          pet: {
            species: me.pet.species,
            level: me.pet.level,
            maxLevel: me.pet.maxLevel,
            name: me.pet.name || me.pet.speciesLabel,
            speciesLabel: me.pet.speciesLabel,
          },
        });
        return;
      }
      if (n.kind === "cosmetic_granted" || n.kind === "competition_won") {
        // Resolve the cosmetic from inventory. Server emits the item's
        // slug as subjectId on the notification (see lib/notifications).
        const slug = n.subjectId;
        const item = findCosmetic(me.inventory, slug);
        if (!item) return;
        usePetMomentsStore.getState().show({
          kind: "grant",
          item: {
            slug: item.slug,
            name: item.name,
            rarity: item.rarity,
            description: item.description,
          },
          fromName:
            n.kind === "competition_won"
              ? "A competition prize"
              : n.actor?.username
                ? `@${n.actor.username}`
                : "Your instructor",
        });
        return;
      }
    },
  });

  if (!current) return <></>;

  if (current.kind === "hatch") {
    return (
      <HatchMoment
        open
        onClose={dismiss}
        pet={current.pet}
        onCommit={async (name) => {
          if (name !== current.pet.name) {
            try {
              await api.pet.rename(name);
            } catch {
              /* ignore — rename is best-effort here */
            }
          }
          dismiss();
        }}
      />
    );
  }
  if (current.kind === "level-up") {
    return <LevelUpMoment open onClose={dismiss} pet={current.pet} />;
  }
  if (current.kind === "grant") {
    return (
      <GrantMoment
        open
        onClose={dismiss}
        item={current.item}
        fromName={current.fromName}
      />
    );
  }
  if (current.kind === "skin-reveal") {
    return (
      <SkinRevealMoment
        open
        onClose={dismiss}
        pet={current.pet}
        equipped={current.equipped}
        skin={current.skin}
      />
    );
  }
  if (current.kind === "competition-teaser") {
    return <CompetitionTeaser open onClose={dismiss} item={current.item} />;
  }
  return <></>;
}

function findCosmetic(
  inventory: PetInventoryItem[],
  slugOrId: string,
): PetInventoryItem | null {
  // Server may send the cosmetic id (UUID) or the slug; try both.
  return (
    inventory.find((i) => i.slug === slugOrId) ??
    inventory.find((i) => i.id === slugOrId) ??
    null
  );
}

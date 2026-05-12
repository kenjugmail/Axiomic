// Phase 2 (prototype migration) — pet moments store.
//
// Holds a FIFO queue of celebratory modals (hatch, level-up, grant,
// skin-reveal, competition-teaser). One moment shows at a time;
// closing advances to the next queued moment.
//
// Mirrors the singleton-helper pattern from stores/toast.ts so
// callers can write `petMoments.show("level-up", { pet })` without
// pulling a hook into every site.

import { create } from "zustand";
import type { PetSkinDef } from "@axiomic/types";
import type { PetAvatarCosmetic } from "./components/PetAvatar";

type PetIdentity = {
  species: string;
  level: number;
  maxLevel: number;
  name: string;
  speciesLabel: string;
};

export type PetMoment =
  | { kind: "hatch"; pet: PetIdentity; onHatch?: (name: string) => void | Promise<void> }
  | { kind: "level-up"; pet: PetIdentity }
  | {
      kind: "grant";
      item: {
        slug: string;
        name: string;
        rarity: "common" | "rare" | "epic" | "legendary";
        description?: string | null;
      };
      fromName: string;
    }
  | {
      kind: "skin-reveal";
      pet: PetIdentity;
      equipped: {
        head?: PetAvatarCosmetic | null;
        eyes?: PetAvatarCosmetic | null;
        acc?: PetAvatarCosmetic | null;
      };
      skin: PetSkinDef;
    }
  | {
      kind: "competition-teaser";
      item: {
        slug: string;
        name: string;
        rarity: "common" | "rare" | "epic" | "legendary";
        description?: string | null;
      };
    };

interface PetMomentsState {
  queue: PetMoment[];
  // The currently-visible moment, or null if nothing is showing.
  current: PetMoment | null;
  show: (m: PetMoment) => void;
  dismiss: () => void;
  clear: () => void;
}

export const usePetMomentsStore = create<PetMomentsState>((set, get) => ({
  queue: [],
  current: null,
  show: (m) => {
    const state = get();
    if (!state.current) {
      set({ current: m });
    } else {
      // Skip exact-duplicate queueing — a flurry of pet_hatched events
      // shouldn't pile up the same modal.
      const isSame = (a: PetMoment, b: PetMoment) =>
        a.kind === b.kind &&
        ("pet" in a && "pet" in b ? a.pet.species === b.pet.species && a.pet.level === b.pet.level : true);
      if (isSame(state.current, m)) return;
      if (state.queue.some((q) => isSame(q, m))) return;
      set({ queue: [...state.queue, m] });
    }
  },
  dismiss: () => {
    const { queue } = get();
    if (queue.length === 0) {
      set({ current: null });
    } else {
      const [next, ...rest] = queue;
      set({ current: next, queue: rest });
    }
  },
  clear: () => set({ queue: [], current: null }),
}));

// Singleton helper mirroring `toast`. Use this from anywhere:
//   petMoments.show({ kind: "level-up", pet });
//   petMoments.dismiss();
export const petMoments = {
  show(m: PetMoment) {
    usePetMomentsStore.getState().show(m);
  },
  dismiss() {
    usePetMomentsStore.getState().dismiss();
  },
  clear() {
    usePetMomentsStore.getState().clear();
  },
};

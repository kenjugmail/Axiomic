// Phase 12B — petMoments queue dedup test.
//
// Pins the kind-specific dedup logic so skin-reveal moments with
// different slugs no longer collapse into one, and same-slug
// moments are still filtered.

import { describe, expect, test, beforeEach } from "vitest";
import {
  petMoments,
  usePetMomentsStore,
  isSameMoment,
  type PetMoment,
} from "./store";

const pet = {
  species: "fox",
  level: 2,
  maxLevel: 3,
  name: "Aristotle",
  speciesLabel: "Fox",
};

const skinReveal = (slug: string): PetMoment => ({
  kind: "skin-reveal",
  pet,
  equipped: {},
  skin: {
    slug,
    name: slug,
    rarity: "rare",
    obtain: "xp",
    xpCost: null,
    description: "",
    fx: null,
  } as PetMoment extends { kind: "skin-reveal"; skin: infer S } ? S : never,
});

const grant = (slug: string): PetMoment => ({
  kind: "grant",
  fromName: "Dr. Chen",
  item: { slug, name: slug, rarity: "rare", description: null },
});

const levelUp: PetMoment = { kind: "level-up", pet };

describe("petMoments store — Phase 12B dedup", () => {
  beforeEach(() => {
    petMoments.clear();
  });

  test("isSameMoment treats different skin slugs as distinct", () => {
    expect(isSameMoment(skinReveal("aurora"), skinReveal("cosmic"))).toBe(false);
  });

  test("isSameMoment treats same skin slug as duplicate", () => {
    expect(isSameMoment(skinReveal("aurora"), skinReveal("aurora"))).toBe(true);
  });

  test("isSameMoment treats different grant slugs as distinct", () => {
    expect(isSameMoment(grant("quill-inkwell"), grant("trophy"))).toBe(false);
    expect(isSameMoment(grant("quill-inkwell"), grant("quill-inkwell"))).toBe(true);
  });

  test("isSameMoment treats two level-ups for same pet/level as duplicate", () => {
    expect(isSameMoment(levelUp, levelUp)).toBe(true);
  });

  test("queueing two distinct-slug skin reveals enqueues both", () => {
    petMoments.show(skinReveal("aurora"));
    petMoments.show(skinReveal("cosmic"));
    const state = usePetMomentsStore.getState();
    expect(state.current?.kind).toBe("skin-reveal");
    expect(state.queue.length).toBe(1);
    if (state.current?.kind === "skin-reveal") {
      expect(state.current.skin.slug).toBe("aurora");
    }
    if (state.queue[0]?.kind === "skin-reveal") {
      expect(state.queue[0].skin.slug).toBe("cosmic");
    }
  });

  test("queueing the same skin twice keeps only one in flight", () => {
    petMoments.show(skinReveal("aurora"));
    petMoments.show(skinReveal("aurora"));
    const state = usePetMomentsStore.getState();
    expect(state.current?.kind).toBe("skin-reveal");
    expect(state.queue.length).toBe(0);
  });

  test("dismiss advances to the next queued moment", () => {
    petMoments.show(skinReveal("aurora"));
    petMoments.show(skinReveal("cosmic"));
    petMoments.dismiss();
    const state = usePetMomentsStore.getState();
    expect(state.current?.kind).toBe("skin-reveal");
    if (state.current?.kind === "skin-reveal") {
      expect(state.current.skin.slug).toBe("cosmic");
    }
    expect(state.queue.length).toBe(0);
  });
});

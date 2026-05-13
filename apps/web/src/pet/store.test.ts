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
  PET_MOMENTS_MAX_QUEUE,
  __resetPetMomentsOverflow,
  type PetMoment,
} from "./store";
import { useToastStore } from "../stores/toast";

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

// Phase 14B — bounded queue.
describe("petMoments store — Phase 14B queue cap", () => {
  beforeEach(() => {
    petMoments.clear();
    useToastStore.getState().clear();
    __resetPetMomentsOverflow();
  });

  test("queue caps at PET_MOMENTS_MAX_QUEUE and drops oldest", () => {
    // First show sets `current`, so it doesn't count toward the
    // queue. The next N+1 shows fill + spill the queue.
    const total = PET_MOMENTS_MAX_QUEUE + 4 + 1; // +1 for current, +4 spilled
    for (let i = 0; i < total; i++) {
      petMoments.show(grant(`slug-${i}`));
    }
    const state = usePetMomentsStore.getState();
    expect(state.current).not.toBeNull();
    expect(state.queue.length).toBeLessThanOrEqual(PET_MOMENTS_MAX_QUEUE);
    // The current is the very first one shown (slug-0). The
    // queue tail should hold the *newest* shows (highest indices).
    if (state.current?.kind === "grant") {
      expect(state.current.item.slug).toBe("slug-0");
    }
    const lastQueued = state.queue[state.queue.length - 1];
    if (lastQueued?.kind === "grant") {
      expect(lastQueued.item.slug).toBe(`slug-${total - 1}`);
    }
  });

  test("overflow fires an info toast exactly once per burst", () => {
    // 1 current + cap + 5 overflows.
    for (let i = 0; i < PET_MOMENTS_MAX_QUEUE + 6; i++) {
      petMoments.show(grant(`s-${i}`));
    }
    const toasts = useToastStore.getState().toasts;
    // Cooldown guard means only one toast fires in the same tick.
    expect(toasts.length).toBe(1);
    expect(toasts[0]?.kind).toBe("info");
  });

  test("queue under cap doesn't drop or toast", () => {
    petMoments.show(grant("a"));
    petMoments.show(grant("b"));
    petMoments.show(grant("c"));
    expect(usePetMomentsStore.getState().queue.length).toBe(2);
    expect(useToastStore.getState().toasts.length).toBe(0);
  });
});

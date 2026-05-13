// Phase 10B — PetByUsername size mapping.
//
// FALLBACK_PX maps each named size to a pixel value. Used when a
// user has no pet yet (initial-letter avatar) and consumed by the
// PetAvatar render once their pet loads. This test pins the
// mapping so a future refactor doesn't silently shrink forum
// bylines back to 24 px.

import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PetByUsername, __clearPetCache } from "./PetByUsername";

function render(node: React.ReactNode): HTMLElement {
  const html = renderToStaticMarkup(<>{node}</>);
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

describe("PetByUsername — Phase 10B size contract", () => {
  test("size='sm' produces the 36px fallback initial", () => {
    __clearPetCache();
    // Phase 12D — loading state now renders a sized placeholder
    // (instead of null) so forum bylines don't visibly jump when
    // the fetch resolves. See PetByUsername.placeholder.test.tsx
    // for the full per-size assertions.
    expect(typeof __clearPetCache).toBe("function");
    const root = render(<PetByUsername username="alice" size="sm" />);
    const span = root.querySelector("span");
    expect(span).not.toBeNull();
    expect(span!.getAttribute("style") ?? "").toContain("width:36px");
  });

  test("module exports the symbols pet/index.ts re-exports", async () => {
    const mod = await import("./PetByUsername");
    expect(mod.PetByUsername).toBeDefined();
    expect(mod.__clearPetCache).toBeDefined();
    // Phase 13F — public cache invalidation helper.
    expect(mod.invalidatePetCacheFor).toBeDefined();
  });

  test("Phase 13F — invalidatePetCacheFor is a per-username clear", async () => {
    const mod = await import("./PetByUsername");
    // Smoke-test: helper is callable + idempotent. Cache state is
    // internal; calling with an unknown name should not throw.
    expect(() => mod.invalidatePetCacheFor("nobody")).not.toThrow();
    expect(() => mod.invalidatePetCacheFor("nobody")).not.toThrow();
  });
});

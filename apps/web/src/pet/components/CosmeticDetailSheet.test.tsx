// Phase 15G — CosmeticDetailSheet behavior pinning.
//
// Existing coverage was indirect (Esc-stack hook test, render
// tests for sibling components). This file pins:
//   - Auto-focus on Equip button after open
//   - Esc-stack wiring fires onClose
//   - Focus restoration to the invoking element on close
//
// jsdom env; we mount real DOM nodes via react-dom/client + act().

import { describe, expect, test, beforeEach, vi } from "vitest";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { CosmeticDetailSheet } from "./CosmeticDetailSheet";
import type { PetInventoryItem } from "@axiomic/types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const item: PetInventoryItem = {
  id: "inv-1",
  slug: "study-cap",
  name: "Study Cap",
  slot: "head",
  emoji: null,
  rarity: "common",
  description: "A favorite of late-night learners.",
  equipped: false,
  acquiredAt: "2026-01-01T00:00:00Z",
  grantedNote: null,
  failSmall: false,
};

function pressEscape(): void {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
}

describe("CosmeticDetailSheet — Phase 15G behavior pin", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    if (root) {
      act(() => root!.unmount());
      root = null;
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  test("auto-focuses the Equip button after open (50ms defer)", async () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      const onToggle = vi.fn();
      root = createRoot(container!);
      act(() => {
        root!.render(
          <CosmeticDetailSheet
            open
            onClose={onClose}
            item={item}
            petSpecies="cat"
            petLevel={1}
            equipped={{}}
            onToggleEquip={onToggle}
          />,
        );
      });
      // Advance past the 50ms focus deferral.
      act(() => {
        vi.advanceTimersByTime(60);
      });
      const active = document.activeElement;
      expect(active).not.toBeNull();
      // The Equip button label flips based on equipped state. The
      // primary action ref is wired to the Equip-or-Unequip button.
      expect((active as HTMLElement)?.tagName).toBe("BUTTON");
      const text = (active as HTMLElement)?.textContent ?? "";
      expect(text.toLowerCase()).toContain("equip");
    } finally {
      vi.useRealTimers();
    }
  });

  test("Esc fires onClose via the escape-stack", () => {
    const onClose = vi.fn();
    const onToggle = vi.fn();
    root = createRoot(container!);
    act(() => {
      root!.render(
        <CosmeticDetailSheet
          open
          onClose={onClose}
          item={item}
          petSpecies="cat"
          petLevel={1}
          equipped={{}}
          onToggleEquip={onToggle}
        />,
      );
    });
    pressEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("restores focus to the invoking element when open flips to false", async () => {
    vi.useFakeTimers();
    try {
      // The trigger lives in a SIBLING node so React's render
      // pass doesn't unmount it. We focus it, then mount the
      // sheet in its own container.
      const trigger = document.createElement("button");
      trigger.textContent = "Open";
      document.body.appendChild(trigger);
      trigger.focus();
      expect(document.activeElement).toBe(trigger);

      const onClose = vi.fn();
      const onToggle = vi.fn();
      root = createRoot(container!);

      try {
        // Render with open=true (captures previouslyFocused = trigger).
        act(() => {
          root!.render(
            <CosmeticDetailSheet
              open
              onClose={onClose}
              item={item}
              petSpecies="cat"
              petLevel={1}
              equipped={{}}
              onToggleEquip={onToggle}
            />,
          );
        });
        // Drain the 50ms focus deferral so the Equip button now owns
        // focus.
        act(() => {
          vi.advanceTimersByTime(60);
        });
        // Sanity check: focus moved to the sheet.
        expect(document.activeElement).not.toBe(trigger);

        // Now close the sheet. The effect cleanup should restore
        // focus to the trigger.
        act(() => {
          root!.render(
            <CosmeticDetailSheet
              open={false}
              onClose={onClose}
              item={item}
              petSpecies="cat"
              petLevel={1}
              equipped={{}}
              onToggleEquip={onToggle}
            />,
          );
        });
        expect(document.activeElement).toBe(trigger);
      } finally {
        document.body.removeChild(trigger);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});

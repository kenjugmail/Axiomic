// Phase 1 — PetActionsRow tests.
// Server-rendered DOM check: all 5 actions render as buttons, each
// with the right testid + label.

import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PetActionsRow } from "./PetActionsRow";

function render(node: React.ReactNode): HTMLElement {
  const html = renderToStaticMarkup(<>{node}</>);
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

describe("PetActionsRow — Phase 1", () => {
  test("renders all 5 action buttons", () => {
    const root = render(<PetActionsRow onAction={() => {}} />);
    const buttons = Array.from(root.querySelectorAll("button"));
    expect(buttons).toHaveLength(5);
    const testIds = buttons.map((b) => b.getAttribute("data-testid"));
    expect(testIds).toEqual([
      "pet-action-pat",
      "pet-action-wiggle",
      "pet-action-twirl",
      "pet-action-hop",
      "pet-action-sniff",
    ]);
  });

  test("button labels match the prototype copy", () => {
    const root = render(<PetActionsRow onAction={() => {}} />);
    const labels = Array.from(root.querySelectorAll("button")).map((b) =>
      b.textContent?.trim(),
    );
    expect(labels).toEqual(["Pat", "Wiggle", "Twirl", "Hop", "Sniff"]);
  });

  test("every button gets an aria-label for screen readers", () => {
    const root = render(<PetActionsRow onAction={() => {}} />);
    for (const b of Array.from(root.querySelectorAll("button"))) {
      const aria = b.getAttribute("aria-label");
      expect(aria, "every action button should expose an aria-label").toMatch(
        / your pet$/,
      );
    }
  });

  test("disabled prop disables every action", () => {
    const root = render(<PetActionsRow onAction={() => {}} disabled />);
    for (const b of Array.from(root.querySelectorAll("button"))) {
      // The static markup keeps the disabled attribute as an empty
      // string; check for its presence rather than equality.
      expect(b.hasAttribute("disabled")).toBe(true);
    }
  });
});

// Phase M — RarityBadge tests.

import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RarityBadge } from "./RarityBadge";

function render(node: React.ReactNode): HTMLElement {
  const html = renderToStaticMarkup(<>{node}</>);
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

describe("RarityBadge — Phase M", () => {
  test("each rarity gets its own class (drives shape via pet-tokens.css)", () => {
    for (const rarity of ["common", "rare", "epic", "legendary"] as const) {
      const root = render(<RarityBadge rarity={rarity} />);
      const span = root.querySelector(".rar");
      expect(span, `rarity=${rarity} should render a .rar element`).not.toBeNull();
      expect(span!.className).toContain(rarity);
      // aria-label exposes the rarity for screen readers.
      expect(span!.getAttribute("aria-label")).toBe(`Rarity: ${rarity}`);
    }
  });

  test("compact mode hides the label but keeps the glyph", () => {
    const root = render(<RarityBadge rarity="legendary" compact />);
    const span = root.querySelector(".rar");
    expect(span).not.toBeNull();
    // Compact still has the glyph (unicode lozenge/star) but no label text.
    expect(span!.querySelector(".glyph")).not.toBeNull();
    // Text content should be just the glyph (1-2 chars), not "legendary".
    expect(span!.textContent).not.toContain("legendary");
  });

  test("non-compact shows the label", () => {
    const root = render(<RarityBadge rarity="epic" />);
    const span = root.querySelector(".rar");
    expect(span!.textContent).toContain("epic");
  });
});

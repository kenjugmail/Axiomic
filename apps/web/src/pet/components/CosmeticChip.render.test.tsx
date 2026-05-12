// Phase 9 polish — pin the CosmeticChip render contract.
// Confirms the tile structure (corner badge, glyph, name, rarity
// badge, equip status indicator) lands correctly across owned /
// unowned / equipped variants.

import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CosmeticChip } from "./CosmeticChip";

function render(node: React.ReactNode): HTMLElement {
  const html = renderToStaticMarkup(<>{node}</>);
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

describe("CosmeticChip — render contract", () => {
  test("owned + equipped renders the .equipped class", () => {
    const root = render(
      <CosmeticChip
        slug="study-cap"
        name="Study Cap"
        slot="head"
        rarity="common"
        owned
        equipped
      />,
    );
    const tile = root.querySelector(".cos-tile");
    expect(tile).not.toBeNull();
    expect(tile!.className).toContain("equipped");
    expect(tile!.className).toContain("owned");
    expect(tile!.className).not.toContain("unowned");
  });

  test("unowned renders the .unowned class", () => {
    const root = render(
      <CosmeticChip
        slug="top-hat"
        name="Top Hat"
        slot="head"
        rarity="epic"
        owned={false}
      />,
    );
    const tile = root.querySelector(".cos-tile");
    expect(tile!.className).toContain("unowned");
    expect(tile!.className).not.toContain("equipped");
  });

  test("Phase 9C — slot label no longer rendered", () => {
    const root = render(
      <CosmeticChip
        slug="study-cap"
        name="Study Cap"
        slot="head"
        rarity="common"
        owned
      />,
    );
    // The text "head" / "HEAD" should NOT appear as a tile label.
    // (RarityBadge could include the rarity letter but not "head".)
    const text = root.textContent ?? "";
    expect(text).not.toMatch(/\bHEAD\b/);
  });

  test("rarity class lands on the tile", () => {
    const root = render(
      <CosmeticChip
        slug="quill-inkwell"
        name="Quill"
        slot="accessory"
        rarity="legendary"
        owned
      />,
    );
    const tile = root.querySelector(".cos-tile");
    expect(tile!.className).toContain("legendary");
  });

  test("renders the glyph SVG inside the .glyph slot", () => {
    const root = render(
      <CosmeticChip
        slug="study-cap"
        name="Study Cap"
        slot="head"
        rarity="common"
        owned
      />,
    );
    const glyph = root.querySelector(".glyph svg");
    expect(glyph).not.toBeNull();
    expect(glyph!.getAttribute("viewBox")).toBe("0 0 60 60");
  });
});

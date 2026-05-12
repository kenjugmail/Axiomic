// Phase M — SkinTile render tests.

import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SkinTile } from "./SkinTile";
import type { PetSkinDef } from "@axiomic/types";

function render(node: React.ReactNode): HTMLElement {
  const html = renderToStaticMarkup(<>{node}</>);
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

const baseSkin: PetSkinDef = {
  slug: "verdant",
  name: "Verdant",
  rarity: "common",
  obtain: "xp",
  xpCost: 280,
  description: "Leaf-green",
  fx: {
    filter: "hue-rotate(90deg)",
    opacity: 1,
    glow: { color: "#7ab07a", blur: 10, alpha: 0.3 },
    bg: null,
    particles: null,
    ring: "#a8c486",
    animated: null,
  },
};

const legendarySkin: PetSkinDef = {
  ...baseSkin,
  slug: "aurora",
  name: "Aurora",
  rarity: "legendary",
  obtain: "grant",
  xpCost: null,
  fx: { ...baseSkin.fx, animated: "aurora" },
};

describe("SkinTile — Phase M", () => {
  test("equipped tile gets aria-pressed=true and the equipped class", () => {
    const root = render(
      <SkinTile skin={baseSkin} owned equipped={true} previewSpecies="cat" />,
    );
    const btn = root.querySelector("button");
    expect(btn?.getAttribute("aria-pressed")).toBe("true");
    expect(btn!.className).toContain("equipped");
    expect(root.textContent).toContain("Equipped");
  });

  test("owned non-equipped tile shows the skin name + 'Owned' meta", () => {
    const root = render(
      <SkinTile skin={baseSkin} owned equipped={false} previewSpecies="cat" />,
    );
    const btn = root.querySelector("button");
    expect(btn!.className).toContain("owned");
    expect(root.textContent).toContain("Verdant");
    expect(root.textContent).toContain("Owned");
  });

  test("unowned tile renders the obtain callout", () => {
    const root = render(
      <SkinTile skin={baseSkin} owned={false} equipped={false} previewSpecies="cat" />,
    );
    const btn = root.querySelector("button");
    expect(btn!.className).toContain("unowned");
    // ObtainabilityCallout for xp 280.
    expect(root.querySelector(".obtain")).not.toBeNull();
    expect(root.textContent).toContain("280");
  });

  test("legendary grant-only skin shows 'Instructor grant' obtain callout", () => {
    const root = render(
      <SkinTile skin={legendarySkin} owned={false} equipped={false} previewSpecies="cat" />,
    );
    expect(root.textContent).toContain("Instructor grant");
  });

  test("legendary skin renders the aurora animation layer in the preview", () => {
    const root = render(
      <SkinTile skin={legendarySkin} owned equipped={true} previewSpecies="cat" />,
    );
    const aurora = root.querySelector(".pet-anim-aurora");
    expect(aurora).not.toBeNull();
  });

  test("each rarity class is set on the tile (drives gradient bg via pet-tokens.css)", () => {
    const root = render(
      <SkinTile skin={baseSkin} owned equipped={false} previewSpecies="cat" />,
    );
    const btn = root.querySelector(".skin-tile");
    expect(btn!.className).toContain("common");
  });
});

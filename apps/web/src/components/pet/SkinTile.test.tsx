// Phase L — SkinTile render tests.

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

describe("SkinTile — Phase L", () => {
  test("equipped tile gets aria-pressed=true", () => {
    const root = render(
      <SkinTile skin={baseSkin} owned equipped={true} previewSpeciesEmoji="🐱" />,
    );
    const btn = root.querySelector("button");
    expect(btn?.getAttribute("aria-pressed")).toBe("true");
    expect(root.textContent).toContain("equipped");
  });

  test("unequipped owned tile shows the rarity + name and no 'locked' badge", () => {
    const root = render(
      <SkinTile skin={baseSkin} owned equipped={false} previewSpeciesEmoji="🐱" />,
    );
    expect(root.textContent).toContain("Verdant");
    expect(root.textContent).toContain("common");
    expect(root.textContent).not.toContain("locked");
    expect(root.textContent).toContain("280 XP");
  });

  test("unowned tile shows the 'locked' indicator", () => {
    const root = render(
      <SkinTile
        skin={baseSkin}
        owned={false}
        equipped={false}
        previewSpeciesEmoji="🐱"
      />,
    );
    expect(root.textContent).toContain("locked");
  });

  test("legendary grant-only skin shows 'Instructor grant' obtain hint", () => {
    const root = render(
      <SkinTile
        skin={legendarySkin}
        owned={false}
        equipped={false}
        previewSpeciesEmoji="🐱"
      />,
    );
    expect(root.textContent).toContain("Instructor grant");
  });

  test("legendary skin renders the aurora animation layer in the preview", () => {
    const root = render(
      <SkinTile
        skin={legendarySkin}
        owned
        equipped={true}
        previewSpeciesEmoji="🐱"
      />,
    );
    // The mini-PetAvatar preview inside should include the animated layer.
    const aurora = root.querySelector(".pet-anim-aurora");
    expect(aurora).not.toBeNull();
  });
});

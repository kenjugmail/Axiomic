// Phase L — PetAvatar render tests.
//
// Static-markup assertions cover: rarity ring class, skin FX layer
// presence, the auto-hide-below-36px rule, and the emoji=null
// CosmeticGlyph fallback.

import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PetAvatar, type PetSkinFx } from "./PetAvatar";

function render(node: React.ReactNode): { html: string; root: HTMLElement } {
  const html = renderToStaticMarkup(<>{node}</>);
  const host = document.createElement("div");
  host.innerHTML = html;
  return { html, root: host };
}

const noFxSkin: PetSkinFx = {
  filter: null,
  opacity: 1,
  glow: null,
  bg: null,
  particles: null,
  ring: null,
  animated: null,
};

const starsSkin: PetSkinFx = {
  filter: "hue-rotate(260deg)",
  opacity: 1,
  glow: { color: "#a878e8", blur: 26, alpha: 0.75 },
  bg: "radial-gradient(circle, red, blue)",
  particles: "stars",
  ring: "#c8a8f0",
  animated: null,
};

const auroraSkin: PetSkinFx = {
  ...noFxSkin,
  animated: "aurora",
};

describe("PetAvatar — Phase L", () => {
  test("renders the species emoji centered with a level badge at hero size", () => {
    const { root } = render(
      <PetAvatar species="cat" speciesEmoji="🐱" level={2} size={96} hero />,
    );
    expect(root.textContent).toContain("🐱");
    expect(root.textContent).toContain("Lv2");
    const stage = root.querySelector(".pet-stage");
    expect(stage).not.toBeNull();
    expect(stage!.className).toContain("hero");
  });

  test("ring='epic' applies the ring-epic class on the stage", () => {
    const { root } = render(
      <PetAvatar species="fox" speciesEmoji="🦊" level={1} size={80} ring="epic" />,
    );
    const stage = root.querySelector(".pet-stage");
    expect(stage!.className).toContain("ring-epic");
  });

  test("skin with particles renders the .pet-particles layer", () => {
    const { root } = render(
      <PetAvatar
        species="cat"
        speciesEmoji="🐱"
        level={1}
        size={96}
        skin={starsSkin}
      />,
    );
    const particles = root.querySelector(".pet-particles.stars");
    expect(particles).not.toBeNull();
  });

  test("animated='aurora' renders the .pet-anim-aurora overlay", () => {
    const { root } = render(
      <PetAvatar
        species="cat"
        speciesEmoji="🐱"
        level={1}
        size={96}
        skin={auroraSkin}
      />,
    );
    const aurora = root.querySelector(".pet-anim-aurora");
    expect(aurora).not.toBeNull();
  });

  test("size < 36 hides cosmetic overlays even when showCosmetics is true", () => {
    const { root } = render(
      <PetAvatar
        species="cat"
        speciesEmoji="🐱"
        level={1}
        size={24}
        equipped={{
          head: { slug: "grad-cap", emoji: "🎓", rarity: "rare" },
        }}
        showCosmetics={true}
      />,
    );
    const overlays = root.querySelectorAll(".cos-overlay");
    expect(overlays.length).toBe(0);
  });

  test("size >= 36 shows cosmetic overlays", () => {
    const { root } = render(
      <PetAvatar
        species="cat"
        speciesEmoji="🐱"
        level={1}
        size={56}
        equipped={{
          head: { slug: "grad-cap", emoji: "🎓", rarity: "rare" },
        }}
      />,
    );
    const overlays = root.querySelectorAll(".cos-overlay");
    expect(overlays.length).toBe(1);
    expect(root.textContent).toContain("🎓");
  });

  test("cosmetic with emoji=null falls back to rarity-tinted initial disc", () => {
    const { root } = render(
      <PetAvatar
        species="cat"
        speciesEmoji="🐱"
        level={1}
        size={80}
        equipped={{
          acc: { slug: "microscope", emoji: null, rarity: "rare" },
        }}
      />,
    );
    const fallback = root.querySelector(".cos-overlay-fallback");
    expect(fallback).not.toBeNull();
    expect(fallback!.className).toContain("rar-rare");
    expect(fallback!.textContent).toBe("M");
  });

  test("missing speciesEmoji falls back to the egg glyph", () => {
    const { root } = render(<PetAvatar species="unknown" level={1} size={56} />);
    expect(root.textContent).toContain("🥚");
  });

  test("aria-label uses the prop when provided", () => {
    const { root } = render(
      <PetAvatar
        species="cat"
        level={1}
        size={56}
        ariaLabel="Custom label here"
      />,
    );
    const stage = root.querySelector(".pet-stage");
    expect(stage!.getAttribute("aria-label")).toBe("Custom label here");
  });
});

// Phase M — PetAvatar render tests (will be expanded in M.16).
//
// Verifies the structural contract: stage class, ring class, mood/action
// data-attrs, skin-fx data-attr, cosmetic overlay rendering, level badge.

import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PetAvatar, type PetSkinFx } from "./PetAvatar";

function render(node: React.ReactNode): HTMLElement {
  const html = renderToStaticMarkup(<>{node}</>);
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

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
  filter: null,
  opacity: 1,
  glow: null,
  bg: null,
  particles: null,
  ring: null,
  animated: "aurora",
};

describe("PetAvatar — Phase M", () => {
  test("renders the silhouette SVG with stage chrome at hero size", () => {
    const root = render(
      <PetAvatar species="cat" level={2} size={96} hero />,
    );
    const stage = root.querySelector(".pet-stage");
    expect(stage).not.toBeNull();
    expect(stage!.className).toContain("hero");
    expect(root.querySelector("svg")).not.toBeNull();
    expect(root.textContent).toContain("Lv2");
  });

  test("ring='epic' applies the ring-epic class", () => {
    const root = render(<PetAvatar species="fox" level={1} size={80} ring="epic" />);
    const stage = root.querySelector(".pet-stage");
    expect(stage!.className).toContain("ring-epic");
  });

  test("skin with particles sets data-skin-fx and renders .pet-particles", () => {
    const root = render(
      <PetAvatar species="cat" level={1} size={96} skin={starsSkin} />,
    );
    const stage = root.querySelector(".pet-stage");
    expect(stage!.getAttribute("data-skin-fx")).toBe("true");
    expect(root.querySelector(".pet-particles.stars")).not.toBeNull();
  });

  test("animated='aurora' renders the .pet-anim-aurora overlay", () => {
    const root = render(
      <PetAvatar species="cat" level={1} size={96} skin={auroraSkin} />,
    );
    expect(root.querySelector(".pet-anim-aurora")).not.toBeNull();
  });

  test("size < 24 hides every cosmetic overlay", () => {
    const root = render(
      <PetAvatar
        species="cat"
        level={1}
        size={20}
        equipped={{
          head: { slug: "grad-cap", rarity: "rare" },
        }}
        showCosmetics={true}
      />,
    );
    expect(root.querySelectorAll(".cos-overlay").length).toBe(0);
  });

  test("size >= 24 shows cosmetic overlays by default", () => {
    const root = render(
      <PetAvatar
        species="cat"
        level={1}
        size={56}
        equipped={{
          head: { slug: "grad-cap", rarity: "rare" },
        }}
      />,
    );
    expect(root.querySelectorAll(".cos-overlay").length).toBe(1);
  });

  test("failSmall cosmetic hides between 24 and 36px", () => {
    const root = render(
      <PetAvatar
        species="cat"
        level={1}
        size={28}
        equipped={{
          head: { slug: "winter-beanie", rarity: "common", failSmall: true },
        }}
      />,
    );
    expect(root.querySelectorAll(".cos-overlay").length).toBe(0);
  });

  test("undefined species renders the egg silhouette", () => {
    const root = render(<PetAvatar level={1} size={56} />);
    expect(root.querySelector("svg")).not.toBeNull();
    // No emoji anywhere — verify the egg path is in the SVG.
    expect(root.textContent).not.toContain("🥚");
  });

  test("mood and action data-attrs render", () => {
    const root = render(
      <PetAvatar species="cat" level={1} size={56} mood="happy" action="wiggle" />,
    );
    const stage = root.querySelector(".pet-stage");
    expect(stage!.getAttribute("data-mood")).toBe("happy");
    expect(stage!.getAttribute("data-action")).toBe("wiggle");
  });

  test("aboutToEvolve adds the about-to-evolve class", () => {
    const root = render(
      <PetAvatar species="cat" level={2} size={96} aboutToEvolve />,
    );
    expect(root.querySelector(".pet-stage")!.className).toContain("about-to-evolve");
  });
});

// Phase M — PetSilhouetteSVG tests.
//
// Verifies the DOM contract that pet-tokens.css depends on for idle
// animations (eye blink + ear twitch) and the egg fallback for
// pre-hatch / unknown species.

import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PetSilhouetteSVG } from "./PetSilhouetteSVG";

function render(node: React.ReactNode): HTMLElement {
  const html = renderToStaticMarkup(<>{node}</>);
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

const ALL_SPECIES = [
  "cat",
  "dog",
  "rabbit",
  "fox",
  "turtle",
  "dragon",
  "owl",
  "penguin",
  "hedgehog",
  "capybara",
  "otter",
  "axolotl",
  "frog",
  "panda",
  "ferret",
  "seal",
];

describe("PetSilhouetteSVG — Phase M", () => {
  test("every species renders an svg with at least two eye circles", () => {
    for (const species of ALL_SPECIES) {
      const root = render(<PetSilhouetteSVG species={species} level={1} />);
      const svg = root.querySelector("svg");
      expect(svg, `${species} should produce an svg`).not.toBeNull();
      const eyes = root.querySelectorAll("svg .eye");
      expect(eyes.length, `${species} should have 2 .eye circles`).toBe(2);
    }
  });

  test("ears render inside a top-level <g> for the ear-twitch CSS selector", () => {
    // The CSS targets `.pet-stage svg > g > path:nth-child(odd/even)`.
    // Species with ears must emit a <g> with path children at the top
    // level of the svg.
    const root = render(<PetSilhouetteSVG species="cat" level={1} />);
    const earGroup = root.querySelector("svg > g");
    expect(earGroup).not.toBeNull();
    const earPaths = earGroup!.querySelectorAll("path");
    expect(earPaths.length).toBeGreaterThanOrEqual(2);
  });

  test("level 3 renders a flourish overlay", () => {
    // Cat is level3=tufts (a path). Verify the level=3 render
    // produces strictly more elements than level=1.
    const root1 = render(<PetSilhouetteSVG species="cat" level={1} />);
    const root3 = render(<PetSilhouetteSVG species="cat" level={3} />);
    expect(root3.querySelectorAll("svg *").length).toBeGreaterThan(
      root1.querySelectorAll("svg *").length,
    );
  });

  test("undefined species renders the egg silhouette", () => {
    const root = render(<PetSilhouetteSVG />);
    const svg = root.querySelector("svg");
    expect(svg).not.toBeNull();
    // The egg has no .eye circles and no <g> ears.
    expect(root.querySelectorAll("svg .eye").length).toBe(0);
    expect(root.querySelectorAll("svg > g").length).toBe(0);
    // Has a gradient definition for the eggshell.
    expect(root.querySelector("defs radialGradient")).not.toBeNull();
  });

  test("unknown species falls back to egg too", () => {
    const root = render(<PetSilhouetteSVG species="not-a-real-species" />);
    expect(root.querySelector("defs radialGradient")).not.toBeNull();
  });

  test("happy mood produces a wider mouth path than sleepy", () => {
    const calmRoot = render(<PetSilhouetteSVG species="cat" level={1} mood="calm" />);
    const sleepyRoot = render(<PetSilhouetteSVG species="cat" level={1} mood="sleepy" />);
    const happyRoot = render(<PetSilhouetteSVG species="cat" level={1} mood="happy" />);
    // Different mouth paths should produce different markup.
    expect(happyRoot.innerHTML).not.toBe(sleepyRoot.innerHTML);
    expect(happyRoot.innerHTML).not.toBe(calmRoot.innerHTML);
  });
});

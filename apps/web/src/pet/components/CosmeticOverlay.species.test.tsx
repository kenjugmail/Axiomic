// Phase 10D — per-species cosmetic anchor fit.
//
// For each of the 13 hand-drawn species, render a head cosmetic
// (study-cap) and verify the computed `top` value falls within a
// reasonable zone around the species' head anchor — not at the
// viewBox top (where it would appear when the species' head sits
// low in the stage, e.g. hedgehog).

import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CosmeticOverlay } from "./CosmeticOverlay";
import { SPECIES_HEAD_ANCHOR_Y, SPECIES_ACC_DY_BOOST } from "./PetSVG";

function render(node: React.ReactNode): HTMLElement {
  const html = renderToStaticMarkup(<>{node}</>);
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

function topPx(overlay: HTMLElement): number {
  const m = (overlay.getAttribute("style") ?? "").match(/top:\s*(-?\d+)px/);
  expect(m).not.toBeNull();
  return Number(m![1]);
}

function bottomPx(overlay: HTMLElement): number {
  const m = (overlay.getAttribute("style") ?? "").match(/bottom:\s*(-?\d+)px/);
  expect(m).not.toBeNull();
  return Number(m![1]);
}

describe("CosmeticOverlay — Phase 10D per-species fit", () => {
  test("species head anchor map covers all 13 hand-drawn species", () => {
    for (const sp of [
      "cat", "dog", "fox", "owl", "rabbit", "turtle", "dragon",
      "penguin", "bear", "hedgehog", "axolotl", "frog", "panda",
    ]) {
      expect(typeof SPECIES_HEAD_ANCHOR_Y[sp]).toBe("number");
    }
  });

  test("hedgehog (low head) gets a positive head delta vs baseline", () => {
    const baseline = render(
      <CosmeticOverlay slug="study-cap" slot="head" petSize={200} species="cat" />,
    );
    const hedgehog = render(
      <CosmeticOverlay slug="study-cap" slot="head" petSize={200} species="hedgehog" />,
    );
    const tBase = topPx(baseline.querySelector(".cos-overlay") as HTMLElement);
    const tHedgehog = topPx(hedgehog.querySelector(".cos-overlay") as HTMLElement);
    // Hedgehog anchor 0.56 vs baseline 0.46 → +20 px at petSize=200.
    expect(tHedgehog).toBeGreaterThan(tBase);
    expect(tHedgehog - tBase).toBeCloseTo(20, 0);
  });

  test("frog (high head) gets a negative head delta vs baseline", () => {
    const baseline = render(
      <CosmeticOverlay slug="study-cap" slot="head" petSize={200} species="cat" />,
    );
    const frog = render(
      <CosmeticOverlay slug="study-cap" slot="head" petSize={200} species="frog" />,
    );
    const tBase = topPx(baseline.querySelector(".cos-overlay") as HTMLElement);
    const tFrog = topPx(frog.querySelector(".cos-overlay") as HTMLElement);
    // Frog anchor 0.30 vs baseline 0.46 → -32 px at petSize=200.
    expect(tFrog).toBeLessThan(tBase);
    expect(tBase - tFrog).toBeCloseTo(32, 0);
  });

  test("turtle (small head high in stage) shifts head cosmetic up", () => {
    const root = render(
      <CosmeticOverlay slug="study-cap" slot="head" petSize={200} species="turtle" />,
    );
    const tTurtle = topPx(root.querySelector(".cos-overlay") as HTMLElement);
    // Turtle anchor 0.32, baseline 0.46 → -28 px delta + the slug's
    // own -8 px lift = -36 px (baseline study-cap top is -8 at
    // petSize=200, lift=0.06 → -sz*0.06 ≈ -8).
    expect(tTurtle).toBeLessThan(-20);
  });

  test("penguin (tall body) gets boosted acc bottom anchor", () => {
    const baseline = render(
      <CosmeticOverlay slug="office-hours-mug" slot="acc" petSize={200} species="cat" />,
    );
    const penguin = render(
      <CosmeticOverlay slug="office-hours-mug" slot="acc" petSize={200} species="penguin" />,
    );
    const bBase = bottomPx(baseline.querySelector(".cos-overlay") as HTMLElement);
    const bPenguin = bottomPx(penguin.querySelector(".cos-overlay") as HTMLElement);
    expect(bPenguin).toBeGreaterThan(bBase);
    // SPECIES_ACC_DY_BOOST.penguin = 12 → +24 px at petSize=200.
    expect(SPECIES_ACC_DY_BOOST.penguin).toBe(12);
    expect(bPenguin - bBase).toBeCloseTo(24, 0);
  });

  test("unknown species falls back to baseline (no head delta)", () => {
    const cat = render(
      <CosmeticOverlay slug="study-cap" slot="head" petSize={200} species="cat" />,
    );
    const noSpecies = render(
      <CosmeticOverlay slug="study-cap" slot="head" petSize={200} species="capybara" />,
    );
    const tCat = topPx(cat.querySelector(".cos-overlay") as HTMLElement);
    const tCapy = topPx(noSpecies.querySelector(".cos-overlay") as HTMLElement);
    expect(tCapy).toBe(tCat);
  });
});

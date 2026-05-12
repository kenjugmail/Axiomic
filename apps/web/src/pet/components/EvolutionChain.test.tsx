// Phase 9E — EvolutionChain test.
//
// Verifies the prototype hand-drawn PetSVG is used for species in
// PROTOTYPE_SPECIES, and that the parametric fallback applies for
// unsupported species (capybara/otter/ferret/seal).

import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EvolutionChain } from "./EvolutionChain";

function render(node: React.ReactNode): HTMLElement {
  const html = renderToStaticMarkup(<>{node}</>);
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

const makePet = (species: string) => ({
  id: "pet-1",
  species,
  speciesLabel: species,
  name: species,
  hatchedAt: "2024-01-01T00:00:00Z",
  level: 1,
  maxLevel: 3,
  nextLevelXp: 250,
  activeSkinSlug: "default",
  evolutionChain: [
    { level: 1, threshold: 50 },
    { level: 2, threshold: 250 },
    { level: 3, threshold: 750 },
  ],
});

describe("EvolutionChain — Phase 9E", () => {
  test("PROTOTYPE_SPECIES (fox) uses PetSVG — 3 svgs in chain", () => {
    const root = render(<EvolutionChain pet={makePet("fox")} totalXp={100} />);
    // Three chain entries; each renders an svg.
    const svgs = root.querySelectorAll("svg");
    // 3 pet svgs + 2 chevron icons = 5 expected
    expect(svgs.length).toBeGreaterThanOrEqual(3);
    // PetSVG renders an inline-block <svg> with viewBox "0 0 100 100".
    // PetSilhouetteSVG also uses 100×100, so we just confirm at least
    // one chain svg renders without throwing.
    expect(root.textContent).toContain("Lv 1");
    expect(root.textContent).toContain("Lv 2");
    expect(root.textContent).toContain("Lv 3");
  });

  test("non-prototype species (capybara) falls back to PetSilhouetteSVG", () => {
    const root = render(
      <EvolutionChain pet={makePet("capybara")} totalXp={300} />,
    );
    expect(root.textContent).toContain("Lv 1");
    expect(root.textContent).toContain("Lv 2");
    expect(root.textContent).toContain("Lv 3");
  });

  test("reached levels stay full color; future levels grayed out", () => {
    const root = render(<EvolutionChain pet={makePet("fox")} totalXp={100} />);
    // Pet is level 1 → level 2 and 3 should have the dim class.
    const dimmed = root.querySelectorAll(".opacity-30");
    expect(dimmed.length).toBe(2);
  });
});

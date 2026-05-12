// Phase 9 polish — end-to-end PetAvatar render with all 3 starter
// cosmetics. Pins the slot routing so a future bug like the
// "everything renders as accessory" regression gets caught.

import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PetAvatar } from "./PetAvatar";

function render(node: React.ReactNode): HTMLElement {
  const html = renderToStaticMarkup(<>{node}</>);
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

describe("PetAvatar — three-cosmetic render contract", () => {
  test("all 3 starter slots produce overlays at the right positions", () => {
    const root = render(
      <PetAvatar
        species="fox"
        level={1}
        size={200}
        equipped={{
          head: { slug: "study-cap", rarity: "common" },
          // eyes-slot renders via PetSVG EyeKindContext, not as a
          // .cos-overlay sibling.
          eyes: { slug: "glasses", rarity: "common" },
          acc: { slug: "office-hours-mug", rarity: "rare" },
        }}
        hero
      />,
    );
    const overlays = Array.from(
      root.querySelectorAll<HTMLElement>(".cos-overlay"),
    );
    // Two overlay siblings expected (head + acc). Eyes lives inside
    // the pet svg.
    expect(overlays.length).toBe(2);

    const headOverlay = overlays[0]!;
    const accOverlay = overlays[1]!;

    const headStyle = headOverlay.getAttribute("style") ?? "";
    const accStyle = accOverlay.getAttribute("style") ?? "";

    // Head positioning: small negative-px top + translateX(-50%) + rotate(-3deg)
    expect(headStyle).toMatch(/top:\s*-\d+px/);
    expect(headStyle).toContain("translateX(-50%)");
    expect(headStyle).toContain("rotate(-3deg)");

    // Acc positioning: bottom+right offsets + rotate
    expect(accStyle).toMatch(/bottom:\s*\d+px/);
    expect(accStyle).toMatch(/right:\s*-?\d+px/);
    expect(accStyle).toMatch(/rotate\(-?\d+deg\)/);

    // No remnant of the old broken percent-based bug.
    expect(headStyle).not.toMatch(/top:\s*-18%/);

    // Lv badge SHOULD show at hero=true size 200.
    expect(root.textContent).toContain("Lv1");
  });

  test("when only head equipped, no acc overlay renders", () => {
    const root = render(
      <PetAvatar
        species="fox"
        level={1}
        size={200}
        equipped={{ head: { slug: "study-cap", rarity: "common" } }}
        hero
      />,
    );
    expect(root.querySelectorAll(".cos-overlay").length).toBe(1);
  });

  test("at small sizes, cosmetics still render but Lv hides", () => {
    // 56 px shows cosmetics but should NOT show Lv badge.
    const root = render(
      <PetAvatar
        species="fox"
        level={2}
        size={56}
        equipped={{ head: { slug: "study-cap", rarity: "common" } }}
      />,
    );
    expect(root.querySelectorAll(".cos-overlay").length).toBe(1);
    expect(root.textContent).not.toContain("Lv2");
  });

  test("prototype species (fox) renders via PetSVG (100x100 viewBox)", () => {
    const root = render(<PetAvatar species="fox" level={1} size={80} />);
    const svgs = Array.from(root.querySelectorAll("svg"));
    const has100 = svgs.some(
      (s) => s.getAttribute("viewBox") === "0 0 100 100",
    );
    expect(has100).toBe(true);
  });
});

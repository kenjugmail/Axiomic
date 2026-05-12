// Phase 9A — CosmeticOverlay positioning test.
//
// The old SLOT_STYLE used percent-based top values that didn't
// account for each cosmetic's anchor. This test pins the per-slot
// + per-slug positioning so the cap sits ON the head, not below it.

import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CosmeticOverlay } from "./CosmeticOverlay";

function styleOf(overlay: HTMLElement): string {
  return overlay.getAttribute("style") ?? "";
}

function render(node: React.ReactNode): HTMLElement {
  const html = renderToStaticMarkup(<>{node}</>);
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

describe("CosmeticOverlay — Phase 9A", () => {
  test("study-cap head: small negative-px top + translateX(-50%) + rotate(-3deg)", () => {
    // petSize=156 (=200*0.78); head baseSz=156*0.66≈103;
    // HEAD_OFFSET["study-cap"]=0.06; top=round(-103 * 0.06)=-6 px.
    const root = render(
      <CosmeticOverlay slug="study-cap" slot="head" petSize={156} />,
    );
    const overlay = root.querySelector(".cos-overlay") as HTMLElement;
    expect(overlay).not.toBeNull();
    const style = styleOf(overlay);
    expect(style).toMatch(/top\s*:\s*-6px/);
    expect(style).toContain("left:50%");
    expect(style).toContain("translateX(-50%)");
    expect(style).toContain("rotate(-3deg)");
    // Never use the broken percent positioning.
    expect(style).not.toMatch(/top\s*:\s*-?\d+%/);
  });

  test("honor-roll-halo lifts much higher than study-cap", () => {
    // HEAD_OFFSET["honor-roll-halo"]=0.34; top=round(-103 * 0.34)=-35.
    const root = render(
      <CosmeticOverlay slug="honor-roll-halo" slot="head" petSize={156} />,
    );
    const overlay = root.querySelector(".cos-overlay") as HTMLElement;
    const style = styleOf(overlay);
    expect(style).toMatch(/top\s*:\s*-35px/);
  });

  test("laurel-wreath sits BELOW the top of head (positive top)", () => {
    // HEAD_OFFSET["laurel-wreath"]=-0.04; top=round(-103 * -0.04)=4.
    const root = render(
      <CosmeticOverlay slug="laurel-wreath" slot="head" petSize={156} />,
    );
    const overlay = root.querySelector(".cos-overlay") as HTMLElement;
    const style = styleOf(overlay);
    expect(style).toMatch(/top\s*:\s*4px/);
  });

  test("office-hours-mug acc: bottom + right offsets + rotate(2deg)", () => {
    // ACC_TUNE["office-hours-mug"] = { dx:-4, dy:6, rot:2, s:0.92 }.
    // bottom = round(156 * 6/100) = 9; right = round(156 * -4/100) = -6.
    const root = render(
      <CosmeticOverlay slug="office-hours-mug" slot="acc" petSize={156} />,
    );
    const overlay = root.querySelector(".cos-overlay") as HTMLElement;
    const style = styleOf(overlay);
    expect(style).toMatch(/bottom\s*:\s*9px/);
    expect(style).toMatch(/right\s*:\s*-6px/);
    expect(style).toContain("rotate(2deg)");
  });

  test("unknown slug head: falls back to 0.1 lift", () => {
    // top = round(-103 * 0.1) = -10.
    const root = render(
      <CosmeticOverlay slug="unknown-cap" slot="head" petSize={156} />,
    );
    const overlay = root.querySelector(".cos-overlay") as HTMLElement;
    const style = styleOf(overlay);
    expect(style).toMatch(/top\s*:\s*-10px/);
  });

  test("eyes slot: top = 34% of petSize px, centered", () => {
    // top = round(156 * 0.34) = 53 px.
    const root = render(
      <CosmeticOverlay slug="glasses" slot="eyes" petSize={156} />,
    );
    const overlay = root.querySelector(".cos-overlay") as HTMLElement;
    const style = styleOf(overlay);
    expect(style).toMatch(/top\s*:\s*53px/);
    expect(style).toContain("left:50%");
    expect(style).toContain("translateX(-50%)");
  });
});

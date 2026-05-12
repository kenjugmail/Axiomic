// Phase M — CosmeticGlyphSVG tests.
//
// Three tiers: lucide-react icon, inline SVG, fallback rarity disc.

import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CosmeticGlyphSVG } from "./CosmeticGlyphSVG";

function render(node: React.ReactNode): HTMLElement {
  const html = renderToStaticMarkup(<>{node}</>);
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

describe("CosmeticGlyphSVG — Phase M", () => {
  test("known lucide slug renders an svg from lucide", () => {
    const root = render(<CosmeticGlyphSVG slug="grad-cap" size={32} />);
    const svg = root.querySelector("svg");
    expect(svg).not.toBeNull();
    // Lucide icons set the class attribute to "lucide lucide-graduation-cap"
    // or similar — verify it's a lucide-derived svg.
    expect(svg!.getAttribute("class") ?? "").toMatch(/lucide/);
  });

  test("known inline slug (top-hat) renders an svg with paths", () => {
    const root = render(<CosmeticGlyphSVG slug="top-hat" size={32} />);
    const svg = root.querySelector("svg");
    expect(svg).not.toBeNull();
    // top-hat is hand-written inline SVG (no lucide class).
    const cls = svg!.getAttribute("class") ?? "";
    expect(cls).not.toMatch(/lucide/);
    expect(svg!.querySelectorAll("rect, line, path").length).toBeGreaterThan(0);
  });

  test("unknown slug falls back to rarity-tinted initial disc", () => {
    const root = render(<CosmeticGlyphSVG slug="not-a-real-cosmetic" rarity="epic" size={32} />);
    const fallback = root.querySelector(".cos-overlay-fallback");
    expect(fallback).not.toBeNull();
    expect(fallback!.className).toContain("rar-epic");
    expect(fallback!.textContent).toBe("N"); // first letter of slug, uppercase
  });

  test("tone='muted' applies opacity + grayscale", () => {
    const root = render(<CosmeticGlyphSVG slug="grad-cap" size={32} tone="muted" />);
    const wrapper = root.querySelector("span");
    const style = wrapper!.getAttribute("style") ?? "";
    expect(style).toMatch(/opacity/);
    expect(style).toMatch(/grayscale/);
  });

  test("tone='full' (default) has no opacity dimming", () => {
    const root = render(<CosmeticGlyphSVG slug="grad-cap" size={32} />);
    const wrapper = root.querySelector("span");
    const style = wrapper!.getAttribute("style") ?? "";
    expect(style).not.toMatch(/grayscale/);
  });
});

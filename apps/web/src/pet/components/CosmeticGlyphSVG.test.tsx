// Phase 8B — CosmeticGlyphSVG bespoke-art coverage test.
//
// Two tiers post-Phase-8B: bespoke 60×60 SVG (every slug in the
// catalog), and a rarity-tinted initial-disc fallback for unknown
// slugs. This file replaces the Phase M lucide-or-inline assertions.

import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "fs";
import path from "path";
import { CosmeticGlyphSVG, __BESPOKE_GLYPH_SLUGS } from "./CosmeticGlyphSVG";

const SEED_FILE = path.resolve(
  __dirname,
  "../../../../../seed-content/pet-cosmetics/cosmetics.json",
);

function loadCatalogSlugs(): string[] {
  const raw = fs.readFileSync(SEED_FILE, "utf-8");
  const parsed = JSON.parse(raw) as { cosmetics: Array<{ slug: string }> };
  return parsed.cosmetics.map((c) => c.slug);
}

function renderHTML(node: React.ReactNode): HTMLElement {
  const html = renderToStaticMarkup(<>{node}</>);
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

describe("CosmeticGlyphSVG — Phase 8B (bespoke art)", () => {
  const catalogSlugs = loadCatalogSlugs();

  test("every seed-catalog slug has bespoke art", () => {
    const bespoke = new Set(__BESPOKE_GLYPH_SLUGS);
    const missing = catalogSlugs.filter((s) => !bespoke.has(s));
    expect(missing).toEqual([]);
  });

  test.each(catalogSlugs)("renders a 60x60 svg for %s", (slug) => {
    const root = renderHTML(<CosmeticGlyphSVG slug={slug} size={48} />);
    const svg = root.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("viewBox")).toBe("0 0 60 60");
    expect(svg!.children.length).toBeGreaterThan(0);
  });

  test("unknown slug falls back to a rarity-tinted disc", () => {
    const root = renderHTML(
      <CosmeticGlyphSVG slug="not-a-real-cosmetic" rarity="epic" size={32} />,
    );
    expect(root.querySelector("svg")).toBeNull();
    const fallback = root.querySelector(".cos-overlay-fallback");
    expect(fallback).not.toBeNull();
    expect(fallback!.className).toContain("rar-epic");
    expect(fallback!.textContent).toBe("N");
  });

  test("tone='muted' applies opacity + grayscale", () => {
    const root = renderHTML(
      <CosmeticGlyphSVG slug="grad-cap" size={32} tone="muted" />,
    );
    const wrapper = root.querySelector("span");
    const style = wrapper!.getAttribute("style") ?? "";
    expect(style).toMatch(/opacity/);
    expect(style).toMatch(/grayscale/);
  });

  test("tone='full' (default) has no grayscale dimming", () => {
    const root = renderHTML(
      <CosmeticGlyphSVG slug="grad-cap" size={32} />,
    );
    const wrapper = root.querySelector("span");
    const style = wrapper!.getAttribute("style") ?? "";
    expect(style).not.toMatch(/grayscale/);
  });
});

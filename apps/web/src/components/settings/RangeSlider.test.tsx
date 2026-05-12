// Phase N — RangeSlider tests.

import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RangeSlider } from "./RangeSlider";

function render(node: React.ReactNode): string {
  return renderToStaticMarkup(<>{node}</>);
}

describe("RangeSlider", () => {
  test("renders label, default value display, and a range input", () => {
    const html = render(
      <RangeSlider label="Pet density" value={0.5} onChange={() => {}} />,
    );
    expect(html).toContain("Pet density");
    expect(html).toContain('type="range"');
    expect(html).toContain("0.50"); // default 2-decimal format
  });

  test("custom format function renders the formatted value", () => {
    const html = render(
      <RangeSlider
        label="Pet density"
        value={0.5}
        onChange={() => {}}
        format={(v) => `${Math.round(24 + v * 16)}px`}
      />,
    );
    expect(html).toContain("32px");
  });

  test("description renders below the slider when provided", () => {
    const html = render(
      <RangeSlider
        label="Rarity intensity"
        description="Strength of the legendary glow."
        value={0.6}
        onChange={() => {}}
      />,
    );
    expect(html).toContain("Strength of the legendary glow.");
  });

  test("aria-label mirrors the visible label for screen readers", () => {
    const html = render(
      <RangeSlider label="Pet density" value={0.5} onChange={() => {}} />,
    );
    expect(html).toMatch(/aria-label="Pet density"/);
  });

  test("test id propagates to the range input when provided", () => {
    const html = render(
      <RangeSlider
        label="Density"
        value={0.5}
        onChange={() => {}}
        testId="density-slider"
      />,
    );
    expect(html).toMatch(/data-testid="density-slider"/);
  });
});

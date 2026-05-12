// Phase M — ObtainabilityCallout tests.

import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ObtainabilityCallout } from "./ObtainabilityCallout";

function render(node: React.ReactNode): HTMLElement {
  const html = renderToStaticMarkup(<>{node}</>);
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

describe("ObtainabilityCallout — Phase M", () => {
  test("xp obtain with cost shows the cost", () => {
    const root = render(<ObtainabilityCallout obtain="xp" cost={420} />);
    const span = root.querySelector(".obtain");
    expect(span).not.toBeNull();
    expect(span!.className).toContain("xp");
    expect(span!.textContent).toContain("420");
    expect(span!.textContent).toContain("XP");
  });

  test("xp obtain without cost shows 'XP shop' fallback", () => {
    const root = render(<ObtainabilityCallout obtain="xp" />);
    const span = root.querySelector(".obtain");
    expect(span!.textContent).toContain("XP shop");
  });

  test("grant obtain shows 'Instructor grant'", () => {
    const root = render(<ObtainabilityCallout obtain="grant" />);
    const span = root.querySelector(".obtain");
    expect(span!.className).toContain("grant");
    expect(span!.textContent).toContain("Instructor grant");
  });

  test("comp obtain shows 'Competition prize'", () => {
    const root = render(<ObtainabilityCallout obtain="comp" />);
    const span = root.querySelector(".obtain");
    expect(span!.className).toContain("comp");
    expect(span!.textContent).toContain("Competition prize");
  });

  test("default obtain returns null (no callout for the baseline skin)", () => {
    const root = render(<ObtainabilityCallout obtain="default" />);
    expect(root.querySelector(".obtain")).toBeNull();
  });
});

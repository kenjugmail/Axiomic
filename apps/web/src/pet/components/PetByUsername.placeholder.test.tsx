// Phase 12D — PetByUsername placeholder.
//
// Verifies the loading state renders a sized placeholder so forum
// bylines don't visibly jump when the fetch resolves.

import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PetByUsername, __clearPetCache } from "./PetByUsername";

function render(node: React.ReactNode): HTMLElement {
  const html = renderToStaticMarkup(<>{node}</>);
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

const SIZES: Array<["xs" | "sm" | "md" | "lg" | "xl", number]> = [
  ["xs", 24],
  ["sm", 36],
  ["md", 56],
  ["lg", 80],
  ["xl", 128],
];

describe("PetByUsername — Phase 12D loading placeholder", () => {
  test.each(SIZES)("size=%s renders a %ipx square placeholder", (size, px) => {
    __clearPetCache();
    const root = render(<PetByUsername username="alice" size={size} />);
    const span = root.querySelector("span");
    expect(span).not.toBeNull();
    const style = span!.getAttribute("style") ?? "";
    expect(style).toContain(`width:${px}px`);
    expect(style).toContain(`height:${px}px`);
    // Circle (rounded-full equivalent).
    expect(style).toMatch(/border-radius:\s*9999px/);
  });

  test("aria-hidden so SRs don't announce the placeholder", () => {
    __clearPetCache();
    const root = render(<PetByUsername username="alice" size="sm" />);
    const span = root.querySelector("span");
    expect(span?.getAttribute("aria-hidden")).toBe("true");
  });
});

// Phase 12F — PetAvatar small-size compact class.
//
// At byline sizes (<32 px) PetAvatar applies the `compact` class
// to .pet-stage so the floor-disc ::before pseudo can be hidden
// via CSS (.pet-stage.compact::before { display: none }).

import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PetAvatar } from "./PetAvatar";

function render(node: React.ReactNode): HTMLElement {
  const html = renderToStaticMarkup(<>{node}</>);
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

describe("PetAvatar — Phase 12F compact modifier", () => {
  test("size 24 applies pet-stage.compact", () => {
    const root = render(<PetAvatar species="fox" level={1} size={24} />);
    const stage = root.querySelector(".pet-stage");
    expect(stage).not.toBeNull();
    expect(stage!.className).toContain("compact");
  });

  test("size 32 does NOT apply compact", () => {
    const root = render(<PetAvatar species="fox" level={1} size={32} />);
    const stage = root.querySelector(".pet-stage");
    expect(stage!.className).not.toContain("compact");
  });

  test("size 80 does NOT apply compact", () => {
    const root = render(<PetAvatar species="fox" level={1} size={80} />);
    const stage = root.querySelector(".pet-stage");
    expect(stage!.className).not.toContain("compact");
  });
});

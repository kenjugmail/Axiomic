// Phase 11G — CosmeticChip rich tooltip.
// Pins the title-attribute format so a future refactor of the
// hover affordance is caught early.

import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CosmeticChip } from "./CosmeticChip";

function render(node: React.ReactNode): HTMLElement {
  const html = renderToStaticMarkup(<>{node}</>);
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

describe("CosmeticChip — Phase 11G tooltip", () => {
  test("owned + equipped tile tooltip says Equipped", () => {
    const root = render(
      <CosmeticChip
        slug="study-cap"
        name="Study cap"
        slot="head"
        rarity="common"
        owned
        equipped
        description="A dapper cap."
      />,
    );
    const title = root.querySelector("button")?.getAttribute("title") ?? "";
    expect(title).toContain("Study cap");
    expect(title).toContain("Common");
    expect(title).toContain("Equipped");
    expect(title).toContain("A dapper cap.");
  });

  test("unowned XP-shop tile tooltip surfaces the price", () => {
    const root = render(
      <CosmeticChip
        slug="top-hat"
        name="Top hat"
        slot="head"
        rarity="epic"
        owned={false}
        obtain="xp"
        obtainCost={1400}
      />,
    );
    const title = root.querySelector("button")?.getAttribute("title") ?? "";
    expect(title).toContain("Top hat");
    expect(title).toContain("Epic");
    expect(title).toContain("1,400 XP shop");
  });

  test("unowned grant-only tile tooltip says Instructor grant", () => {
    const root = render(
      <CosmeticChip
        slug="honor-roll-halo"
        name="Honor halo"
        slot="head"
        rarity="legendary"
        owned={false}
        obtain="grant"
      />,
    );
    const title = root.querySelector("button")?.getAttribute("title") ?? "";
    expect(title).toContain("Instructor grant");
  });

  test("unowned comp-only tile tooltip says Competition prize", () => {
    const root = render(
      <CosmeticChip
        slug="trophy"
        name="Class trophy"
        slot="accessory"
        rarity="epic"
        owned={false}
        obtain="comp"
      />,
    );
    const title = root.querySelector("button")?.getAttribute("title") ?? "";
    expect(title).toContain("Competition prize");
  });
});

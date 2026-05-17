import { describe, expect, test } from "vitest";
import { StaticRouter } from "react-router-dom/server";
import { renderToStaticMarkup } from "react-dom/server";
import { MissionsListPage } from "./MissionsListPage";
import type { LiveRoomKind } from "@axiomic/types";

function render(): string {
  const html = renderToStaticMarkup(
    <StaticRouter location="/missions">
      <MissionsListPage />
    </StaticRouter>,
  );
  const host = document.createElement("div");
  host.innerHTML = html;
  return host.textContent ?? "";
}

describe("MissionsListPage", () => {
  test("SSR-renders the Goodness missions header", () => {
    const text = render();
    expect(text).toContain("Goodness missions");
    // Initial load shows skeletons (data === null) — SSR-safe, no
    // network dependency.
    expect(text).toContain("decomposed into sub-problems");
  });

  test("LiveRoomKind type-sync includes the Phase 39 + already-shipped kinds", () => {
    // Compile-time assertion: the stale union (reproduction |
    // capstone_submission only) is fixed. If any of these are not
    // assignable this file fails to typecheck.
    const kinds: LiveRoomKind[] = [
      "reproduction",
      "capstone_submission",
      "cohort_study",
      "bounty_collaboration",
      "mission_working_group",
    ];
    expect(kinds.length).toBe(5);
  });
});

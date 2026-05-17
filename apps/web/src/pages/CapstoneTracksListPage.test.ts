// Phase 16D — unit-test the discovery grouping logic. `groupTracks`
// is exported from the page module so we can exercise it without
// rendering React (no DOM needed).

import { describe, expect, test } from "vitest";
import { groupTracks } from "./CapstoneTracksListPage";

function makeTrack(over: {
  id: string;
  slug?: string;
  tags?: string[];
  requiredCount?: number;
  myCompletedRequired?: number;
  earnedBy?: number;
}) {
  return {
    id: over.id,
    slug: over.slug ?? over.id,
    title: `Title ${over.id}`,
    summary: `Summary ${over.id}`,
    coverEmoji: "📚",
    accentColor: "violet",
    tags: over.tags ?? [],
    capstoneCount: 4,
    requiredCount: over.requiredCount ?? 4,
    optionalCount: 0,
    earnedBy: over.earnedBy ?? 0,
    updatedAt: "2026-01-01",
    myCompletedRequired: over.myCompletedRequired ?? 0,
  };
}

describe("groupTracks (Phase 16D discovery)", () => {
  test("returns empty groups for signed-out users", () => {
    const tracks = [makeTrack({ id: "a", myCompletedRequired: 2 })];
    const groups = groupTracks(tracks, false);
    expect(groups.inProgress).toEqual([]);
    expect(groups.recommended).toEqual([]);
  });

  test("splits in-progress tracks from candidate pool", () => {
    const tracks = [
      makeTrack({ id: "done", myCompletedRequired: 4, requiredCount: 4 }),
      makeTrack({ id: "wip", myCompletedRequired: 2, requiredCount: 4 }),
      makeTrack({ id: "fresh", myCompletedRequired: 0 }),
    ];
    const groups = groupTracks(tracks, true);
    expect(groups.inProgress.map((t) => t.id)).toEqual(["wip"]);
    // "done" doesn't count as in-progress; "fresh" is a recommendation
    // candidate but with no signal + no earnedBy it stays out.
    expect(groups.recommended.map((t) => t.id)).toEqual([]);
  });

  test("ranks recommendations by tag affinity with in-progress tracks", () => {
    const tracks = [
      makeTrack({
        id: "wip",
        tags: ["ml", "math"],
        myCompletedRequired: 1,
        requiredCount: 4,
      }),
      makeTrack({ id: "math-match", tags: ["math", "stats"] }),
      makeTrack({ id: "ml-match", tags: ["ml", "systems"] }),
      makeTrack({ id: "unrelated", tags: ["bio"] }),
    ];
    const groups = groupTracks(tracks, true);
    const ids = groups.recommended.map((t) => t.id);
    // Both ml-match and math-match share one tag with the in-progress
    // signal; unrelated has zero affinity and is excluded.
    expect(ids).toContain("math-match");
    expect(ids).toContain("ml-match");
    expect(ids).not.toContain("unrelated");
  });

  test("falls back to earnedBy when the user has no progress signal", () => {
    const tracks = [
      makeTrack({ id: "popular", earnedBy: 50 }),
      makeTrack({ id: "quiet", earnedBy: 0 }),
    ];
    const groups = groupTracks(tracks, true);
    expect(groups.recommended.map((t) => t.id)).toEqual(["popular"]);
  });
});

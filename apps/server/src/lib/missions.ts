// Phase 39 — "Goodness" missions: gate + small membership helpers.
//
// A Mission is a big real-world problem decomposed into
// sub-problems; members contribute analysis/data/solutions that
// peer + expert review verifies into a signed, transparency-logged
// credential (reuses the reproduction rigor verbatim). Missions are
// OPEN: anyone signed in can read + join; posting a contribution /
// sub-problem or entering the working-group room requires a
// missionMembers row (or being the creator).
//
// gateMission mirrors gateCohort's shape (cohorts.ts:367) — read is
// public, so it resolves the mission + the caller's membership and
// never short-circuits a logged-out reader. Write/room gates are
// applied by the route via isMember / isOrganizer on the returned
// membership.

import type { Context } from "hono";
import { and, eq } from "drizzle-orm";
import { getDb, missionMembers, missions } from "@axiomic/db";
import { getSessionUser } from "../middleware/auth";
import type { Env } from "../env";

export interface MissionRow {
  id: string;
  slug: string;
  title: string;
  problemMd: string;
  summaryMd: string;
  theme: string;
  topicTagsJson: string;
  status: string;
  creatorId: string;
  createdAt: string;
  updatedAt: string;
}

export type MissionMembership =
  | { role: "member" | "organizer"; isCreator: boolean }
  | null;

export function getMission(slug: string): MissionRow | null {
  return (
    getDb()
      .select()
      .from(missions)
      .where(eq(missions.slug, slug))
      .get() ?? null
  );
}

// The caller's membership in a mission. The creator is always
// treated as an organizer even if (defensively) the auto-insert
// row is missing.
export function membershipFor(
  mission: { id: string; creatorId: string },
  userId: string | null,
): MissionMembership {
  if (!userId) return null;
  const row = getDb()
    .select({ role: missionMembers.role })
    .from(missionMembers)
    .where(
      and(
        eq(missionMembers.missionId, mission.id),
        eq(missionMembers.userId, userId),
      ),
    )
    .get();
  if (mission.creatorId === userId) {
    return {
      role: (row?.role as "member" | "organizer") ?? "organizer",
      isCreator: true,
    };
  }
  if (!row) return null;
  return {
    role: (row.role as "member" | "organizer") ?? "member",
    isCreator: false,
  };
}

export function isMember(
  mission: { id: string; creatorId: string },
  userId: string | null,
): boolean {
  return membershipFor(mission, userId) !== null;
}

export function isOrganizer(
  mission: { id: string; creatorId: string },
  userId: string | null,
): boolean {
  const m = membershipFor(mission, userId);
  return m !== null && (m.role === "organizer" || m.isCreator);
}

// Resolve a mission by :slug + attach the caller's membership.
// Read is public/open (mirrors gateCohort's open branch) — a
// logged-out reader still gets the mission with membership=null.
// 404 is the only short-circuit.
export async function gateMission(
  c: Context<Env>,
): Promise<
  | { ok: true; mission: MissionRow; userId: string | null; membership: MissionMembership }
  | { ok: false; res: Response }
> {
  const slug = c.req.param("slug")!;
  const mission = getMission(slug);
  if (!mission) {
    return { ok: false, res: c.json({ error: "Mission not found" }, 404) };
  }
  const session = await getSessionUser(c);
  const userId = session?.id ?? null;
  return {
    ok: true,
    mission,
    userId,
    membership: membershipFor(mission, userId),
  };
}

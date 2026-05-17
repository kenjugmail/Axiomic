// Phase 30F — collaboration matcher + bounty_collaboration room.

import { describe, test, expect } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}
function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}
const testRun =
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
async function signup(suffix: string) {
  const username = `cm_${suffix}_${testRun}`.slice(0, 30);
  const res = await req("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password: "testpass123",
    }),
  });
  const data = (await res.json()) as { user: { id: string } };
  return {
    cookie: res.headers.get("set-cookie") || "",
    userId: data.user.id,
    username,
  };
}

describe("collaboration matcher (Phase 30D)", () => {
  test("co-claimants matched by weakness overlap; poster excluded; non-claimant gated; shared room access", async () => {
    const { getDb, researchBounties, misconceptionDiagnoses } =
      await import("@axiomic/db");
    const { eq } = await import("drizzle-orm");
    const { randomUUID } = await import("crypto");
    const poster = await signup("post");
    const a = await signup("a");
    const b = await signup("b");
    const stranger = await signup("str");

    const slug = `cm-${testRun}`;
    const mk = await req("/bounties", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(poster.cookie),
      },
      body: JSON.stringify({
        slug,
        title: "Collaborative bounty",
        kind: "reproduce",
        rewardXp: 50,
        maxClaimants: 5,
      }),
    });
    expect(mk.status).toBe(201);
    const bountyRow = getDb()
      .select({ id: researchBounties.id })
      .from(researchBounties)
      .where(eq(researchBounties.slug, slug))
      .get();
    const bountyId = bountyRow!.id;

    // a + b claim; both weak on the same concept.
    for (const u of [a, b]) {
      const cl = await req(`/bounties/${slug}/claim`, {
        method: "POST",
        headers: cookieHeader(u.cookie),
      });
      expect(cl.status).toBe(201);
      getDb()
        .insert(misconceptionDiagnoses)
        .values({
          id: randomUUID(),
          userId: u.userId,
          conceptSlug: `shared-${testRun}`,
          misconceptionKey: `k-${testRun}`,
          label: "Shared gap",
          status: "active",
        })
        .run();
    }

    // a sees b as a collaborator; poster is excluded.
    const collab = await req(`/bounties/${slug}/collaborators`, {
      headers: cookieHeader(a.cookie),
    });
    expect(collab.status).toBe(200);
    const cb = (await collab.json()) as {
      collaborators: Array<{ username: string }>;
    };
    expect(
      cb.collaborators.find((x) => x.username === b.username),
    ).toBeDefined();
    expect(
      cb.collaborators.find((x) => x.username === poster.username),
    ).toBeUndefined();

    // Ranked matcher returns b with a shared concept.
    const match = await req(`/bounties/${slug}/match-collaborator`, {
      headers: cookieHeader(a.cookie),
    });
    const mb = (await match.json()) as {
      matches: Array<{ username: string; sharedConcepts: unknown[] }>;
    };
    const found = mb.matches.find((x) => x.username === b.username);
    expect(found).toBeDefined();
    expect(found!.sharedConcepts.length).toBeGreaterThanOrEqual(1);

    // Non-claimant can't see collaborators.
    const denied = await req(`/bounties/${slug}/collaborators`, {
      headers: cookieHeader(stranger.cookie),
    });
    expect(denied.status).toBe(403);

    // Shared room: a claimant can post; a non-claimant cannot.
    const post = await req(
      `/review-rooms/bounty_collaboration/${bountyId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...cookieHeader(a.cookie),
        },
        body: JSON.stringify({ bodyMd: "Let's split the repro." }),
      },
    );
    expect(post.status).toBe(201);
    const strangerPost = await req(
      `/review-rooms/bounty_collaboration/${bountyId}/messages`,
      { headers: cookieHeader(stranger.cookie) },
    );
    expect(strangerPost.status).toBe(403);
    // The poster may also enter the room.
    const posterView = await req(
      `/review-rooms/bounty_collaboration/${bountyId}/messages`,
      { headers: cookieHeader(poster.cookie) },
    );
    expect(posterView.status).toBe(200);
  });
});

// Phase 28F — research bounty marketplace tests.
//
// Full lifecycle: post → discover → claim (one-per-user +
// maxClaimants cap) → submit → accept (XP + badge + notification
// + signed credential in the wallet) → reject frees a slot →
// idempotent re-accept.

import { describe, test, expect } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testRun = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(
  suffix: string,
): Promise<{ cookie: string; userId: string; username: string }> {
  const username = `bn_${suffix}_${testRun}`.slice(0, 30);
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
  const cookie = res.headers.get("set-cookie") || "";
  return { cookie, userId: data.user.id, username };
}

describe("research bounties (Phase 28C/D)", () => {
  test("post → discover → claim → submit → accept fans out XP + badge + notification + signed credential", async () => {
    const { getDb, xpGrants, userAchievements, notifications } =
      await import("@axiomic/db");
    const { and, eq } = await import("drizzle-orm");
    const poster = await signup("p1");
    const worker = await signup("w1");

    const slug = `b1-${testRun}`;
    const create = await req("/bounties", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(poster.cookie),
      },
      body: JSON.stringify({
        slug,
        title: "Reproduce benchmark X",
        descriptionMd: "Re-run the benchmark and confirm the numbers.",
        kind: "reproduce",
        rewardXp: 200,
        rewardBadgeSlug: `reproducer-${testRun}`,
        maxClaimants: 1,
      }),
    });
    expect(create.status).toBe(201);

    // Discover lists it (public, no auth).
    const disc = await req("/bounties/discover");
    const discBody = (await disc.json()) as {
      bounties: Array<{ slug: string }>;
    };
    expect(discBody.bounties.find((b) => b.slug === slug)).toBeDefined();

    // Poster can't claim own bounty.
    const selfClaim = await req(`/bounties/${slug}/claim`, {
      method: "POST",
      headers: cookieHeader(poster.cookie),
    });
    expect(selfClaim.status).toBe(400);

    // Worker claims.
    const claim = await req(`/bounties/${slug}/claim`, {
      method: "POST",
      headers: cookieHeader(worker.cookie),
    });
    expect(claim.status).toBe(201);

    // One claim per user.
    const dup = await req(`/bounties/${slug}/claim`, {
      method: "POST",
      headers: cookieHeader(worker.cookie),
    });
    expect(dup.status).toBe(409);

    // maxClaimants cap (1) — a third user can't claim.
    const other = await signup("w1b");
    const capped = await req(`/bounties/${slug}/claim`, {
      method: "POST",
      headers: cookieHeader(other.cookie),
    });
    expect(capped.status).toBe(400);

    // Worker submits.
    const submit = await req(`/bounties/${slug}/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(worker.cookie),
      },
      body: JSON.stringify({
        writeup: "Reproduced. Numbers match within 0.1%.",
        artifacts: [
          {
            kind: "github",
            url: "https://github.com/example/repro",
            label: "repo",
          },
        ],
      }),
    });
    expect(submit.status).toBe(201);

    // Poster fetches detail to get the claimId.
    const detail = await req(`/bounties/${slug}`, {
      headers: cookieHeader(poster.cookie),
    });
    const detailBody = (await detail.json()) as {
      claims: Array<{ id: string; userId: string }>;
    };
    const claimId = detailBody.claims.find(
      (cl) => cl.userId === worker.userId,
    )?.id;
    expect(claimId).toBeDefined();

    // Non-poster can't accept.
    const badAccept = await req(
      `/bounties/${slug}/claims/${claimId}/accept`,
      { method: "POST", headers: cookieHeader(worker.cookie) },
    );
    expect(badAccept.status).toBe(403);

    // Poster accepts.
    const accept = await req(
      `/bounties/${slug}/claims/${claimId}/accept`,
      { method: "POST", headers: cookieHeader(poster.cookie) },
    );
    expect(accept.status).toBe(200);

    // Idempotent re-accept.
    const reAccept = await req(
      `/bounties/${slug}/claims/${claimId}/accept`,
      { method: "POST", headers: cookieHeader(poster.cookie) },
    );
    expect(reAccept.status).toBe(200);
    const reBody = (await reAccept.json()) as { alreadyAccepted?: boolean };
    expect(reBody.alreadyAccepted).toBe(true);

    const db = getDb();

    // XP granted once (idempotent on source+sourceRefId).
    const grants = db
      .select()
      .from(xpGrants)
      .where(
        and(
          eq(xpGrants.userId, worker.userId),
          eq(xpGrants.source, "bounty-completed"),
        ),
      )
      .all();
    expect(grants.length).toBe(1);

    // Badge minted.
    const badge = db
      .select()
      .from(userAchievements)
      .where(
        and(
          eq(userAchievements.userId, worker.userId),
          eq(userAchievements.slug, `reproducer-${testRun}`),
        ),
      )
      .get();
    expect(badge).toBeDefined();

    // Notification fired (fire-and-forget; give it a tick).
    await new Promise((r) => setTimeout(r, 100));
    const notif = db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, worker.userId),
          eq(notifications.kind, "bounty_accepted"),
        ),
      )
      .get();
    expect(notif).toBeDefined();

    // Bounty flipped to completed (maxClaimants reached).
    const done = await req(`/bounties/${slug}`);
    const doneBody = (await done.json()) as {
      bounty: { status: string };
    };
    expect(doneBody.bounty.status).toBe("completed");

    // Signed "Bounty completed" credential surfaces in the wallet.
    const wallet = await req("/me/credentials", {
      headers: cookieHeader(worker.cookie),
    });
    const walletBody = (await wallet.json()) as {
      credentials: Array<{ kind: string; signed: boolean }>;
    };
    const cred = walletBody.credentials.find((cc) => cc.kind === "bounty");
    expect(cred).toBeDefined();
    expect(cred?.signed).toBe(true);
  });

  test("reject frees a slot so another user can claim", async () => {
    const poster = await signup("p2");
    const a = await signup("w2a");
    const b = await signup("w2b");
    const slug = `b2-${testRun}`;
    await req("/bounties", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(poster.cookie),
      },
      body: JSON.stringify({
        slug,
        title: "Single-slot bounty",
        kind: "analyze",
        rewardXp: 50,
        maxClaimants: 1,
      }),
    });

    const claimA = await req(`/bounties/${slug}/claim`, {
      method: "POST",
      headers: cookieHeader(a.cookie),
    });
    expect(claimA.status).toBe(201);

    // Slot full — B can't claim.
    const cappedB = await req(`/bounties/${slug}/claim`, {
      method: "POST",
      headers: cookieHeader(b.cookie),
    });
    expect(cappedB.status).toBe(400);

    // Poster rejects A.
    const detail = await req(`/bounties/${slug}`, {
      headers: cookieHeader(poster.cookie),
    });
    const dBody = (await detail.json()) as {
      claims: Array<{ id: string; userId: string }>;
    };
    const claimAId = dBody.claims.find(
      (cl) => cl.userId === a.userId,
    )?.id;
    const reject = await req(
      `/bounties/${slug}/claims/${claimAId}/reject`,
      { method: "POST", headers: cookieHeader(poster.cookie) },
    );
    expect(reject.status).toBe(200);

    // Now B can claim the freed slot.
    const claimB = await req(`/bounties/${slug}/claim`, {
      method: "POST",
      headers: cookieHeader(b.cookie),
    });
    expect(claimB.status).toBe(201);
  });

  test("duplicate slug is rejected", async () => {
    const poster = await signup("p3");
    const slug = `b3-${testRun}`;
    const first = await req("/bounties", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(poster.cookie),
      },
      body: JSON.stringify({ slug, title: "First", kind: "other" }),
    });
    expect(first.status).toBe(201);
    const second = await req("/bounties", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(poster.cookie),
      },
      body: JSON.stringify({ slug, title: "Second", kind: "other" }),
    });
    expect(second.status).toBe(409);
  });
});

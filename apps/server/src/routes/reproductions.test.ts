// Phase 28F — reproduction peer-review tests.
//
// Covers: the review queue excludes the author + already-reviewed
// rows; the author can't self-review; a duplicate review is
// rejected; two independent 'confirmed' verdicts mint the
// credential + notification exactly once and surface it in the
// reproducer's wallet.

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
  const username = `rp_${suffix}_${testRun}`.slice(0, 30);
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

describe("reproduction peer review (Phase 28B)", () => {
  test("queue gating + 2 confirmations mint a signed credential + notification exactly once", async () => {
    const { getDb, reproductions, notifications } =
      await import("@axiomic/db");
    const { and, eq } = await import("drizzle-orm");
    const { randomUUID } = await import("crypto");

    const author = await signup("auth");
    const r1 = await signup("rev1");
    const r2 = await signup("rev2");

    const reproId = randomUUID();
    getDb()
      .insert(reproductions)
      .values({
        id: reproId,
        articleId: null,
        targetKind: "research_paper",
        targetId: `paper-${testRun}`,
        reproducerId: author.userId,
        status: "success",
        notes: "Independent reproduction of Table 2.",
        evidenceUrl: "https://example.com/notebook",
      })
      .run();

    // Author's own queue excludes their reproduction.
    const authorQueue = await req("/reproductions/review-queue", {
      headers: cookieHeader(author.cookie),
    });
    const aqBody = (await authorQueue.json()) as {
      reproductions: Array<{ id: string }>;
    };
    expect(aqBody.reproductions.find((x) => x.id === reproId)).toBeUndefined();

    // Reviewer 1's queue includes it.
    const q1 = await req("/reproductions/review-queue", {
      headers: cookieHeader(r1.cookie),
    });
    const q1Body = (await q1.json()) as {
      reproductions: Array<{ id: string }>;
    };
    expect(q1Body.reproductions.find((x) => x.id === reproId)).toBeDefined();

    // Author can't self-review.
    const selfRev = await req(`/reproductions/${reproId}/review`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(author.cookie),
      },
      body: JSON.stringify({ verdict: "confirmed" }),
    });
    expect(selfRev.status).toBe(403);

    // Reviewer 1 confirms.
    const rev1 = await req(`/reproductions/${reproId}/review`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(r1.cookie),
      },
      body: JSON.stringify({
        verdict: "confirmed",
        notesMd: "Matches within noise.",
      }),
    });
    expect(rev1.status).toBe(200);

    // Reviewer 1 can't review twice.
    const dup = await req(`/reproductions/${reproId}/review`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(r1.cookie),
      },
      body: JSON.stringify({ verdict: "confirmed" }),
    });
    expect(dup.status).toBe(409);

    // Reviewer 1's queue no longer shows it (already reviewed).
    const q1b = await req("/reproductions/review-queue", {
      headers: cookieHeader(r1.cookie),
    });
    const q1bBody = (await q1b.json()) as {
      reproductions: Array<{ id: string }>;
    };
    expect(q1bBody.reproductions.find((x) => x.id === reproId)).toBeUndefined();

    // Not yet credentialed (only 1 confirmation).
    const mid = getDb()
      .select()
      .from(reproductions)
      .where(eq(reproductions.id, reproId))
      .get();
    expect(mid?.credentialMintedAt).toBeNull();

    // Reviewer 2 confirms → crosses the threshold (2).
    const rev2 = await req(`/reproductions/${reproId}/review`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(r2.cookie),
      },
      body: JSON.stringify({ verdict: "confirmed" }),
    });
    expect(rev2.status).toBe(200);

    const after = getDb()
      .select()
      .from(reproductions)
      .where(eq(reproductions.id, reproId))
      .get();
    expect(after?.credentialMintedAt).toBeTruthy();

    // Notification to the author, exactly one.
    await new Promise((r) => setTimeout(r, 100));
    const notifs = getDb()
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, author.userId),
          eq(notifications.kind, "reproduction_verified"),
        ),
      )
      .all();
    expect(notifs.length).toBe(1);

    // Surfaces in the author's wallet as a signed credential.
    const wallet = await req("/me/credentials", {
      headers: cookieHeader(author.cookie),
    });
    const wBody = (await wallet.json()) as {
      credentials: Array<{ kind: string; signed: boolean }>;
    };
    const cred = wBody.credentials.find((c) => c.kind === "reproduction");
    expect(cred).toBeDefined();
    expect(cred?.signed).toBe(true);
  });
});

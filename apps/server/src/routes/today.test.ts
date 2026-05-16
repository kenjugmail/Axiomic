// Phase 34E — the daily "Review & Prove" driver.
//
// /me/today fuses due flashcards, weak concepts, decay signals,
// the active commitment's goal-path, and the review streak into
// one ordered payload. Asserts the shape + that an active
// commitment surfaces.

import { describe, test, expect } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}
function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}
const testRun = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string) {
  const username = `td_${suffix}_${testRun}`.slice(0, 30);
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
  };
}

describe("daily Review & Prove driver (Phase 34C)", () => {
  test("/me/today shape + active commitment surfaces", async () => {
    const { getDb, learningCommitments } = await import("@axiomic/db");
    const { randomUUID } = await import("crypto");
    const u = await signup("u");

    const t1 = (await (
      await req("/me/today", { headers: cookieHeader(u.cookie) })
    ).json()) as {
      dueFlashcards: { count: number; sample: unknown[] };
      weakConcepts: unknown[];
      decay: { staleCredentials: unknown[]; resolvedToRefresh: unknown[] };
      activeCommitment: unknown;
      goalPathNext: unknown[];
      reviewStreak: number;
      streakInDanger: boolean;
    };
    expect(typeof t1.dueFlashcards.count).toBe("number");
    expect(Array.isArray(t1.weakConcepts)).toBe(true);
    expect(Array.isArray(t1.decay.staleCredentials)).toBe(true);
    expect(typeof t1.reviewStreak).toBe("number");
    expect(t1.activeCommitment).toBe(null);

    getDb()
      .insert(learningCommitments)
      .values({
        id: randomUUID(),
        userId: u.userId,
        goalKind: "skills",
        goalSlug: `goal-${testRun}`,
        goalTitle: "Ship the thing",
        deadlineAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        status: "active",
      })
      .run();

    const t2 = (await (
      await req("/me/today", { headers: cookieHeader(u.cookie) })
    ).json()) as {
      activeCommitment: { goalTitle: string } | null;
    };
    expect(t2.activeCommitment).not.toBe(null);
    expect(t2.activeCommitment!.goalTitle).toBe("Ship the thing");
  });
});

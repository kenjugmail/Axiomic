// Sprint 63b — coach context + suggestion ranker honor users.onboardingGoal.

import { describe, test, expect } from "bun:test";
import { app } from "../index";
import { getDb, users } from "@axiomic/db";
import { eq } from "drizzle-orm";
import { buildCoachContext } from "../lib/userContext";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string) {
  const username = `s63b_${suffix}_${testId}`.slice(0, 30);
  const res = await req("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password: "testpass123",
    }),
  });
  const cookie = res.headers.get("set-cookie") || "";
  const data = (await res.json()) as any;
  return { cookie, username, userId: data?.user?.id as string };
}

describe("Sprint 63b — onboarding goal in coach context", () => {
  test("buildCoachContext returns null goal when unset", async () => {
    const u = await signup("unset");
    const ctx = buildCoachContext(u.userId);
    expect(ctx.onboardingGoal).toBeNull();
    expect(ctx.primaryPersona).toBeNull();
  });

  test("buildCoachContext returns the goal when set on the user", async () => {
    const u = await signup("set");
    const db = getDb();
    db.update(users)
      .set({ onboardingGoal: "publish_paper" })
      .where(eq(users.id, u.userId))
      .run();
    const ctx = buildCoachContext(u.userId);
    expect(ctx.onboardingGoal).toBe("publish_paper");
    expect(ctx.primaryPersona).toBeNull();
  });

  test("buildCoachContext returns primary persona when set", async () => {
    const u = await signup("pers");
    const db = getDb();
    db.update(users)
      .set({ primaryPersona: "lab" })
      .where(eq(users.id, u.userId))
      .run();
    const ctx = buildCoachContext(u.userId);
    expect(ctx.primaryPersona).toBe("lab");
  });

  test("buildCoachContext rejects unknown persona values", async () => {
    const u = await signup("badpers");
    const db = getDb();
    db.update(users)
      .set({ primaryPersona: "not_valid" })
      .where(eq(users.id, u.userId))
      .run();
    const ctx = buildCoachContext(u.userId);
    expect(ctx.primaryPersona).toBeNull();
  });

  test("buildCoachContext rejects unknown goal values", async () => {
    const u = await signup("bogus");
    const db = getDb();
    db.update(users)
      .set({ onboardingGoal: "not_a_real_goal" })
      .where(eq(users.id, u.userId))
      .run();
    const ctx = buildCoachContext(u.userId);
    expect(ctx.onboardingGoal).toBeNull();
  });

  test("/ai/coach/suggest appends a goal-pointed primer when sparse", async () => {
    const u = await signup("primer");
    const db = getDb();
    db.update(users)
      .set({ onboardingGoal: "complete_track" })
      .where(eq(users.id, u.userId))
      .run();
    const res = await req("/ai/coach/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(u.cookie) },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { suggestions: any[] };
    const primer = data.suggestions.find((s) => s.kind === "primer");
    expect(primer).toBeDefined();
    expect(primer.ctaUrl).toBe("/tracks");
    expect(primer.body).toContain("Complete a capstone track");
  });
});

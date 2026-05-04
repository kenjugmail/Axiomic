import { describe, test, expect, beforeAll } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string): Promise<{ cookie: string; username: string }> {
  const username = `ach_${suffix}_${testId}`;
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
  return { cookie, username };
}

describe("Achievements: catalog + per-user", () => {
  test("catalog returns the hand-authored achievement list", async () => {
    const res = await req("/achievements/catalog");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(Array.isArray(data.achievements)).toBe(true);
    expect(data.achievements.length).toBeGreaterThanOrEqual(8);
    const slugs = data.achievements.map((a: any) => a.slug);
    expect(slugs).toContain("first_steps");
    expect(slugs).toContain("first_quiz");
    expect(slugs).toContain("code_warrior");
  });

  test("fresh user has zero earned, zero streak, full empty heatmap", async () => {
    const { username } = await signup("fresh");
    const res = await req(`/achievements/users/${username}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.earned).toEqual([]);
    expect(data.streak).toBe(0);
    expect(data.heatmap.length).toBe(84);
    expect(data.heatmap.every((c: any) => c.count === 0)).toBe(true);
  });

  test("unknown username returns 404", async () => {
    const res = await req("/achievements/users/no-such-user-zz");
    expect(res.status).toBe(404);
  });
});

describe("Achievements: awarding from activity", () => {
  let user = { cookie: "", username: "" };

  beforeAll(async () => {
    user = await signup("award");
  });

  test("completing a mastery node awards first_steps + records activity", async () => {
    // Pull any apprentice node id.
    const path = await (
      await req("/mastery/paths/ml-engineer")
    ).json() as any;
    const node = path.nodes[0];

    const res = await req(`/mastery/progress/${node.id}/complete`, {
      method: "POST",
      headers: cookieHeader(user.cookie),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.newAchievements).toContain("first_steps");

    // Heatmap reflects it: today's cell has count >= 1.
    const ach = await (
      await req(`/achievements/users/${user.username}`)
    ).json() as any;
    expect(ach.streak).toBeGreaterThanOrEqual(1);
    const todayKey = new Date().toISOString().slice(0, 10);
    const todayCell = ach.heatmap.find((c: any) => c.day === todayKey);
    expect(todayCell?.count).toBeGreaterThanOrEqual(1);

    // first_steps is now in the earned list with metadata.
    expect(ach.earned.find((e: any) => e.slug === "first_steps")).toBeDefined();
  });

  test("creating a forum topic awards first_topic", async () => {
    const res = await req("/forum/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(user.cookie) },
      body: JSON.stringify({
        title: "achievements smoke",
        body: "checking that creating a topic earns first_topic",
        postType: "claim",
        domainSlug: "ml",
      }),
    });
    expect(res.status).toBe(201);

    // The forum route doesn't return newAchievements (it's
    // recorded best-effort). Verify via the achievements endpoint.
    const ach = await (
      await req(`/achievements/users/${user.username}`)
    ).json() as any;
    expect(ach.earned.find((e: any) => e.slug === "first_topic")).toBeDefined();
  });

  test("saving 5 flashcards awards deck_builder", async () => {
    for (let i = 0; i < 5; i++) {
      await req("/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(user.cookie) },
        body: JSON.stringify({
          pageSlug: "softmax",
          pageTitle: "Softmax Function",
          front: `Card ${i}`,
          back: `Back of card ${i}`,
        }),
      });
    }
    const ach = await (
      await req(`/achievements/users/${user.username}`)
    ).json() as any;
    expect(ach.earned.find((e: any) => e.slug === "deck_builder")).toBeDefined();
  });

  test("re-completing the same node does NOT double-record activity", async () => {
    const path = await (
      await req("/mastery/paths/ml-engineer")
    ).json() as any;
    const node = path.nodes[0];

    const before = await (
      await req(`/achievements/users/${user.username}`)
    ).json() as any;
    const todayKey = new Date().toISOString().slice(0, 10);
    const beforeCount =
      before.heatmap.find((c: any) => c.day === todayKey)?.count ?? 0;

    await req(`/mastery/progress/${node.id}/complete`, {
      method: "POST",
      headers: cookieHeader(user.cookie),
    });
    const after = await (
      await req(`/achievements/users/${user.username}`)
    ).json() as any;
    const afterCount =
      after.heatmap.find((c: any) => c.day === todayKey)?.count ?? 0;
    expect(afterCount).toBe(beforeCount);
  });
});

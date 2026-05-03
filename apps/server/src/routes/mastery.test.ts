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
  const username = `mast_${suffix}_${testId}`;
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

async function getPath(slug: string): Promise<{ pathId: string; nodes: any[] }> {
  const res = await req(`/mastery/paths/${slug}`);
  const data = (await res.json()) as any;
  return { pathId: data.path.id, nodes: data.nodes };
}

async function unread(cookie: string): Promise<number> {
  const res = await req("/notifications/unread-count", {
    headers: cookieHeader(cookie),
  });
  const data = (await res.json()) as any;
  return data.count;
}

async function listNotifications(cookie: string): Promise<any[]> {
  const res = await req("/notifications", { headers: cookieHeader(cookie) });
  const data = (await res.json()) as any;
  return data.notifications;
}

async function markComplete(cookie: string, nodeId: string): Promise<Response> {
  return req(`/mastery/progress/${nodeId}/complete`, {
    method: "POST",
    headers: cookieHeader(cookie),
  });
}

describe("Mastery: mark complete + level-up notifications", () => {
  let user = { cookie: "", username: "" };
  let nodes: any[] = [];

  beforeAll(async () => {
    user = await signup("lvl");
    const p = await getPath("ml-engineer");
    nodes = p.nodes;
  });

  test("first apprentice completion fires a level-up notification", async () => {
    const apprentice = nodes.find((n) => n.level === "apprentice");
    expect(apprentice).toBeDefined();

    const before = await unread(user.cookie);
    const res = await markComplete(user.cookie, apprentice.id);
    expect(res.status).toBe(200);

    const after = await unread(user.cookie);
    expect(after).toBe(before + 1);

    const list = await listNotifications(user.cookie);
    const levelUp = list.find(
      (n) => n.kind === "mastery_level_up" && n.subjectId === apprentice.id,
    );
    expect(levelUp).toBeDefined();
    expect(levelUp.contextSlug).toBe("ml-engineer");
    expect(levelUp.preview).toContain("Apprentice");
    expect(levelUp.actor).toBeNull();
  });

  test("second apprentice node does NOT fire (same level)", async () => {
    const apprenticeNodes = nodes.filter((n) => n.level === "apprentice");
    expect(apprenticeNodes.length).toBeGreaterThan(1);
    const second = apprenticeNodes[1];

    const before = await unread(user.cookie);
    const res = await markComplete(user.cookie, second.id);
    expect(res.status).toBe(200);
    const after = await unread(user.cookie);
    expect(after).toBe(before);
  });

  test("re-marking an already-completed node is a no-op", async () => {
    const apprentice = nodes.find((n) => n.level === "apprentice");
    const before = await unread(user.cookie);
    const res = await markComplete(user.cookie, apprentice.id);
    expect(res.status).toBe(200);
    const after = await unread(user.cookie);
    expect(after).toBe(before);
  });

  test("crossing into specialist (skipping practitioner) fires once", async () => {
    const specialist = nodes.find((n) => n.level === "specialist");
    expect(specialist).toBeDefined();

    const before = await unread(user.cookie);
    const res = await markComplete(user.cookie, specialist.id);
    expect(res.status).toBe(200);
    const after = await unread(user.cookie);
    expect(after).toBe(before + 1);

    const list = await listNotifications(user.cookie);
    const forSpecialist = list.find(
      (n) => n.kind === "mastery_level_up" && n.subjectId === specialist.id,
    );
    expect(forSpecialist).toBeDefined();
    expect(forSpecialist.preview).toContain("Specialist");
  });

  test("completing a lower-level node after specialist does NOT fire", async () => {
    const practitioner = nodes.find((n) => n.level === "practitioner");
    expect(practitioner).toBeDefined();
    const before = await unread(user.cookie);
    const res = await markComplete(user.cookie, practitioner.id);
    expect(res.status).toBe(200);
    const after = await unread(user.cookie);
    expect(after).toBe(before);
  });

  test("level-up notification honors notifyMastery=false", async () => {
    // Mute mastery notifications.
    await req("/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(user.cookie) },
      body: JSON.stringify({ notifyMastery: false }),
    });

    const expert = nodes.find((n) => n.level === "expert");
    expect(expert).toBeDefined();

    const before = await unread(user.cookie);
    const res = await markComplete(user.cookie, expert.id);
    expect(res.status).toBe(200);
    const after = await unread(user.cookie);
    expect(after).toBe(before);

    // Unmute for any subsequent tests.
    await req("/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(user.cookie) },
      body: JSON.stringify({ notifyMastery: true }),
    });
  });
});

describe("Mastery: quiz", () => {
  let user = { cookie: "", username: "" };
  let nodeId = "";

  beforeAll(async () => {
    user = await signup("quiz");
    const p = await getPath("ml-engineer");
    nodeId = p.nodes[0].id;
  });

  test("GET /quiz/:nodeId returns at least one question", async () => {
    const res = await req(`/mastery/quiz/${nodeId}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(Array.isArray(data.questions)).toBe(true);
    expect(data.questions.length).toBeGreaterThan(0);
  });

  test("POST /quiz/:nodeId with all-correct answers returns score 1", async () => {
    const get = await req(`/mastery/quiz/${nodeId}`);
    const { questions } = (await get.json()) as any;
    const answers: Record<string, string> = {};
    for (const q of questions) answers[q.id] = String(q.correctIndex);

    const res = await req(`/mastery/quiz/${nodeId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(user.cookie) },
      body: JSON.stringify({ answers }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.score).toBe(1);
    expect(data.correct).toBe(questions.length);
    expect(data.total).toBe(questions.length);
  });

  test("seeded quiz data overrides stub questions", async () => {
    // tokens-basics has hand-authored questions; the generic stub
    // would only contain the words "What is the main concept behind".
    const p = await getPath("ml-engineer");
    const tokens = p.nodes.find((n) => n.slug === "tokens-basics")!;
    const res = await req(`/mastery/quiz/${tokens.id}`);
    const data = (await res.json()) as any;
    expect(data.questions.length).toBe(3);
    // Stub fingerprint shouldn't appear in real questions.
    for (const q of data.questions) {
      expect(q.question).not.toContain("the main concept behind");
    }
  });
});

describe("Mastery: per-user summary", () => {
  let user = { cookie: "", username: "" };
  let nodes: any[] = [];

  beforeAll(async () => {
    user = await signup("sum");
    const p = await getPath("ml-engineer");
    nodes = p.nodes;
    // Complete one apprentice and one practitioner.
    const apprentice = nodes.find((n) => n.level === "apprentice");
    const practitioner = nodes.find((n) => n.level === "practitioner");
    await markComplete(user.cookie, apprentice.id);
    await markComplete(user.cookie, practitioner.id);
  });

  test("returns per-path aggregates", async () => {
    const res = await req(`/mastery/users/${user.username}/summary`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;

    expect(data.username).toBe(user.username);
    expect(Array.isArray(data.paths)).toBe(true);

    const ml = data.paths.find((p: any) => p.pathSlug === "ml-engineer");
    expect(ml).toBeDefined();
    expect(ml.totalNodes).toBe(24);
    expect(ml.completedNodes).toBe(2);
    expect(ml.currentLevel).toBe("practitioner");
    expect(typeof ml.latestCompletionAt).toBe("string");

    const ai = data.paths.find((p: any) => p.pathSlug === "ai-researcher");
    expect(ai).toBeDefined();
    expect(ai.completedNodes).toBe(0);
    expect(ai.currentLevel).toBeNull();

    expect(data.totalCompleted).toBe(2);
    expect(data.highestLevel).toBe("practitioner");
  });

  test("unknown user returns 404", async () => {
    const res = await req("/mastery/users/no-such-user-xyz/summary");
    expect(res.status).toBe(404);
  });
});

import { describe, test, expect, beforeAll } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(
  suffix: string,
): Promise<{ cookie: string; username: string }> {
  const username = `onb_${suffix}_${testId}`;
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

describe("Onboarding", () => {
  let user = { cookie: "", username: "" };

  beforeAll(async () => {
    user = await signup("a");
  });

  test("status requires auth", async () => {
    const res = await req("/onboarding/status");
    expect(res.status).toBe(401);
  });

  test("fresh user is not onboarded", async () => {
    const res = await req("/onboarding/status", {
      headers: cookieHeader(user.cookie),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.onboarded).toBe(false);
    expect(data.startingPathSlug).toBeNull();
    expect(data.primaryPersona).toBeNull();
  });

  test("POST without pathSlug marks onboarded with no path", async () => {
    const skipper = await signup("b");
    const post = await req("/onboarding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(skipper.cookie),
      },
      body: JSON.stringify({}),
    });
    expect(post.status).toBe(200);
    const data = (await post.json()) as any;
    expect(data.onboarded).toBe(true);
    expect(data.startingPathSlug).toBeNull();
    expect(data.firstNodeSlug).toBeNull();
  });

  test("POST with valid pathSlug seeds first-node lesson progress", async () => {
    const post = await req("/onboarding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(user.cookie),
      },
      body: JSON.stringify({ pathSlug: "ml-engineer" }),
    });
    expect(post.status).toBe(200);
    const data = (await post.json()) as any;
    expect(data.onboarded).toBe(true);
    expect(data.startingPathSlug).toBe("ml-engineer");
    expect(typeof data.firstNodeSlug).toBe("string");
    expect(data.firstNodeSlug.length).toBeGreaterThan(0);

    const status = await req("/onboarding/status", {
      headers: cookieHeader(user.cookie),
    });
    const stat = (await status.json()) as any;
    expect(stat.onboarded).toBe(true);
    expect(stat.startingPathSlug).toBe("ml-engineer");
  });

  test("POST with unknown pathSlug returns 400", async () => {
    const stranger = await signup("c");
    const post = await req("/onboarding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(stranger.cookie),
      },
      body: JSON.stringify({ pathSlug: "nonexistent-path" }),
    });
    expect(post.status).toBe(400);
  });

  test("POST is idempotent — second call doesn't error", async () => {
    const repeat = await req("/onboarding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(user.cookie),
      },
      body: JSON.stringify({ pathSlug: "ml-engineer" }),
    });
    expect(repeat.status).toBe(200);
  });

  test("POST requires auth", async () => {
    const res = await req("/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pathSlug: "ml-engineer" }),
    });
    expect(res.status).toBe(401);
  });

  test("POST persists primary persona", async () => {
    const u = await signup("pers");
    const post = await req("/onboarding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(u.cookie),
      },
      body: JSON.stringify({ persona: "lab" }),
    });
    expect(post.status).toBe(200);
    const st = await req("/onboarding/status", {
      headers: cookieHeader(u.cookie),
    });
    const data = (await st.json()) as { primaryPersona: string | null };
    expect(data.primaryPersona).toBe("lab");
  });

  test("POST rejects invalid persona", async () => {
    const u = await signup("badp");
    const post = await req("/onboarding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(u.cookie),
      },
      body: JSON.stringify({ persona: "invalid_persona" }),
    });
    expect(post.status).toBe(400);
  });
});

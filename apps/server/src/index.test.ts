import { describe, test, expect, beforeAll } from "bun:test";
import { app } from "./index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(setCookie: string | null): Record<string, string> {
  if (!setCookie) return {};
  const value = setCookie.split(";")[0];
  return { cookie: value };
}

const testId = Date.now().toString(36);

describe("Health & Readiness", () => {
  test("/health returns ok", async () => {
    const res = await req("/health");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.status).toBe("ok");
    expect(typeof data.timestamp).toBe("string");
  });

  // Phase 26A — every response should carry the baseline security
  // headers. Lock that down so a future middleware reshuffle that
  // accidentally drops one fails CI loudly.
  test("baseline security headers ride every response", async () => {
    const res = await req("/health");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(res.headers.get("Permissions-Policy")).toContain("geolocation=()");
  });

  test("/ready reports db and ai status", async () => {
    const res = await req("/ready");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.db).toBe(true);
    expect(data.ai).toBe(true);
    expect(data.status).toBe("ready");
  });
});

describe("Auth", () => {
  const email = `test_${testId}@example.com`;
  const username = `user_${testId}`;
  let sessionCookie = "";

  test("signup creates user", async () => {
    const res = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password: "testpass123" }),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as any;
    expect(data.user.username).toBe(username);
    sessionCookie = res.headers.get("set-cookie") || "";
    expect(sessionCookie).toContain("axiomic_session");
  });

  test("signup rejects missing fields", async () => {
    const res = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "x", email: "not-an-email" }),
    });
    expect(res.status).toBe(400);
  });

  test("duplicate email rejected", async () => {
    const res = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: `other_${testId}`, email, password: "testpass123" }),
    });
    expect(res.status).toBe(409);
  });

  test("login with no account returns 401", async () => {
    const res = await req("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `nope_${testId}@example.com`, password: "x" }),
    });
    expect(res.status).toBe(401);
  });

  test("login works", async () => {
    const res = await req("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "testpass123" }),
    });
    expect(res.status).toBe(200);
    sessionCookie = res.headers.get("set-cookie") || sessionCookie;
  });

  test("wrong password rejected", async () => {
    const res = await req("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "wrong" }),
    });
    expect(res.status).toBe(401);
  });

  test("/auth/me with session returns the user", async () => {
    const res = await req("/auth/me", { headers: cookieHeader(sessionCookie) });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.user?.username).toBe(username);
  });

  test("/auth/me without session returns null", async () => {
    const res = await req("/auth/me");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.user).toBe(null);
  });

  test("logout clears the session", async () => {
    const res = await req("/auth/logout", {
      method: "POST",
      headers: cookieHeader(sessionCookie),
    });
    expect(res.status).toBe(200);
    // After logout, /auth/me with the same cookie should not return the user.
    const me = await req("/auth/me", { headers: cookieHeader(sessionCookie) });
    const data = (await me.json()) as any;
    expect(data.user).toBe(null);
  });
});

describe("Wiki", () => {
  test("list returns pages", async () => {
    const res = await req("/wiki");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.pages.length).toBeGreaterThan(0);
  });

  test("search works", async () => {
    const res = await req("/wiki/search?q=attention");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.results.length).toBeGreaterThan(0);
  });

  test("get page returns content and versions", async () => {
    const res = await req("/wiki/attention");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.page.title).toBeTruthy();
    expect(data.content.length).toBeGreaterThan(100);
    expect(data.versions.length).toBeGreaterThan(0);
  });

  test("nonexistent page returns 404", async () => {
    const res = await req("/wiki/does-not-exist");
    expect(res.status).toBe(404);
  });

  test("PUT without auth returns 401", async () => {
    const res = await req("/wiki/attention", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentIntro: "x", contentUndergrad: "x", contentGrad: "x" }),
    });
    expect(res.status).toBe(401);
  });

  test("PUT with auth creates a new version", async () => {
    // Register a fresh user for this scope so we have a session.
    const u = `wikiwriter_${testId}`;
    const e = `wikiwriter_${testId}@example.com`;
    const signup = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u, email: e, password: "testpass123" }),
    });
    const cookie = signup.headers.get("set-cookie") || "";

    const before = (await (await req("/wiki/attention")).json()) as any;
    const beforeVersion = before.page.currentVersion;

    const res = await req("/wiki/attention", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        contentIntro: before.allContent?.intro || "intro",
        contentUndergrad: before.allContent?.undergrad || "undergrad",
        contentGrad: before.allContent?.grad || "grad",
        editMessage: "test bump",
      }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.page.currentVersion).toBe(beforeVersion + 1);
  });
});

describe("Comments", () => {
  let cookie = "";
  let pageId = "";

  beforeAll(async () => {
    const u = `commenter_${testId}`;
    const e = `commenter_${testId}@example.com`;
    const res = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u, email: e, password: "testpass123" }),
    });
    cookie = res.headers.get("set-cookie") || "";

    // Comments FK references wiki_pages(id), so fetch a real seeded page id.
    const page = (await (await req("/wiki/attention")).json()) as any;
    pageId = page.page.id;
  });

  test("create without auth returns 401", async () => {
    const res = await req("/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId, content: "hi" }),
    });
    expect(res.status).toBe(401);
  });

  test("create + reply links via parentId", async () => {
    const root = await req("/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ pageId, content: "root comment" }),
    });
    expect(root.status).toBe(201);
    const rootData = (await root.json()) as any;

    const reply = await req("/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ pageId, content: "reply", parentId: rootData.comment.id }),
    });
    expect(reply.status).toBe(201);
    const replyData = (await reply.json()) as any;
    expect(replyData.comment.parentId).toBe(rootData.comment.id);

    // List should contain root with the reply nested under children.
    const list = await req(`/comments/${pageId}?sort=new`, { headers: cookieHeader(cookie) });
    const listData = (await list.json()) as any;
    const found = listData.comments.find((c: any) => c.id === rootData.comment.id);
    expect(found).toBeTruthy();
    expect(found.children.find((c: any) => c.id === replyData.comment.id)).toBeTruthy();
  });

  test("vote toggles when same value is sent twice", async () => {
    const created = await req("/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ pageId, content: "vote me" }),
    });
    const { comment } = (await created.json()) as any;

    // Up-vote.
    await req(`/comments/${comment.id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ value: 1 }),
    });
    let list = await req(`/comments/${pageId}`, { headers: cookieHeader(cookie) });
    let listData = (await list.json()) as any;
    let found = findInTree(listData.comments, comment.id);
    expect(found.score).toBe(1);
    expect(found.userVote).toBe(1);

    // Same vote again toggles off.
    await req(`/comments/${comment.id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ value: 1 }),
    });
    list = await req(`/comments/${pageId}`, { headers: cookieHeader(cookie) });
    listData = (await list.json()) as any;
    found = findInTree(listData.comments, comment.id);
    expect(found.score).toBe(0);
    expect(found.userVote).toBe(0);
  });
});

describe("Mastery", () => {
  test("list paths", async () => {
    const res = await req("/mastery/paths");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.paths.length).toBeGreaterThan(0);
  });

  test("get ML Engineer path with nodes", async () => {
    const res = await req("/mastery/paths/ml-engineer");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.path.title).toBe("ML Engineer");
    expect(data.nodes.length).toBe(24);
  });

  test("markComplete without auth returns 401", async () => {
    const res = await req("/mastery/progress/some-node-id/complete", { method: "POST" });
    expect(res.status).toBe(401);
  });

  test("quiz submission scores correctly", async () => {
    const u = `quizzer_${testId}`;
    const e = `quizzer_${testId}@example.com`;
    const signup = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u, email: e, password: "testpass123" }),
    });
    const cookie = signup.headers.get("set-cookie") || "";

    const path = (await (await req("/mastery/paths/ml-engineer")).json()) as any;
    const nodeId = path.nodes[0].id;
    const quiz = (await (await req(`/mastery/quiz/${nodeId}`)).json()) as any;

    // Submit all-correct answers.
    const correctAnswers: Record<string, string> = {};
    for (const q of quiz.questions) correctAnswers[q.id] = String(q.correctIndex);

    const res = await req(`/mastery/quiz/${nodeId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ answers: correctAnswers }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.score).toBe(1);
    expect(data.correct).toBe(quiz.questions.length);
    expect(data.total).toBe(quiz.questions.length);
  });
});

describe("AI", () => {
  test("chat streams response", async () => {
    process.env.NODE_ENV = "test";
    const res = await req("/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageSlug: "attention",
        tier: "intro",
        messages: [{ role: "user", content: "hello" }],
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });

  test("related pages returns plausible matches", async () => {
    const res = await req("/ai/related/attention");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(Array.isArray(data.pages)).toBe(true);
    // The seed has many transformer pages — attention should match at least a few.
    expect(data.pages.length).toBeGreaterThan(0);
  });
});

describe("Request body size limit (Phase J)", () => {
  test("POST with Content-Length over 10MB returns 413", async () => {
    const res = await req("/auth/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(11 * 1024 * 1024),
      },
      body: JSON.stringify({ username: "x", email: "x@x.com", password: "xxxxxxxx" }),
    });
    expect(res.status).toBe(413);
  });

  test("POST with reasonable Content-Length passes the size middleware", async () => {
    // We don't care about the auth outcome — just that it isn't a 413.
    const res = await req("/auth/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "200",
      },
      body: JSON.stringify({
        username: `bs_${testId}`,
        email: `bs_${testId}@example.com`,
        password: "testpass123",
      }),
    });
    expect(res.status).not.toBe(413);
  });
});

function findInTree(comments: any[], id: string): any {
  for (const c of comments) {
    if (c.id === id) return c;
    if (c.children) {
      const f = findInTree(c.children, id);
      if (f) return f;
    }
  }
  return null;
}

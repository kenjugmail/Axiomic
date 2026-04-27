import { describe, test, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./routes/auth";
import { wiki } from "./routes/wiki";
import { commentsRouter } from "./routes/comments";
import { aiRouter } from "./routes/ai";
import { mastery } from "./routes/mastery";

// Build app directly for testing (no Bun.serve needed)
const app = new Hono().basePath("/api/v1");
app.use("*", cors());
app.get("/health", (c) => c.json({ status: "ok" }));
app.get("/ready", (c) => c.json({ status: "ready" }));
app.route("/auth", auth);
app.route("/wiki", wiki);
app.route("/comments", commentsRouter);
app.route("/ai", aiRouter);
app.route("/mastery", mastery);

function req(path: string, opts?: RequestInit): Promise<Response> {
  return app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

describe("Health", () => {
  test("returns ok", async () => {
    const res = await req("/health");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.status).toBe("ok");
  });
});

describe("Auth", () => {
  let sessionCookie = "";

  test("signup creates user", async () => {
    const res = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "integ", email: "integ@test.com", password: "testpass123" }),
    });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.user.username).toBe("integ");
    sessionCookie = res.headers.get("set-cookie") || "";
  });

  test("duplicate email rejected", async () => {
    const res = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "integ2", email: "integ@test.com", password: "testpass123" }),
    });
    expect(res.status).toBe(409);
  });

  test("login works", async () => {
    const res = await req("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "integ@test.com", password: "testpass123" }),
    });
    expect(res.status).toBe(200);
  });

  test("wrong password rejected", async () => {
    const res = await req("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "integ@test.com", password: "wrong" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("Wiki", () => {
  test("list returns pages", async () => {
    const res = await req("/wiki");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.pages.length).toBeGreaterThan(0);
  });

  test("search works", async () => {
    const res = await req("/wiki/search?q=attention");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results.length).toBeGreaterThan(0);
  });

  test("get page returns content and versions", async () => {
    const res = await req("/wiki/attention");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.page.title).toBeTruthy();
    expect(data.content.length).toBeGreaterThan(100);
    expect(data.versions.length).toBeGreaterThan(0);
  });

  test("nonexistent page returns 404", async () => {
    const res = await req("/wiki/does-not-exist");
    expect(res.status).toBe(404);
  });
});

describe("Mastery", () => {
  test("list paths", async () => {
    const res = await req("/mastery/paths");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.paths.length).toBeGreaterThan(0);
  });

  test("get ML Engineer path with nodes", async () => {
    const res = await req("/mastery/paths/ml-engineer");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.path.title).toBe("ML Engineer");
    expect(data.nodes.length).toBe(24);
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
});

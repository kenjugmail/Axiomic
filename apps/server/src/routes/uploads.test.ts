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
  const username = `up_${suffix}_${testId}`;
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

function pngForm(): FormData {
  // Smallest valid PNG: 1x1 red pixel.
  const png = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
    0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x03, 0x00, 0x01, 0x6e, 0xa3, 0xc6, 0x9b, 0x00, 0x00, 0x00,
    0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  const fd = new FormData();
  fd.append("file", new File([png], "pixel.png", { type: "image/png" }));
  return fd;
}

describe("Uploads", () => {
  let user = { cookie: "", username: "" };

  beforeAll(async () => {
    user = await signup("a");
  });

  test("POST requires auth", async () => {
    const res = await req("/uploads", {
      method: "POST",
      body: pngForm(),
    });
    expect(res.status).toBe(401);
  });

  test("POST without file returns 400", async () => {
    const fd = new FormData();
    const res = await req("/uploads", {
      method: "POST",
      headers: cookieHeader(user.cookie),
      body: fd,
    });
    expect(res.status).toBe(400);
  });

  test("POST with disallowed mime returns 400", async () => {
    const fd = new FormData();
    fd.append(
      "file",
      new File(["text"], "test.txt", { type: "text/plain" }),
    );
    const res = await req("/uploads", {
      method: "POST",
      headers: cookieHeader(user.cookie),
      body: fd,
    });
    expect(res.status).toBe(400);
  });

  test("POST PNG returns metadata + URL", async () => {
    const res = await req("/uploads", {
      method: "POST",
      headers: cookieHeader(user.cookie),
      body: pngForm(),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.id).toBeTruthy();
    expect(data.kind).toBe("image");
    expect(data.mimeType).toBe("image/png");
    expect(data.url).toMatch(/^\/api\/v1\/uploads\/[0-9a-f-]+$/);
    expect(data.sizeBytes).toBeGreaterThan(0);
  });

  test("GET /:id serves the bytes back", async () => {
    const post = await req("/uploads", {
      method: "POST",
      headers: cookieHeader(user.cookie),
      body: pngForm(),
    });
    const data = (await post.json()) as any;
    const get = await req(`/uploads/${data.id}`);
    expect(get.status).toBe(200);
    expect(get.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await get.arrayBuffer());
    expect(bytes.length).toBe(data.sizeBytes);
  });

  test("GET /:id on unknown id returns 404", async () => {
    const res = await req("/uploads/no-such-id");
    expect(res.status).toBe(404);
  });

  test("GET /uploads (auth'd) lists own attachments", async () => {
    const res = await req("/uploads", { headers: cookieHeader(user.cookie) });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(Array.isArray(data.attachments)).toBe(true);
    expect(data.attachments.length).toBeGreaterThan(0);
  });
});

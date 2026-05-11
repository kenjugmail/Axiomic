// Phase I — coverage for the lab equipment manuals router.

import { describe, test, expect } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string): Promise<{ cookie: string; username: string }> {
  const username = `eq_${suffix}_${testId}`;
  const res = await req("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password: "testpass123",
    }),
  });
  return { cookie: res.headers.get("set-cookie") || "", username };
}

describe("GET /lab/equipment", () => {
  test("returns a list (possibly empty)", async () => {
    const res = await req("/lab/equipment");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { equipment: unknown[] };
    expect(Array.isArray(data.equipment)).toBe(true);
  });

  test("discipline filter is accepted", async () => {
    const res = await req("/lab/equipment?discipline=biology");
    expect(res.status).toBe(200);
  });
});

describe("GET /lab/equipment/:slug", () => {
  test("unknown slug returns 404", async () => {
    const res = await req(`/lab/equipment/no-such-equipment-${testId}`);
    expect(res.status).toBe(404);
  });
});

describe("POST /lab/equipment", () => {
  test("unauthenticated returns 401", async () => {
    const res = await req("/lab/equipment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `eq-${testId}-anon`,
        title: "Spectrophotometer",
        discipline: "chemistry",
        bookingPolicy: "open",
        status: "active",
      }),
    });
    expect(res.status).toBe(401);
  });

  test("invalid discipline returns 400", async () => {
    const u = await signup("baddisc");
    const res = await req("/lab/equipment", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(u.cookie) },
      body: JSON.stringify({
        slug: `eq-${testId}-bad`,
        title: "Test",
        discipline: "wizardry",
        bookingPolicy: "open",
        status: "active",
      }),
    });
    expect(res.status).toBe(400);
  });

  test("non-kebab slug rejected", async () => {
    const u = await signup("badslug");
    const res = await req("/lab/equipment", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(u.cookie) },
      body: JSON.stringify({
        slug: "BadSlug",
        title: "Test",
        discipline: "chemistry",
        bookingPolicy: "open",
        status: "active",
      }),
    });
    expect(res.status).toBe(400);
  });

  test("happy path creates equipment and round-trips through GET", async () => {
    const u = await signup("happy");
    const slug = `eq-${testId}-happy`;
    const create = await req("/lab/equipment", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(u.cookie) },
      body: JSON.stringify({
        slug,
        title: "Test Spectrometer",
        discipline: "chemistry",
        manufacturer: "Acme",
        manualMd: "Press the big button.",
        bookingPolicy: "open",
        status: "active",
      }),
    });
    expect(create.status).toBe(201);
    const get = await req(`/lab/equipment/${slug}`);
    expect(get.status).toBe(200);
    const data = (await get.json()) as { equipment: { title: string; slug: string } };
    expect(data.equipment.slug).toBe(slug);
    expect(data.equipment.title).toBe("Test Spectrometer");
  });
});

describe("PUT /lab/equipment/:slug", () => {
  test("unauthenticated returns 401", async () => {
    const res = await req(`/lab/equipment/foo`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "x" }),
    });
    expect(res.status).toBe(401);
  });

  test("non-author returns 403", async () => {
    const owner = await signup("owner");
    const slug = `eq-${testId}-put`;
    await req("/lab/equipment", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(owner.cookie) },
      body: JSON.stringify({
        slug,
        title: "Owned",
        discipline: "biology",
        bookingPolicy: "open",
        status: "active",
      }),
    });

    const intruder = await signup("intruder");
    const res = await req(`/lab/equipment/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(intruder.cookie) },
      body: JSON.stringify({ title: "Hijacked" }),
    });
    expect(res.status).toBe(403);
  });
});

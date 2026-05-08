// Sprint 54 — DOI minting endpoint.

import { describe, test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "../index";
import { getDb, researchPapers, users } from "@axiomic/db";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string) {
  const username = `doi_${suffix}_${testId}`.slice(0, 30);
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

function promoteAdmin(username: string) {
  getDb().update(users).set({ role: "admin" }).where(eq(users.username, username)).run();
}

describe("/admin/mint-doi (Sprint 54)", () => {
  test("requires admin", async () => {
    const u = await signup("nonadmin");
    const r = await req("/admin/mint-doi", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(u.cookie) },
      body: JSON.stringify({ kind: "research", id: "00000000-0000-0000-0000-000000000000" }),
    });
    expect(r.status).toBe(403);
  });

  test("404 on unknown research id", async () => {
    const admin = await signup("a1");
    promoteAdmin(admin.username);
    const r = await req("/admin/mint-doi", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(admin.cookie),
      },
      body: JSON.stringify({
        kind: "research",
        id: "00000000-0000-0000-0000-000000000000",
      }),
    });
    expect(r.status).toBe(404);
  });

  test("mints + caches DOI on research paper", async () => {
    const author = await signup("a2");
    // Publish a paper.
    const create = await req("/research", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(author.cookie),
      },
      body: JSON.stringify({
        slug: `doi-paper-${testId}`,
        title: "DOI test paper",
        format: "explainer",
        contentUndergrad: "body",
        status: "published",
      }),
    });
    expect(create.status).toBe(201);
    const data = (await create.json()) as { paperId: string };

    const admin = await signup("a3");
    promoteAdmin(admin.username);

    const mint = await req("/admin/mint-doi", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(admin.cookie),
      },
      body: JSON.stringify({ kind: "research", id: data.paperId }),
    });
    expect(mint.status).toBe(200);
    const m = (await mint.json()) as { doi: string; alreadyMinted: boolean };
    expect(m.doi).toMatch(/^10\.5555\/axiomic\.research\./);
    expect(m.alreadyMinted).toBe(false);

    // Idempotent: a second call returns the same DOI with alreadyMinted=true.
    const mint2 = await req("/admin/mint-doi", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(admin.cookie),
      },
      body: JSON.stringify({ kind: "research", id: data.paperId }),
    });
    expect(mint2.status).toBe(200);
    const m2 = (await mint2.json()) as { doi: string; alreadyMinted: boolean };
    expect(m2.doi).toBe(m.doi);
    expect(m2.alreadyMinted).toBe(true);
  });
});

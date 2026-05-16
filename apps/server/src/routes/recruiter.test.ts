// Phase 30F — recruiter search + self-healing skill index.

import { describe, test, expect } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}
function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}
const testRun =
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
async function signup(suffix: string) {
  const username = `rc_${suffix}_${testRun}`.slice(0, 30);
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
    username,
  };
}

describe("recruiter search (Phase 30C)", () => {
  test("wallet view populates the index; search finds the user; privacy-off deletes; idempotent", async () => {
    const { getDb, researchPapers, reproductions, userSkillIndex } =
      await import("@axiomic/db");
    const { and, eq } = await import("drizzle-orm");
    const { randomUUID } = await import("crypto");
    const cand = await signup("cand");
    const skillSlug = `quantum-${testRun}`;

    const paperId = randomUUID();
    getDb()
      .insert(researchPapers)
      .values({
        id: paperId,
        slug: `rc-paper-${testRun}`,
        title: "Quantum paper",
        authorId: cand.userId,
        tags: JSON.stringify([skillSlug]),
      })
      .run();
    getDb()
      .insert(reproductions)
      .values({
        id: randomUUID(),
        articleId: null,
        targetKind: "research_paper",
        targetId: paperId,
        reproducerId: cand.userId,
        status: "success",
        credentialMintedAt: new Date().toISOString(),
      })
      .run();

    // Viewing the wallet self-heals the index (twice → idempotent).
    await req("/me/credentials", { headers: cookieHeader(cand.cookie) });
    await req("/me/credentials", { headers: cookieHeader(cand.cookie) });
    const rows = getDb()
      .select()
      .from(userSkillIndex)
      .where(
        and(
          eq(userSkillIndex.userId, cand.userId),
          eq(userSkillIndex.skillSlug, skillSlug),
        ),
      )
      .all();
    expect(rows.length).toBe(1); // upsert — no duplicate

    // Recruiter search finds them.
    const search = await req(
      `/recruiter/search?skill=${skillSlug}&minProofs=1`,
    );
    expect(search.status).toBe(200);
    const sb = (await search.json()) as {
      candidates: Array<{ username: string }>;
    };
    expect(
      sb.candidates.find((x) => x.username === cand.username),
    ).toBeDefined();

    // Skill catalog lists it.
    const cat = await req("/recruiter/skills");
    const cb = (await cat.json()) as {
      skills: Array<{ slug: string }>;
    };
    expect(cb.skills.find((s) => s.slug === skillSlug)).toBeDefined();

    // Go private → re-view wallet → index rows deleted → not found.
    await req("/me/credentials/visibility", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(cand.cookie),
      },
      body: JSON.stringify({ public: false }),
    });
    await req("/me/credentials", { headers: cookieHeader(cand.cookie) });
    const after = getDb()
      .select()
      .from(userSkillIndex)
      .where(eq(userSkillIndex.userId, cand.userId))
      .all();
    expect(after.length).toBe(0);
    const search2 = await req(
      `/recruiter/search?skill=${skillSlug}&minProofs=1`,
    );
    const sb2 = (await search2.json()) as {
      candidates: Array<{ username: string }>;
    };
    expect(
      sb2.candidates.find((x) => x.username === cand.username),
    ).toBeUndefined();
  });

  test("talent pools: create + add + dup 409 + owner-gated", async () => {
    const owner = await signup("po");
    const cand = await signup("pc");
    const intruder = await signup("pi");
    const mk = await req("/recruiter/pools", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(owner.cookie),
      },
      body: JSON.stringify({ name: `Pool ${testRun}` }),
    });
    expect(mk.status).toBe(201);
    const { id } = (await mk.json()) as { id: string };

    const add = await req(`/recruiter/pools/${id}/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(owner.cookie),
      },
      body: JSON.stringify({ candidateUsername: cand.username }),
    });
    expect(add.status).toBe(201);
    const dup = await req(`/recruiter/pools/${id}/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(owner.cookie),
      },
      body: JSON.stringify({ candidateUsername: cand.username }),
    });
    expect(dup.status).toBe(409);
    const intrude = await req(`/recruiter/pools/${id}`, {
      headers: cookieHeader(intruder.cookie),
    });
    expect(intrude.status).toBe(403);
  });
});

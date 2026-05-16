// Phase 29F — credential → skill mapping + recruiter rollup +
// portfolio export, with the privacy gate.

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
  const username = `cs_${suffix}_${testRun}`.slice(0, 30);
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

describe("credential skills rollup (Phase 29C)", () => {
  test("a verified reproduction inherits its paper's tags as skills; rollup + portfolio + privacy", async () => {
    const { getDb, researchPapers, reproductions } =
      await import("@axiomic/db");
    const { randomUUID } = await import("crypto");
    const owner = await signup("own");

    const paperId = randomUUID();
    getDb()
      .insert(researchPapers)
      .values({
        id: paperId,
        slug: `paper-${testRun}`,
        title: "Attention paper",
        authorId: owner.userId,
        tags: JSON.stringify(["transformers", "attention"]),
      })
      .run();
    getDb()
      .insert(reproductions)
      .values({
        id: randomUUID(),
        articleId: null,
        targetKind: "research_paper",
        targetId: paperId,
        reproducerId: owner.userId,
        status: "success",
        credentialMintedAt: new Date().toISOString(),
      })
      .run();

    // Wallet item carries the mapped skills.
    const wallet = await req("/me/credentials", {
      headers: cookieHeader(owner.cookie),
    });
    const wBody = (await wallet.json()) as {
      credentials: Array<{
        kind: string;
        skills: Array<{ slug: string; title: string }>;
      }>;
    };
    const repro = wBody.credentials.find((c) => c.kind === "reproduction");
    expect(repro).toBeDefined();
    const slugs = repro!.skills.map((s) => s.slug);
    expect(slugs).toContain("transformers");
    expect(slugs).toContain("attention");

    // Recruiter rollup groups by skill.
    const sum = await req(`/credentials/${owner.username}/skills-summary`);
    expect(sum.status).toBe(200);
    const sBody = (await sum.json()) as {
      skills: Array<{ slug: string; provenBy: unknown[] }>;
    };
    const t = sBody.skills.find((s) => s.slug === "transformers");
    expect(t).toBeDefined();
    expect(t!.provenBy.length).toBeGreaterThanOrEqual(1);

    // Portfolio HTML renders + contains the skill.
    const html = await req(
      `/credentials/${owner.username}/portfolio.html`,
    );
    expect(html.status).toBe(200);
    expect(html.headers.get("content-type")).toContain("text/html");
    const text = await html.text();
    expect(text.toLowerCase()).toContain("transformers");

    // Privacy: make private → public skills-summary + portfolio 403.
    await req("/me/credentials/visibility", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(owner.cookie),
      },
      body: JSON.stringify({ public: false }),
    });
    const sumPriv = await req(
      `/credentials/${owner.username}/skills-summary`,
    );
    expect(sumPriv.status).toBe(403);
    const htmlPriv = await req(
      `/credentials/${owner.username}/portfolio.html`,
    );
    expect(htmlPriv.status).toBe(403);
    // Owner still sees their own.
    const ownSum = await req(
      `/credentials/${owner.username}/skills-summary`,
      { headers: cookieHeader(owner.cookie) },
    );
    expect(ownSum.status).toBe(200);
  });
});

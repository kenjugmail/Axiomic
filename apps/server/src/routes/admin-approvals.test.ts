import { describe, test, expect } from "bun:test";
import { app } from "../index";
import { eq } from "drizzle-orm";
import { getDb, users } from "@axiomic/db";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string): Promise<{
  cookie: string;
  username: string;
  email: string;
}> {
  const username = `apr_${suffix}_${testId}`.slice(0, 30);
  const email = `${username}@example.com`;
  const res = await req("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password: "testpass123" }),
  });
  const cookie = res.headers.get("set-cookie") || "";
  return { cookie, username, email };
}

function promoteAdmin(username: string) {
  const db = getDb();
  db.update(users).set({ role: "admin" }).where(eq(users.username, username)).run();
}

describe("admin role gating (Sprint 52)", () => {
  test("non-admin gets 403 on /admin/proposals", async () => {
    const u = await signup("a1");
    const r = await req("/admin/proposals", {
      headers: cookieHeader(u.cookie),
    });
    expect(r.status).toBe(403);
  });

  test("admin can list + approve a proposal directly", async () => {
    const author = await signup("a2");
    const admin = await signup("a3");
    promoteAdmin(admin.username);

    // Create a proposal directly via the lib (lessons need a real
    // node, but a news_publish proposal is self-contained).
    const { createProposal, isApprovalGateEnabled } = await import("../lib/approvals");
    expect(isApprovalGateEnabled()).toBe(false); // default off in tests

    const result = createProposal({
      kind: "news_publish",
      targetId: null,
      proposerId: author.cookie ? (await getProposerId(author.username)) : "",
      payloadJson: JSON.stringify({
        slug: `apr-news-${testId}`,
        title: "Test article",
        body: "Body",
      }),
    });
    expect(result.status).toBe("pending");

    // Admin lists pending — should include our proposal.
    const list = await req("/admin/proposals", {
      headers: cookieHeader(admin.cookie),
    });
    expect(list.status).toBe(200);
    const listData = (await list.json()) as {
      proposals: Array<{ id: string; kind: string }>;
    };
    const found = listData.proposals.find((p) => p.id === result.id);
    expect(found).toBeDefined();
    expect(found!.kind).toBe("news_publish");

    // Approve.
    const approve = await req(`/admin/proposals/${result.id}/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(admin.cookie),
      },
      body: JSON.stringify({ note: "looks good" }),
    });
    expect(approve.status).toBe(200);

    // Detail now shows approved.
    const detail = await req(`/admin/proposals/${result.id}`, {
      headers: cookieHeader(admin.cookie),
    });
    expect(detail.status).toBe(200);
    const detailData = (await detail.json()) as {
      proposal: { status: string; reviewerUsername: string };
    };
    expect(detailData.proposal.status).toBe("approved");
    expect(detailData.proposal.reviewerUsername).toBe(admin.username);
  });

  test("reject flips status without applying", async () => {
    const author = await signup("a4");
    const admin = await signup("a5");
    promoteAdmin(admin.username);
    const { createProposal } = await import("../lib/approvals");
    const result = createProposal({
      kind: "news_publish",
      targetId: null,
      proposerId: await getProposerId(author.username),
      payloadJson: JSON.stringify({
        slug: `apr-rej-${testId}`,
        title: "Rejected article",
        body: "Body",
      }),
    });
    const rej = await req(`/admin/proposals/${result.id}/reject`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(admin.cookie),
      },
      body: JSON.stringify({ note: "off-topic" }),
    });
    expect(rej.status).toBe(200);

    // The article should NOT exist now.
    const news = await req(`/news/apr-rej-${testId}`);
    expect(news.status).toBe(404);
  });

  test("/me/proposals lists the caller's own proposals", async () => {
    const author = await signup("a6");
    const { createProposal } = await import("../lib/approvals");
    const result = createProposal({
      kind: "news_publish",
      targetId: null,
      proposerId: await getProposerId(author.username),
      payloadJson: JSON.stringify({
        slug: `apr-mine-${testId}`,
        title: "Mine",
        body: "x",
      }),
    });
    const r = await req("/me/proposals", { headers: cookieHeader(author.cookie) });
    expect(r.status).toBe(200);
    const data = (await r.json()) as {
      proposals: Array<{ id: string; status: string }>;
    };
    const mine = data.proposals.find((p) => p.id === result.id);
    expect(mine).toBeDefined();
    expect(mine!.status).toBe("pending");
  });
});

async function getProposerId(username: string): Promise<string> {
  const db = getDb();
  const row = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .get();
  if (!row) throw new Error(`User ${username} not found`);
  return row.id;
}

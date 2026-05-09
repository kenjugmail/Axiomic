// Sprint 67b — comments route coverage.
//
// Comment threading, voting, edits, and authorization. The route is
// load-bearing for wiki + news + many other pages; was the largest
// untested gap after S66b.

import { describe, test, expect, beforeAll } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
let counter = 0;

async function signup(label: string): Promise<{ cookie: string; username: string }> {
  const username = `comment_${label}_${testId}_${counter++}`;
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

let alice = "";
let bob = "";
let sharedPageId = "";

beforeAll(async () => {
  alice = (await signup("alice")).cookie;
  bob = (await signup("bob")).cookie;
  // Comments has a FK constraint to wiki_pages.id, so seed a real page.
  const slug = `comments-test-${testId}`;
  const page = await req("/wiki", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cookieHeader(alice) },
    body: JSON.stringify({
      slug,
      title: "Comments test page",
      contentIntro: "i",
      contentUndergrad: "u",
      contentGrad: "g",
    }),
  });
  sharedPageId = ((await page.json()) as any).page.id;
});

describe("comments route (Sprint 67b)", () => {
  test("POST / requires authentication", async () => {
    const res = await req("/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId: sharedPageId, content: "anon" }),
    });
    expect(res.status).toBe(401);
  });

  test("POST / creates a top-level comment", async () => {
    const res = await req("/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(alice) },
      body: JSON.stringify({ pageId: sharedPageId, content: "first comment" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.comment.content).toBe("first comment");
    expect(body.comment.parentId).toBeNull();
    expect(body.comment.score).toBe(0);
  });

  test("POST / creates a nested reply", async () => {
    const root = await req("/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(alice) },
      body: JSON.stringify({ pageId: sharedPageId, content: "parent" }),
    });
    const parentId = ((await root.json()) as any).comment.id;
    const reply = await req("/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(bob) },
      body: JSON.stringify({ pageId: sharedPageId, content: "child", parentId }),
    });
    expect(reply.status).toBe(201);
    expect(((await reply.json()) as any).comment.parentId).toBe(parentId);
  });

  test("POST / rejects empty content (zod)", async () => {
    const res = await req("/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(alice) },
      body: JSON.stringify({ pageId: sharedPageId, content: "" }),
    });
    expect(res.status).toBe(400);
  });

  test("GET /:pageId returns nested tree", async () => {
    // Seed a fresh page for this test so the tree contains exactly
    // what we expect.
    const treeSlug = `comments-tree-${testId}`;
    const pageRes = await req("/wiki", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(alice) },
      body: JSON.stringify({
        slug: treeSlug,
        title: "Tree page",
        contentIntro: "i",
        contentUndergrad: "u",
        contentGrad: "g",
      }),
    });
    const pageId = ((await pageRes.json()) as any).page.id;
    const root = await req("/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(alice) },
      body: JSON.stringify({ pageId, content: "root" }),
    });
    const rootId = ((await root.json()) as any).comment.id;
    await req("/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(bob) },
      body: JSON.stringify({ pageId, content: "reply A", parentId: rootId }),
    });
    await req("/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(bob) },
      body: JSON.stringify({ pageId, content: "reply B", parentId: rootId }),
    });
    const res = await req(`/comments/${pageId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.comments).toHaveLength(1);
    expect(body.comments[0].children).toHaveLength(2);
  });

  test("PUT /:id updates own comment", async () => {
    const created = await req("/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(alice) },
      body: JSON.stringify({ pageId: sharedPageId, content: "before" }),
    });
    const id = ((await created.json()) as any).comment.id;
    const update = await req(`/comments/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(alice) },
      body: JSON.stringify({ content: "after" }),
    });
    expect(update.status).toBe(200);
    expect(((await update.json()) as any).comment.content).toBe("after");
  });

  test("PUT /:id 403s on non-owner edit", async () => {
    const created = await req("/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(alice) },
      body: JSON.stringify({ pageId: sharedPageId, content: "alice's" }),
    });
    const id = ((await created.json()) as any).comment.id;
    const update = await req(`/comments/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(bob) },
      body: JSON.stringify({ content: "bob's hijack" }),
    });
    expect(update.status).toBe(403);
  });

  test("PUT /:id 404s on unknown id", async () => {
    const res = await req("/comments/nonexistent-id-xyz", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(alice) },
      body: JSON.stringify({ content: "ghost" }),
    });
    expect(res.status).toBe(404);
  });

  test("POST /:id/vote with +1 returns a score", async () => {
    // Sign up a fresh voter so test order doesn't matter for session state.
    const voter = (await signup("voter")).cookie;
    const created = await req("/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(alice) },
      body: JSON.stringify({ pageId: sharedPageId, content: "voteable" }),
    });
    const id = ((await created.json()) as any).comment.id;

    const up1 = await req(`/comments/${id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(voter) },
      body: JSON.stringify({ value: 1 }),
    });
    expect(up1.status).toBe(200);
    expect(((await up1.json()) as any).ok).toBe(true);

    // GET /:pageId reflects the new vote count.
    const tree = await req(`/comments/${sharedPageId}`);
    const treeBody = (await tree.json()) as any;
    const found = treeBody.comments.find((c: any) => c.id === id);
    expect(found.score).toBe(1);
  });

  test("POST /:id/vote requires auth", async () => {
    const created = await req("/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(alice) },
      body: JSON.stringify({ pageId: sharedPageId, content: "vote-anon-test" }),
    });
    const id = ((await created.json()) as any).comment.id;
    const res = await req(`/comments/${id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: 1 }),
    });
    expect(res.status).toBe(401);
  });
});

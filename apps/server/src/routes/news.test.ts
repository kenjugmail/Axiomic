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
  const username = `news_${suffix}_${testId}`;
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

describe("news create + read", () => {
  test("anyone can list; signed-in user can create; rejects duplicate slugs", async () => {
    const { cookie } = await signup("a");
    const slug = `breaking-${testId}`;

    const create = await req("/news", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        slug,
        title: "Breaking news",
        summary: "A short summary.",
        body: "## Hello\n\nThis is a body with *markdown*.",
        coverEmoji: "🚀",
        accentColor: "emerald",
      }),
    });
    expect(create.status).toBe(201);

    const fetched = await req(`/news/${slug}`);
    expect(fetched.status).toBe(200);
    const body = (await fetched.json()) as { article: any };
    expect(body.article.title).toBe("Breaking news");
    expect(body.article.coverEmoji).toBe("🚀");
    expect(body.article.accentColor).toBe("emerald");
    expect(body.article.readingMinutes).toBeGreaterThan(0);
    expect(body.article.reactionCounts.thumbs).toBe(0);
    expect(body.article.pendingProposalCount).toBe(0);

    const list = await req("/news");
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as { articles: any[] };
    expect(listBody.articles.some((a) => a.slug === slug)).toBe(true);

    // Duplicate slug rejected.
    const dup = await req("/news", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        slug,
        title: "x",
        summary: "",
        body: "x",
      }),
    });
    expect(dup.status).toBe(409);
  });

  test("requires auth to create", async () => {
    const res = await req("/news", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `nope-${testId}`,
        title: "x",
        summary: "",
        body: "x",
      }),
    });
    expect(res.status).toBe(401);
  });
});

describe("news direct edit", () => {
  test("only the author can PUT; others get 403", async () => {
    const author = await signup("author1");
    const other = await signup("other1");
    const slug = `editable-${testId}`;

    await req("/news", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({
        slug,
        title: "Title v1",
        summary: "Sum1",
        body: "Body v1",
      }),
    });

    const edit = await req(`/news/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({
        title: "Title v2",
        summary: "Sum2",
        body: "Body v2",
      }),
    });
    expect(edit.status).toBe(200);

    const stranger = await req(`/news/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(other.cookie) },
      body: JSON.stringify({
        title: "I am not the author",
        summary: "x",
        body: "x",
      }),
    });
    expect(stranger.status).toBe(403);

    const fetched = await req(`/news/${slug}`);
    const body = (await fetched.json()) as { article: any };
    expect(body.article.title).toBe("Title v2");
  });
});

describe("news proposal flow", () => {
  test("proposer cannot be author; author approves → article is updated; proposal is recorded", async () => {
    const author = await signup("author2");
    const proposer = await signup("proposer1");
    const slug = `proposable-${testId}`;

    await req("/news", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({
        slug,
        title: "ORIGINAL",
        summary: "ORIG",
        body: "ORIGINAL_BODY",
      }),
    });

    // Author cannot self-propose.
    const selfPropose = await req(`/news/${slug}/proposals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({
        proposedTitle: "x",
        proposedSummary: "x",
        proposedBody: "x",
      }),
    });
    expect(selfPropose.status).toBe(400);

    // Other user proposes.
    const propose = await req(`/news/${slug}/proposals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(proposer.cookie) },
      body: JSON.stringify({
        proposedTitle: "EDITED",
        proposedSummary: "EDIT_SUMMARY",
        proposedBody: "EDITED_BODY",
        message: "Tightened the intro paragraph.",
      }),
    });
    expect(propose.status).toBe(201);
    const proposalBody = (await propose.json()) as { proposalId: string };
    const proposalId = proposalBody.proposalId;

    // Stranger cannot view the proposal queue.
    const stranger = await req(`/news/${slug}/proposals`, {
      headers: cookieHeader(proposer.cookie),
    });
    expect(stranger.status).toBe(403);

    const queue = await req(`/news/${slug}/proposals`, {
      headers: cookieHeader(author.cookie),
    });
    expect(queue.status).toBe(200);
    const queueBody = (await queue.json()) as { proposals: any[] };
    expect(queueBody.proposals).toHaveLength(1);
    expect(queueBody.proposals[0].status).toBe("pending");

    // Stranger can't approve.
    const strangerApprove = await req(
      `/news/${slug}/proposals/${proposalId}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(proposer.cookie) },
        body: JSON.stringify({}),
      },
    );
    expect(strangerApprove.status).toBe(403);

    // Author approves.
    const approve = await req(
      `/news/${slug}/proposals/${proposalId}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
        body: JSON.stringify({ reviewMessage: "thanks!" }),
      },
    );
    expect(approve.status).toBe(200);

    // Article reflects the approved content; lastEditor is the proposer.
    const fetched = await req(`/news/${slug}`);
    const articleBody = (await fetched.json()) as { article: any };
    expect(articleBody.article.title).toBe("EDITED");
    expect(articleBody.article.body).toBe("EDITED_BODY");
    expect(articleBody.article.lastEditorUsername).toBe(proposer.username);

    // Re-approving should fail (status no longer pending).
    const reApprove = await req(
      `/news/${slug}/proposals/${proposalId}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
        body: JSON.stringify({}),
      },
    );
    expect(reApprove.status).toBe(400);
  });

  test("rejection leaves the article unchanged; status flips to rejected", async () => {
    const author = await signup("author3");
    const proposer = await signup("proposer2");
    const slug = `reject-test-${testId}`;
    await req("/news", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({
        slug,
        title: "KEEP",
        summary: "KEEP",
        body: "KEEP",
      }),
    });

    const propose = await req(`/news/${slug}/proposals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(proposer.cookie) },
      body: JSON.stringify({
        proposedTitle: "OVERWRITTEN",
        proposedSummary: "x",
        proposedBody: "x",
      }),
    });
    const { proposalId } = (await propose.json()) as { proposalId: string };

    const reject = await req(
      `/news/${slug}/proposals/${proposalId}/reject`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
        body: JSON.stringify({ reviewMessage: "out of scope" }),
      },
    );
    expect(reject.status).toBe(200);

    const fetched = await req(`/news/${slug}`);
    const articleBody = (await fetched.json()) as { article: any };
    expect(articleBody.article.title).toBe("KEEP");
  });
});

describe("news reactions", () => {
  test("toggle: insert then delete; returns counts and per-user state", async () => {
    const author = await signup("author4");
    const reactor = await signup("reactor1");
    const slug = `reactable-${testId}`;
    await req("/news", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({
        slug,
        title: "React-test",
        summary: "x",
        body: "x",
      }),
    });

    const on = await req(`/news/${slug}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(reactor.cookie) },
      body: JSON.stringify({ kind: "thumbs" }),
    });
    expect(on.status).toBe(200);
    const onBody = (await on.json()) as {
      reactionCounts: Record<string, number>;
      myReactions: Record<string, boolean>;
    };
    expect(onBody.reactionCounts.thumbs).toBe(1);
    expect(onBody.myReactions.thumbs).toBe(true);

    const off = await req(`/news/${slug}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(reactor.cookie) },
      body: JSON.stringify({ kind: "thumbs" }),
    });
    expect(off.status).toBe(200);
    const offBody = (await off.json()) as {
      reactionCounts: Record<string, number>;
      myReactions: Record<string, boolean>;
    };
    expect(offBody.reactionCounts.thumbs).toBe(0);
    expect(offBody.myReactions.thumbs).toBe(false);
  });

  test("requires auth", async () => {
    const res = await req("/news/anything-here/reactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "thumbs" }),
    });
    expect(res.status).toBe(401);
  });
});

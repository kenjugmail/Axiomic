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

describe("news comments", () => {
  test("anyone can read; signed-in users can post; replies thread under parent", async () => {
    const author = await signup("comm_a");
    const replier = await signup("comm_b");
    const slug = `commentable-${testId}`;
    await req("/news", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({ slug, title: "C", summary: "", body: "x" }),
    });

    const post = await req(`/news/${slug}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(replier.cookie) },
      body: JSON.stringify({ content: "Top-level comment" }),
    });
    expect(post.status).toBe(201);
    const top = (await post.json()) as { commentId: string };

    const reply = await req(`/news/${slug}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({ content: "A reply", parentId: top.commentId }),
    });
    expect(reply.status).toBe(201);

    const list = await req(`/news/${slug}/comments`);
    expect(list.status).toBe(200);
    const body = (await list.json()) as { comments: any[] };
    expect(body.comments).toHaveLength(1);
    expect(body.comments[0].id).toBe(top.commentId);
    expect(body.comments[0].children).toHaveLength(1);
  });

  test("rejects parent comment from another article", async () => {
    const author = await signup("comm_c");
    const slug = `crossref-${testId}`;
    await req("/news", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({ slug, title: "C", summary: "", body: "x" }),
    });
    const bad = await req(`/news/${slug}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({ content: "x", parentId: "no-such-id" }),
    });
    expect(bad.status).toBe(400);
  });

  test("only the comment author can edit", async () => {
    const a = await signup("comm_d");
    const b = await signup("comm_e");
    const slug = `edit-comment-${testId}`;
    await req("/news", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(a.cookie) },
      body: JSON.stringify({ slug, title: "C", summary: "", body: "x" }),
    });
    const post = await req(`/news/${slug}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(a.cookie) },
      body: JSON.stringify({ content: "original" }),
    });
    const { commentId } = (await post.json()) as { commentId: string };

    const stranger = await req(`/news/comments/${commentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(b.cookie) },
      body: JSON.stringify({ content: "tampered" }),
    });
    expect(stranger.status).toBe(403);

    const own = await req(`/news/comments/${commentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(a.cookie) },
      body: JSON.stringify({ content: "updated" }),
    });
    expect(own.status).toBe(200);
  });
});

describe("news bookmarks", () => {
  test("toggle adds then removes; bookmarks list reflects state; article carries myBookmark", async () => {
    const author = await signup("bm_a");
    const reader = await signup("bm_b");
    const slug = `bookmarkable-${testId}`;
    await req("/news", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({ slug, title: "B", summary: "", body: "x" }),
    });

    const on = await req(`/news/${slug}/bookmark`, {
      method: "POST",
      headers: cookieHeader(reader.cookie),
    });
    expect(on.status).toBe(200);
    expect(((await on.json()) as { bookmarked: boolean }).bookmarked).toBe(true);

    const list = await req("/news/me/bookmarks", { headers: cookieHeader(reader.cookie) });
    const listBody = (await list.json()) as { articles: any[] };
    expect(listBody.articles.some((a) => a.slug === slug)).toBe(true);

    const get = await req(`/news/${slug}`, { headers: cookieHeader(reader.cookie) });
    expect(((await get.json()) as { article: any }).article.myBookmark).toBe(true);

    const off = await req(`/news/${slug}/bookmark`, {
      method: "POST",
      headers: cookieHeader(reader.cookie),
    });
    expect(((await off.json()) as { bookmarked: boolean }).bookmarked).toBe(false);
  });

  test("bookmark requires auth", async () => {
    const res = await req("/news/whatever/bookmark", { method: "POST" });
    expect(res.status).toBe(401);
  });
});

describe("news drafts + tags", () => {
  test("drafts are private to author; published list filters them out; tag filter works", async () => {
    const author = await signup("draft_a");
    const stranger = await signup("draft_b");

    const slug = `draft-test-${testId}`;
    await req("/news", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({
        slug,
        title: "Draft only",
        summary: "private",
        body: "x",
        status: "draft",
        tags: ["unit-test", "drafts"],
      }),
    });

    // Stranger sees a 404 — slug isn't even revealed.
    const peek = await req(`/news/${slug}`, { headers: cookieHeader(stranger.cookie) });
    expect(peek.status).toBe(404);

    // Author can fetch.
    const own = await req(`/news/${slug}`, { headers: cookieHeader(author.cookie) });
    expect(own.status).toBe(200);
    const ownBody = (await own.json()) as { article: any };
    expect(ownBody.article.status).toBe("draft");
    expect(ownBody.article.tags).toEqual(["unit-test", "drafts"]);

    // Drafts list returns it for the author and not for the stranger.
    const myDrafts = await req("/news/me/drafts", { headers: cookieHeader(author.cookie) });
    const myDraftsBody = (await myDrafts.json()) as { articles: any[] };
    expect(myDraftsBody.articles.some((a) => a.slug === slug)).toBe(true);

    const otherDrafts = await req("/news/me/drafts", { headers: cookieHeader(stranger.cookie) });
    const otherDraftsBody = (await otherDrafts.json()) as { articles: any[] };
    expect(otherDraftsBody.articles.some((a) => a.slug === slug)).toBe(false);

    // Public listing excludes drafts.
    const list = await req("/news");
    const listBody = (await list.json()) as { articles: any[] };
    expect(listBody.articles.some((a) => a.slug === slug)).toBe(false);
  });

  test("publishing a draft via PUT moves it into the public list", async () => {
    const author = await signup("draft_c");
    const slug = `pubflow-${testId}`;
    await req("/news", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({
        slug,
        title: "T",
        summary: "S",
        body: "B",
        status: "draft",
        tags: ["pub-test"],
      }),
    });

    await req(`/news/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({
        title: "T2",
        summary: "S2",
        body: "B2",
        status: "published",
        tags: ["pub-test"],
      }),
    });

    const list = await req("/news?tag=pub-test");
    const listBody = (await list.json()) as { articles: any[] };
    expect(listBody.articles.some((a) => a.slug === slug)).toBe(true);
  });

  test("tags catalog reports counts for published articles only", async () => {
    const author = await signup("tag_a");
    // Unique tag per test run so prior-run rows don't pollute the count.
    const uniqueTag = `cat-${testId}`;
    await req("/news", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({
        slug: `tagged-pub-${testId}`,
        title: "P",
        summary: "",
        body: "x",
        tags: [uniqueTag],
      }),
    });
    await req("/news", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({
        slug: `tagged-draft-${testId}`,
        title: "D",
        summary: "",
        body: "x",
        status: "draft",
        tags: [uniqueTag],
      }),
    });

    const res = await req("/news/tags");
    const body = (await res.json()) as { tags: Array<{ tag: string; count: number }> };
    const ct = body.tags.find((t) => t.tag === uniqueTag);
    expect(ct).toBeDefined();
    expect(ct!.count).toBe(1); // draft excluded
  });
});

describe("news derive-lesson (Paper → Lesson pipeline)", () => {
  function validSlides() {
    return [
      { kind: "text", title: "Setup", body: "Intro paragraph." },
      { kind: "text", title: "Concept", body: "Core idea." },
      {
        kind: "question",
        question: {
          id: "q-1",
          kind: "multiple_choice",
          question: "Which is right?",
          options: ["a", "b", "c", "d"],
          correctIndex: 1,
          explanation: "Because b.",
        },
      },
    ];
  }

  test("requires authentication", async () => {
    const author = await signup("dl_anon_a");
    const slug = `dl-anon-${testId}`;
    await req("/news", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({ slug, title: "T", summary: "", body: "Body" }),
    });
    const res = await req(`/news/${slug}/derive-lesson`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slides: validSlides() }),
    });
    expect(res.status).toBe(401);
  });

  test("non-author, non-coauthor cannot derive a lesson", async () => {
    const author = await signup("dl_owner");
    const stranger = await signup("dl_stranger");
    const slug = `dl-strict-${testId}`;
    await req("/news", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({ slug, title: "T", summary: "", body: "Body" }),
    });
    const res = await req(`/news/${slug}/derive-lesson`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(stranger.cookie) },
      body: JSON.stringify({ slides: validSlides() }),
    });
    expect(res.status).toBe(403);
  });

  test("author derives a lesson, article + lesson are cross-linked", async () => {
    const author = await signup("dl_ok");
    const slug = `dl-ok-${testId}`;
    await req("/news", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({
        slug,
        title: "FlashAttention",
        summary: "Why it's fast",
        body: "Long body about the memory hierarchy.",
      }),
    });

    const derive = await req(`/news/${slug}/derive-lesson`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({ slides: validSlides() }),
    });
    expect(derive.status).toBe(200);
    const dr = (await derive.json()) as {
      nodeId: string;
      nodeSlug: string;
      pathSlug: string;
    };
    expect(dr.pathSlug).toBe("from-articles");
    expect(dr.nodeSlug).toBe(slug);

    const fetched = await req(`/news/${slug}`);
    const ab = (await fetched.json()) as { article: any };
    expect(ab.article.derivedLesson).toBeTruthy();
    expect(ab.article.derivedLesson.pathSlug).toBe("from-articles");
    expect(ab.article.derivedLesson.nodeSlug).toBe(slug);

    const lessonRes = await req(`/mastery/lesson/${dr.nodeId}`);
    expect(lessonRes.status).toBe(200);
    const lessonBody = (await lessonRes.json()) as {
      lesson: { slides: any[] } | null;
      sourceArticle: { slug: string; authorUsername: string } | null;
    };
    expect(lessonBody.lesson?.slides.length).toBe(3);
    expect(lessonBody.sourceArticle?.slug).toBe(slug);
    expect(lessonBody.sourceArticle?.authorUsername).toBe(author.username);
  });

  test("calling derive-lesson twice updates the same node", async () => {
    const author = await signup("dl_idem");
    const slug = `dl-idem-${testId}`;
    await req("/news", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({ slug, title: "T", summary: "", body: "Body" }),
    });
    const first = (await (
      await req(`/news/${slug}/derive-lesson`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
        body: JSON.stringify({ slides: validSlides() }),
      })
    ).json()) as { nodeId: string };

    const updatedSlides = [
      ...validSlides(),
      { kind: "text", title: "Extra", body: "One more." },
    ];
    const second = (await (
      await req(`/news/${slug}/derive-lesson`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
        body: JSON.stringify({ slides: updatedSlides }),
      })
    ).json()) as { nodeId: string };

    expect(second.nodeId).toBe(first.nodeId);

    const lessonRes = await req(`/mastery/lesson/${first.nodeId}`);
    const lessonBody = (await lessonRes.json()) as { lesson: { slides: any[] } };
    expect(lessonBody.lesson.slides.length).toBe(4);
  });

  test("rejects duplicate question ids", async () => {
    const author = await signup("dl_dup");
    const slug = `dl-dup-${testId}`;
    await req("/news", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({ slug, title: "T", summary: "", body: "Body" }),
    });
    const dupSlides = [
      { kind: "text", title: "S", body: "B" },
      {
        kind: "question",
        question: {
          id: "q-dup",
          kind: "multiple_choice",
          question: "?",
          options: ["a", "b", "c", "d"],
          correctIndex: 0,
        },
      },
      {
        kind: "question",
        question: {
          id: "q-dup",
          kind: "multiple_choice",
          question: "?",
          options: ["a", "b", "c", "d"],
          correctIndex: 0,
        },
      },
    ];
    const res = await req(`/news/${slug}/derive-lesson`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({ slides: dupSlides }),
    });
    expect(res.status).toBe(400);
  });
});

describe("news claim threads (Sprint 14 — claim-anchored discussion)", () => {
  async function makeArticle(authorCookie: string, slug: string) {
    await req("/news", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(authorCookie) },
      body: JSON.stringify({
        slug,
        title: "T",
        summary: "",
        body: "Some passage about transformers and attention.",
      }),
    });
  }

  test("requires authentication to start a thread", async () => {
    const author = await signup("ct_anon");
    const slug = `ct-anon-${testId}`;
    await makeArticle(author.cookie, slug);
    const res = await req(`/news/${slug}/claim-threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exact: "attention",
        prefix: "and ",
        suffix: ".",
        body: "Hot take",
      }),
    });
    expect(res.status).toBe(401);
  });

  test("creates a thread with a first comment, listing returns the pair", async () => {
    const author = await signup("ct_owner");
    const reader = await signup("ct_reader");
    const slug = `ct-ok-${testId}`;
    await makeArticle(author.cookie, slug);
    const create = await req(`/news/${slug}/claim-threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(reader.cookie) },
      body: JSON.stringify({
        exact: "attention",
        prefix: "and ",
        suffix: ".",
        body: "Why attention here?",
      }),
    });
    expect(create.status).toBe(201);
    const cb = (await create.json()) as { threadId: string; commentId: string };

    const list = await req(`/news/${slug}/claim-threads`);
    expect(list.status).toBe(200);
    const lb = (await list.json()) as {
      threads: Array<{
        id: string;
        exact: string;
        authorUsername: string;
        replies: any[];
      }>;
    };
    expect(lb.threads.length).toBe(1);
    expect(lb.threads[0].id).toBe(cb.threadId);
    expect(lb.threads[0].exact).toBe("attention");
    expect(lb.threads[0].authorUsername).toBe(reader.username);
    expect(lb.threads[0].replies.length).toBe(1);
    expect(lb.threads[0].replies[0].content).toBe("Why attention here?");
  });

  test("article-level comments listing excludes claim-thread replies", async () => {
    const author = await signup("ct_excl");
    const reader = await signup("ct_excl_r");
    const slug = `ct-excl-${testId}`;
    await makeArticle(author.cookie, slug);
    // Regular comment.
    await req(`/news/${slug}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(reader.cookie) },
      body: JSON.stringify({ content: "Article-level comment." }),
    });
    // Claim thread + its reply.
    const ct = (await (
      await req(`/news/${slug}/claim-threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(reader.cookie) },
        body: JSON.stringify({
          exact: "transformers",
          prefix: "about ",
          suffix: " and ",
          body: "Pinned to a passage.",
        }),
      })
    ).json()) as { threadId: string };

    await req(`/news/${slug}/claim-threads/${ct.threadId}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(reader.cookie) },
      body: JSON.stringify({ content: "Follow-up reply." }),
    });

    const cmts = await req(`/news/${slug}/comments`);
    const cb = (await cmts.json()) as { comments: any[] };
    expect(cb.comments.length).toBe(1);
    expect(cb.comments[0].content).toBe("Article-level comment.");
  });

  test("reply route rejects mismatched thread id", async () => {
    const author = await signup("ct_mm");
    const slug = `ct-mm-${testId}`;
    await makeArticle(author.cookie, slug);
    const res = await req(`/news/${slug}/claim-threads/does-not-exist/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({ content: "Hi" }),
    });
    expect(res.status).toBe(404);
  });

  test("reply notifies the thread author + prior repliers, not the actor", async () => {
    const author = await signup("ctn_o");
    const opener = await signup("ctn_p");
    const replier = await signup("ctn_r");
    const slug = `ct-notif-${testId}`;
    await makeArticle(author.cookie, slug);

    const ct = (await (
      await req(`/news/${slug}/claim-threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(opener.cookie) },
        body: JSON.stringify({
          exact: "attention",
          prefix: "and ",
          suffix: ".",
          body: "Why this framing?",
        }),
      })
    ).json()) as { threadId: string };

    // Replier joins. Should notify both the article author (who is also
    // the thread participant by virtue of authoring the article? no —
    // the thread author is the opener; article author got notified at
    // thread-create) and the opener.
    await req(`/news/${slug}/claim-threads/${ct.threadId}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(replier.cookie) },
      body: JSON.stringify({ content: "I think so too." }),
    });

    // Opener should have a claim_thread_reply notification.
    const openerNotifs = await req("/notifications", {
      headers: cookieHeader(opener.cookie),
    });
    expect(openerNotifs.status).toBe(200);
    const ob = (await openerNotifs.json()) as { notifications?: any[] };
    expect(Array.isArray(ob.notifications)).toBe(true);
    expect(
      (ob.notifications ?? []).some(
        (n) =>
          n.kind === "claim_thread_reply" &&
          n.subjectType === "claim_thread" &&
          n.subjectId === ct.threadId,
      ),
    ).toBe(true);

    // Replier should NOT have notified themselves.
    const replierNotifs = await req("/notifications", {
      headers: cookieHeader(replier.cookie),
    });
    expect(replierNotifs.status).toBe(200);
    const rb = (await replierNotifs.json()) as { notifications?: any[] };
    expect(
      (rb.notifications ?? []).some(
        (n) =>
          n.kind === "claim_thread_reply" && n.subjectId === ct.threadId,
      ),
    ).toBe(false);
  });
});

describe("news related", () => {
  test("returns up to 4 articles, excluding the current one", async () => {
    const author = await signup("rel_a");
    for (let i = 0; i < 3; i++) {
      await req("/news", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
        body: JSON.stringify({
          slug: `related-${i}-${testId}`,
          title: `Related ${i}`,
          summary: "",
          body: "x",
        }),
      });
    }
    const res = await req(`/news/related-0-${testId}/related`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { articles: any[] };
    expect(body.articles.length).toBeGreaterThan(0);
    expect(body.articles.length).toBeLessThanOrEqual(4);
    expect(body.articles.every((a) => a.slug !== `related-0-${testId}`)).toBe(true);
  });
});

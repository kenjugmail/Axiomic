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
  const username = `cs_${suffix}_${testId}`.slice(0, 30);
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

const goodRubric = {
  criteria: [
    {
      id: "correctness",
      weight: 0.6,
      description: "Code does what the milestone asks.",
      aiPrompt: "Score correctness of the submitted code.",
    },
    {
      id: "writeup",
      weight: 0.4,
      description: "Writeup explains the approach.",
      aiPrompt: "Score the depth and clarity of the writeup.",
    },
  ],
  passingScore: 0.6,
};

describe("capstones CRUD (Sprint 26)", () => {
  test("anonymous create rejected", async () => {
    const res = await req("/capstones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `cs-anon-${testId}`,
        title: "Anon",
        contentUndergrad: "Body",
      }),
    });
    expect(res.status).toBe(401);
  });

  test("create draft → fetch as author → publish → list shows it", async () => {
    const { cookie } = await signup("crud");
    const slug = `cs-crud-${testId}`;
    const create = await req("/capstones", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        slug,
        title: "Build a transformer from scratch",
        summary: "End-to-end implementation of a tiny transformer.",
        contentUndergrad: "## What you'll build\n\nA 2-layer transformer trained on a copy task.",
        estimatedWeeks: 8,
        prerequisiteWikiSlugs: ["softmax", "attention"],
        tags: ["transformers"],
      }),
    });
    expect(create.status).toBe(201);

    // Author can read draft.
    const asAuthor = await req(`/capstones/${slug}`, { headers: cookieHeader(cookie) });
    expect(asAuthor.status).toBe(200);

    // Anonymous user gets 404 on draft.
    const anon = await req(`/capstones/${slug}`);
    expect(anon.status).toBe(404);

    // Publish.
    const publish = await req(`/capstones/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ status: "published" }),
    });
    expect(publish.status).toBe(200);

    // Anonymous read works after publish.
    const after = await req(`/capstones/${slug}`);
    expect(after.status).toBe(200);
    const data = (await after.json()) as any;
    expect(data.capstone.title).toContain("transformer");
    expect(data.capstone.prerequisiteWikiSlugs).toContain("softmax");

    // List endpoint includes it.
    const list = await req("/capstones");
    const listed = (await list.json()) as any;
    expect(listed.capstones.some((c: any) => c.slug === slug)).toBe(true);
  });

  test("non-author cannot edit", async () => {
    const author = await signup("auth");
    const intruder = await signup("intruder");
    const slug = `cs-acl-${testId}`;
    await req("/capstones", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({
        slug,
        title: "Locked capstone",
        contentUndergrad: "Body",
      }),
    });
    const res = await req(`/capstones/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(intruder.cookie) },
      body: JSON.stringify({ title: "Hijack" }),
    });
    expect(res.status).toBe(403);
  });

  test("milestone CRUD: add → list (via capstone) → update → delete", async () => {
    const { cookie } = await signup("ms");
    const slug = `cs-ms-${testId}`;
    await req("/capstones", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        slug,
        title: "Milestone capstone",
        contentUndergrad: "Body",
        status: "published",
      }),
    });

    // Add two milestones.
    const m1 = await req(`/capstones/${slug}/milestones`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        title: "Milestone 1",
        description: "Build the tokenizer.",
        rubric: goodRubric,
        requiredArtifactKinds: ["github"],
      }),
    });
    expect(m1.status).toBe(201);
    const m1Id = (await m1.json() as any).milestoneId;

    await req(`/capstones/${slug}/milestones`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        title: "Milestone 2",
        rubric: goodRubric,
      }),
    });

    // Fetch capstone — milestones come back ordered.
    const fetch = await req(`/capstones/${slug}`);
    const capData = (await fetch.json()) as any;
    expect(capData.capstone.milestones.length).toBe(2);
    expect(capData.capstone.milestones[0].title).toBe("Milestone 1");
    expect(capData.capstone.milestones[0].rubric.criteria[0].id).toBe("correctness");

    // Update milestone 1.
    const upd = await req(`/capstones/${slug}/milestones/${m1Id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ title: "Milestone 1: tokens" }),
    });
    expect(upd.status).toBe(200);

    // Delete milestone 1.
    const del = await req(`/capstones/${slug}/milestones/${m1Id}`, {
      method: "DELETE",
      headers: cookieHeader(cookie),
    });
    expect(del.status).toBe(200);

    const fetch2 = await req(`/capstones/${slug}`);
    const capData2 = (await fetch2.json()) as any;
    expect(capData2.capstone.milestones.length).toBe(1);
  });
});

describe("capstones enrollment + submissions (Sprint 27)", () => {
  test("enrollment is idempotent + scoped per learner", async () => {
    const author = await signup("a1");
    const learner = await signup("l1");
    const slug = `cs-enroll-${testId}`;
    await req("/capstones", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({
        slug,
        title: "Enroll test",
        contentUndergrad: "Body",
        status: "published",
      }),
    });

    const e1 = await req(`/capstones/${slug}/enroll`, {
      method: "POST",
      headers: cookieHeader(learner.cookie),
    });
    expect(e1.status).toBe(201);
    const e1Body = (await e1.json()) as any;

    // Second enroll returns same id, status 200.
    const e2 = await req(`/capstones/${slug}/enroll`, {
      method: "POST",
      headers: cookieHeader(learner.cookie),
    });
    expect(e2.status).toBe(200);
    const e2Body = (await e2.json()) as any;
    expect(e2Body.enrollmentId).toBe(e1Body.enrollmentId);

    // Author cannot enroll in own capstone.
    const own = await req(`/capstones/${slug}/enroll`, {
      method: "POST",
      headers: cookieHeader(author.cookie),
    });
    expect(own.status).toBe(400);
  });

  test("submit milestone runs grader and stores submission", async () => {
    const author = await signup("a2");
    const learner = await signup("l2");
    const slug = `cs-submit-${testId}`;
    await req("/capstones", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({
        slug,
        title: "Submit test",
        contentUndergrad: "Body",
        status: "published",
      }),
    });
    const m1 = await req(`/capstones/${slug}/milestones`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({
        title: "M1",
        rubric: goodRubric,
      }),
    });
    const milestoneId = (await m1.json() as any).milestoneId;

    await req(`/capstones/${slug}/enroll`, {
      method: "POST",
      headers: cookieHeader(learner.cookie),
    });

    // Submit without enrolling first → blocked. Use a different learner.
    const intruder = await signup("intr2");
    const blocked = await req(`/capstones/${slug}/milestones/${milestoneId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(intruder.cookie) },
      body: JSON.stringify({
        artifacts: [],
        writeup: "blocked",
      }),
    });
    expect(blocked.status).toBe(400);

    // Real submit.
    const longWriteup =
      "I implemented the tokenizer using a byte-pair encoding loop. " +
      "I started with character vocab, then merged the most frequent pair. " +
      "After 200 merges, I evaluated on a held-out sample and observed the expected vocab size + token count drop. " +
      "The trickiest part was handling unicode characters, which I solved by normalizing to NFC before encoding. " +
      "I plotted token frequency vs merge step and saw the expected long-tail. ".repeat(2);

    const submit = await req(`/capstones/${slug}/milestones/${milestoneId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(learner.cookie) },
      body: JSON.stringify({
        artifacts: [
          {
            kind: "github",
            url: "https://github.com/example/tokenizer",
            label: "Source code",
          },
        ],
        writeup: longWriteup,
      }),
    });
    expect(submit.status).toBe(201);
    const sub = (await submit.json() as any).submission;
    expect(sub).not.toBeNull();
    expect(["pending", "passed", "needs_revision"]).toContain(sub.status);
    expect(sub.aiGrade).not.toBeNull();
    expect(typeof sub.aiGrade.score).toBe("number");
    expect(sub.aiGrade.perCriterion.length).toBeGreaterThan(0);
  });

  test("required-artifact-kinds gate rejects submissions missing them", async () => {
    const author = await signup("a3");
    const learner = await signup("l3");
    const slug = `cs-req-${testId}`;
    await req("/capstones", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({
        slug,
        title: "Req test",
        contentUndergrad: "Body",
        status: "published",
      }),
    });
    const m1 = await req(`/capstones/${slug}/milestones`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({
        title: "M1",
        rubric: goodRubric,
        requiredArtifactKinds: ["github", "writeup"],
      }),
    });
    const mid = (await m1.json() as any).milestoneId;
    await req(`/capstones/${slug}/enroll`, {
      method: "POST",
      headers: cookieHeader(learner.cookie),
    });

    const bad = await req(`/capstones/${slug}/milestones/${mid}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(learner.cookie) },
      body: JSON.stringify({
        artifacts: [
          { kind: "github", url: "https://github.com/x/y", label: "code" },
        ],
        writeup: "short",
      }),
    });
    expect(bad.status).toBe(400);
  });

  test("passing every milestone creates the public artifact page", async () => {
    const author = await signup("a4");
    const learner = await signup("l4");
    const slug = `cs-graduate-${testId}`;
    await req("/capstones", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({
        slug,
        title: "Graduate test",
        contentUndergrad: "Body",
        status: "published",
      }),
    });
    // Single milestone with very lenient passing score so the
    // heuristic grader sails through.
    const easyRubric = {
      criteria: [
        {
          id: "any",
          weight: 1,
          description: "Anything goes.",
          aiPrompt: "Score generously.",
        },
      ],
      passingScore: 0.05,
    };
    const m1 = await req(`/capstones/${slug}/milestones`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({ title: "Easy", rubric: easyRubric }),
    });
    const mid = (await m1.json() as any).milestoneId;
    await req(`/capstones/${slug}/enroll`, {
      method: "POST",
      headers: cookieHeader(learner.cookie),
    });
    const longWriteup = "Detailed writeup ".repeat(100);
    const submit = await req(`/capstones/${slug}/milestones/${mid}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(learner.cookie) },
      body: JSON.stringify({
        artifacts: [
          { kind: "writeup", url: "https://example.com/x", label: "Notes" },
        ],
        writeup: longWriteup,
      }),
    });
    expect(submit.status).toBe(201);
    const sub = (await submit.json() as any).submission;
    expect(sub.status).toBe("passed");

    // Artifact page is now public.
    const artifactSlug = `${learner.username}-${slug}`;
    const page = await req(`/capstones/c/${artifactSlug}`);
    expect(page.status).toBe(200);
    const pageData = (await page.json()) as any;
    expect(pageData.artifact.capstone.slug).toBe(slug);
    expect(pageData.artifact.learner.username).toBe(learner.username);
    expect(pageData.artifact.submissions.length).toBe(1);

    // myEnrollment surfaces on the capstone too.
    const cap = await req(`/capstones/${slug}`, { headers: cookieHeader(learner.cookie) });
    const capData = (await cap.json()) as any;
    expect(capData.capstone.myEnrollment).not.toBeNull();
    expect(capData.capstone.myEnrollment.passedMilestoneIds).toContain(mid);
    expect(capData.capstone.myEnrollment.artifactPageSlug).toBe(artifactSlug);
  });
});

// Sprint 39 — peer review tests.
//
// Cover: anon submit rejected, self-review rejected, review on a
// non-passed submission rejected, valid review creates a row +
// reflects in /reviews + /artifact, second submission from same
// reviewer overwrites, withdraw deletes, transcript manifest folds
// peer review counts in.

import { describe, test, expect } from "bun:test";
import { app } from "../index";
import {
  capstoneEnrollments,
  capstoneMilestones,
  capstoneSubmissions,
  capstones,
  getDb,
  users,
} from "@axiomic/db";
import { randomUUID } from "crypto";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string) {
  const username = `pr_${suffix}_${testId}`.slice(0, 30);
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
  const data = (await res.json()) as any;
  return { cookie, username, userId: data?.user?.id as string };
}

interface Fixture {
  capstoneSlug: string;
  artifactSlug: string;
  submissionId: string;
  enrollmentId: string;
  authorId: string;
  learnerId: string;
  learnerCookie: string;
}

async function makeCompletedFixture(suffix: string, opts?: { passed?: boolean }): Promise<Fixture> {
  const author = await signup(`auth-${suffix}`);
  const learner = await signup(`learn-${suffix}`);
  const db = getDb();

  const capstoneId = randomUUID();
  const slug = `pr-cap-${suffix}-${testId}`;
  db.insert(capstones).values({
    id: capstoneId,
    slug,
    title: "Capstone",
    summary: "A summary",
    contentIntro: "intro",
    contentUndergrad: "undergrad",
    contentGrad: "grad",
    canonicalTier: "undergrad",
    estimatedWeeks: 4,
    prerequisiteWikiSlugs: "[]",
    prerequisiteNodeIds: "[]",
    tags: "[]",
    coverEmoji: "🎓",
    accentColor: "violet",
    status: "published",
    authorId: author.userId,
  }).run();

  const milestoneId = randomUUID();
  db.insert(capstoneMilestones).values({
    id: milestoneId,
    capstoneId,
    order: 1,
    title: "Implement",
    description: "",
    rubricJson: "{}",
    requiredArtifactKinds: "[]",
    estimatedDays: 3,
  }).run();

  const enrollmentId = randomUUID();
  const artifactSlug = `${learner.username}-${slug}`;
  const now = new Date().toISOString();
  db.insert(capstoneEnrollments).values({
    id: enrollmentId,
    capstoneId,
    userId: learner.userId,
    startedAt: now,
    completedAt: now,
    artifactPageSlug: artifactSlug,
  }).run();

  const submissionId = randomUUID();
  db.insert(capstoneSubmissions).values({
    id: submissionId,
    enrollmentId,
    milestoneId,
    artifactsJson: "[]",
    writeup: "",
    status: opts?.passed === false ? "pending" : "passed",
    aiGradeJson: JSON.stringify({ score: 0.9, totalScore: 0.9 }),
    submittedAt: now,
    gradedAt: now,
  }).run();

  return {
    capstoneSlug: slug,
    artifactSlug,
    submissionId,
    enrollmentId,
    authorId: author.userId,
    learnerId: learner.userId,
    learnerCookie: learner.cookie,
  };
}

describe("Sprint 39 — peer review", () => {
  test("anonymous submit is 401", async () => {
    const fix = await makeCompletedFixture("anon");
    const res = await req(
      `/capstones/submissions/${fix.submissionId}/reviews`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "endorsed",
          score: 0.9,
          feedback: "Looks great. Clear writeup and clean code.",
        }),
      },
    );
    expect(res.status).toBe(401);
  });

  test("learner cannot review their own submission", async () => {
    const fix = await makeCompletedFixture("self");
    const res = await req(
      `/capstones/submissions/${fix.submissionId}/reviews`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...cookieHeader(fix.learnerCookie),
        },
        body: JSON.stringify({
          status: "endorsed",
          score: 0.9,
          feedback: "I love my own work, definitely.",
        }),
      },
    );
    expect(res.status).toBe(400);
  });

  test("review on a non-passed submission is 400", async () => {
    const fix = await makeCompletedFixture("notpassed", { passed: false });
    const reviewer = await signup("notpassed-rev");
    const res = await req(
      `/capstones/submissions/${fix.submissionId}/reviews`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...cookieHeader(reviewer.cookie),
        },
        body: JSON.stringify({
          status: "endorsed",
          score: 0.9,
          feedback: "Trying to review something not passed yet.",
        }),
      },
    );
    expect(res.status).toBe(400);
  });

  test("valid review creates row, second submission overwrites, withdraw deletes", async () => {
    const fix = await makeCompletedFixture("ok");
    const reviewer = await signup("ok-rev");

    const create = await req(
      `/capstones/submissions/${fix.submissionId}/reviews`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...cookieHeader(reviewer.cookie),
        },
        body: JSON.stringify({
          status: "endorsed",
          score: 0.92,
          feedback: "Strong implementation, clear writeup.",
        }),
      },
    );
    expect(create.status).toBe(201);
    const created = (await create.json()) as any;
    expect(created.updated).toBe(false);

    // Listing reflects the new review.
    const list1 = await req(`/capstones/c/${fix.artifactSlug}/reviews`);
    const data1 = (await list1.json()) as any;
    expect(data1.reviews.length).toBe(1);
    expect(data1.reviews[0].status).toBe("endorsed");
    expect(data1.reviews[0].score).toBeCloseTo(0.92, 5);

    // Second submission from the same reviewer overwrites.
    const update = await req(
      `/capstones/submissions/${fix.submissionId}/reviews`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...cookieHeader(reviewer.cookie),
        },
        body: JSON.stringify({
          status: "requested_changes",
          score: 0.6,
          feedback: "Actually I changed my mind on the writeup section.",
        }),
      },
    );
    expect(update.status).toBe(200);
    const updated = (await update.json()) as any;
    expect(updated.updated).toBe(true);
    expect(updated.id).toBe(created.id);

    const list2 = await req(`/capstones/c/${fix.artifactSlug}/reviews`);
    const data2 = (await list2.json()) as any;
    expect(data2.reviews.length).toBe(1);
    expect(data2.reviews[0].status).toBe("requested_changes");

    // Artifact response carries the peer review summary.
    const artifact = await req(`/capstones/c/${fix.artifactSlug}`);
    const aData = (await artifact.json()) as any;
    expect(aData.artifact.peerReviewSummary.totalReviews).toBe(1);
    expect(aData.artifact.peerReviewSummary.totalEndorsed).toBe(0);

    // Withdraw deletes the row.
    const del = await req(`/capstones/reviews/${created.id}`, {
      method: "DELETE",
      headers: cookieHeader(reviewer.cookie),
    });
    expect(del.status).toBe(200);

    const list3 = await req(`/capstones/c/${fix.artifactSlug}/reviews`);
    const data3 = (await list3.json()) as any;
    expect(data3.reviews.length).toBe(0);
  });

  test("review queue surfaces under-reviewed artifacts first", async () => {
    const a = await makeCompletedFixture("queue-a");
    const b = await makeCompletedFixture("queue-b");
    // Drop a single review on B so A surfaces first by review-deficit.
    const reviewer = await signup("queue-rev");
    await req(`/capstones/submissions/${b.submissionId}/reviews`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(reviewer.cookie),
      },
      body: JSON.stringify({
        status: "endorsed",
        score: 0.9,
        feedback: "Looks good to me, ready to ship.",
      }),
    });
    const res = await req("/capstones/review-queue?limit=50");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    const aIdx = (data.artifacts as any[]).findIndex(
      (x) => x.artifactPageSlug === a.artifactSlug,
    );
    const bIdx = (data.artifacts as any[]).findIndex(
      (x) => x.artifactPageSlug === b.artifactSlug,
    );
    expect(aIdx).toBeGreaterThanOrEqual(0);
    expect(bIdx).toBeGreaterThanOrEqual(0);
    expect(aIdx).toBeLessThan(bIdx);
  });

  test("transcript manifest folds in peer review counts", async () => {
    const fix = await makeCompletedFixture("tx");
    const reviewer = await signup("tx-rev");
    await req(`/capstones/submissions/${fix.submissionId}/reviews`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(reviewer.cookie),
      },
      body: JSON.stringify({
        status: "endorsed",
        score: 0.95,
        feedback: "Endorsing this — strong work.",
      }),
    });
    const res = await req(`/capstones/c/${fix.artifactSlug}/transcript`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.manifest.peerReviews.totalReviews).toBe(1);
    expect(data.manifest.peerReviews.totalEndorsed).toBe(1);
    expect(data.manifest.peerReviews.averageScore).toBeCloseTo(0.95, 5);
  });
});

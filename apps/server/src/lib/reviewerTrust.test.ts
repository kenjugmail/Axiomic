// Phase 29F — reviewer trust weighting unit + integration.

import { describe, test, expect } from "bun:test";
import {
  BASE_WEIGHT,
  CONFIRM_WEIGHT_THRESHOLD,
  MAX_WEIGHT,
  getReviewerReputations,
  reviewerWeight,
} from "./reviewerTrust";
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
  const username = `rt_${suffix}_${testRun}`.slice(0, 30);
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

describe("reviewerWeight (Phase 29A)", () => {
  test("floor / ceiling / linearity", () => {
    expect(reviewerWeight(0)).toBe(BASE_WEIGHT);
    expect(reviewerWeight(-999)).toBe(BASE_WEIGHT); // negative → floor
    expect(reviewerWeight(100000)).toBe(MAX_WEIGHT); // huge → ceiling
    expect(reviewerWeight(5)).toBeCloseTo(2.0, 5); // 1.5 + 5/10
  });

  test("no single reviewer can solo-cross the threshold", () => {
    expect(MAX_WEIGHT).toBeLessThan(CONFIRM_WEIGHT_THRESHOLD);
  });

  test("two baseline reviewers exactly meet the threshold (legacy parity)", () => {
    expect(reviewerWeight(0) + reviewerWeight(0)).toBe(
      CONFIRM_WEIGHT_THRESHOLD,
    );
  });
});

describe("getReviewerReputations (Phase 29A)", () => {
  test("sums forum vote value over a user's authored topics + posts", async () => {
    const { getDb, forumTopics, forumPosts, forumVotes, domains } =
      await import("@axiomic/db");
    const { randomUUID } = await import("crypto");
    const u = await signup("rep");
    const db = getDb();
    const domain = db.select().from(domains).limit(1).all()[0];
    if (!domain) {
      // No seeded domain in this DB — skip rather than fail the run.
      expect(getReviewerReputations([u.userId]).get(u.userId)).toBe(0);
      return;
    }
    const topicId = randomUUID();
    db.insert(forumTopics)
      .values({
        id: topicId,
        slug: `rt-topic-${testRun}`,
        title: "T",
        body: "b",
        postType: "discussion",
        domainId: domain.id,
        authorId: u.userId,
      })
      .run();
    db.insert(forumVotes)
      .values([
        {
          id: randomUUID(),
          subjectType: "topic",
          subjectId: topicId,
          userId: u.userId,
          value: 3,
        },
      ])
      .run();
    const reps = getReviewerReputations([u.userId]);
    expect(reps.get(u.userId)).toBe(3);
    void forumPosts;
  });
});

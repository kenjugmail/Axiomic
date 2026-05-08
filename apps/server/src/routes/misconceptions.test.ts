// Sprint 38 — Misconception marketplace tests.
//
// Cover: anon submit rejected, signed-in submit creates row with auto
// +1 from proposer, duplicate-key submit blocked, voting toggles,
// threshold promotes the entry into misconception_catalog, voting on
// merged submissions is rejected.

import { describe, test, expect } from "bun:test";
import { app } from "../index";
import {
  getDb,
  misconceptionCatalog,
  misconceptionSubmissions,
} from "@axiomic/db";
import { and, eq } from "drizzle-orm";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string) {
  const username = `mp_${suffix}_${testId}`.slice(0, 30);
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

const VALID_SUBMISSION = {
  conceptSlug: `mp-concept-${testId}`,
  key: `mp-key-${testId}`,
  label: "A new misconception worth catching",
  description:
    "Learners often confuse X with Y because they look similar in the canonical example, but the underlying mechanism is different.",
  probeQuestions: [
    "When does the difference actually matter for downstream outputs?",
  ],
};

describe("Sprint 38 — misconception marketplace", () => {
  test("submit requires auth", async () => {
    const res = await req("/misconceptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_SUBMISSION),
    });
    expect(res.status).toBe(401);
  });

  test("submit creates a row with proposer auto +1", async () => {
    const { cookie } = await signup("submit");
    const res = await req("/misconceptions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        ...VALID_SUBMISSION,
        key: `mp-submit-${testId}`,
      }),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as any;
    expect(data.id).toBeDefined();
    expect(data.voteScore).toBe(1);

    // Returned in the listing.
    const list = await req("/misconceptions?status=open&sort=recent");
    const listData = (await list.json()) as any;
    const found = listData.submissions.find((s: any) => s.id === data.id);
    expect(found).toBeDefined();
    expect(found.voteScore).toBe(1);
  });

  test("duplicate key submission is rejected", async () => {
    const { cookie } = await signup("dup");
    const key = `mp-dup-${testId}`;
    const first = await req("/misconceptions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ ...VALID_SUBMISSION, key }),
    });
    expect(first.status).toBe(201);

    const second = await req("/misconceptions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ ...VALID_SUBMISSION, key }),
    });
    expect(second.status).toBe(409);
  });

  test("voting toggles + clears + promotes at threshold", async () => {
    const proposer = await signup("vote-prop");
    const id = await (async () => {
      const res = await req("/misconceptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...cookieHeader(proposer.cookie),
        },
        body: JSON.stringify({
          ...VALID_SUBMISSION,
          key: `mp-promote-${testId}`,
          conceptSlug: `mp-promote-${testId}`,
        }),
      });
      const data = (await res.json()) as any;
      return data.id as string;
    })();

    // Four more upvotes → score = 5 = PROMOTION_THRESHOLD.
    let lastScore = 1;
    let promoted = false;
    let catalogId: string | null = null;
    for (let i = 0; i < 4; i++) {
      const v = await signup(`v${i}-${testId}`);
      const res = await req(`/misconceptions/${id}/vote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...cookieHeader(v.cookie),
        },
        body: JSON.stringify({ value: 1 }),
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      lastScore = data.voteScore;
      if (data.promoted) {
        promoted = true;
        catalogId = data.catalogId;
      }
    }
    expect(lastScore).toBeGreaterThanOrEqual(5);
    expect(promoted).toBe(true);
    expect(catalogId).toBeTruthy();

    // The catalog row exists with the same key.
    const db = getDb();
    const cat = db
      .select()
      .from(misconceptionCatalog)
      .where(
        and(
          eq(misconceptionCatalog.conceptSlug, `mp-promote-${testId}`),
          eq(misconceptionCatalog.key, `mp-promote-${testId}`),
        ),
      )
      .get();
    expect(cat).toBeDefined();
    expect(cat?.id).toBe(catalogId!);

    // Submission is now 'merged'.
    const sub = db
      .select()
      .from(misconceptionSubmissions)
      .where(eq(misconceptionSubmissions.id, id))
      .get();
    expect(sub?.status).toBe("merged");

    // Voting on a merged submission is rejected.
    const v2 = await signup(`extra-${testId}`);
    const reject = await req(`/misconceptions/${id}/vote`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(v2.cookie),
      },
      body: JSON.stringify({ value: 1 }),
    });
    expect(reject.status).toBe(400);
  });

  test("vote toggle: +1 then 0 clears the vote", async () => {
    const proposer = await signup("toggle-prop");
    const create = await req("/misconceptions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(proposer.cookie),
      },
      body: JSON.stringify({
        ...VALID_SUBMISSION,
        key: `mp-toggle-${testId}`,
        conceptSlug: `mp-toggle-${testId}`,
      }),
    });
    const { id } = (await create.json()) as any;

    const voter = await signup("toggle-voter");
    const up = await req(`/misconceptions/${id}/vote`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(voter.cookie),
      },
      body: JSON.stringify({ value: 1 }),
    });
    expect(((await up.json()) as any).voteScore).toBe(2);

    const clear = await req(`/misconceptions/${id}/vote`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(voter.cookie),
      },
      body: JSON.stringify({ value: 0 }),
    });
    expect(((await clear.json()) as any).voteScore).toBe(1);

    const down = await req(`/misconceptions/${id}/vote`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(voter.cookie),
      },
      body: JSON.stringify({ value: -1 }),
    });
    expect(((await down.json()) as any).voteScore).toBe(0);
  });

  test("submitting a key that already exists in the catalog is rejected", async () => {
    // Seed a catalog row directly.
    const db = getDb();
    const slug = `mp-existing-${testId}`;
    const key = `mp-existing-${testId}`;
    db.insert(misconceptionCatalog).values({
      id: `cat-${testId}`,
      conceptSlug: slug,
      key,
      label: "Already exists",
      description: "Already in the catalog.",
      probeQuestionsJson: "[]",
      correctionPromptTemplate: "",
    }).run();

    const { cookie } = await signup("clash");
    const res = await req("/misconceptions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ ...VALID_SUBMISSION, conceptSlug: slug, key }),
    });
    expect(res.status).toBe(409);
  });
});

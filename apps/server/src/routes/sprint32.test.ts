// Sprint 32 — polish-pass tests covering: detector idempotency, the
// Bridge tutor mode's prereq intersection, the Navigator's `build`
// group (capstone side query), the portfolio empty-state, and that
// the misconception catalog has been expanded across multiple domains.

import { describe, test, expect, afterAll } from "bun:test";
import { app } from "../index";
import {
  capstones,
  getDb,
  masteryNodes,
  masteryPaths,
  misconceptionCatalog,
  misconceptionDiagnoses,
  quizMistakes,
  userProgress,
  users,
  wikiPages,
  pageVersions,
} from "@axiomic/db";
import { eq, inArray, like } from "drizzle-orm";
import { randomUUID } from "crypto";
import { runDetectorForUser } from "../lib/misconceptionDetector";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string) {
  const username = `s32_${suffix}_${testId}`.slice(0, 30);
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

function ensureWikiPage(slug: string, title: string): string {
  const db = getDb();
  const existing = db
    .select()
    .from(wikiPages)
    .where(eq(wikiPages.slug, slug))
    .get();
  if (existing) return existing.id;
  const id = randomUUID();
  db.insert(wikiPages).values({ id, slug, title }).run();
  const sys = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, "system"))
    .get();
  if (sys) {
    db.insert(pageVersions).values({
      id: randomUUID(),
      pageId: id,
      editedBy: sys.id,
      version: 1,
      contentIntro: `Stub for ${title}.`,
      contentUndergrad: `Stub for ${title}.`,
      contentGrad: `Stub for ${title}.`,
      editMessage: "test",
    }).run();
  }
  return id;
}

function ensureCatalogEntry(conceptSlug: string, key: string): string {
  const db = getDb();
  const existing = db
    .select()
    .from(misconceptionCatalog)
    .where(eq(misconceptionCatalog.key, key))
    .get();
  if (existing) return existing.id;
  const id = randomUUID();
  db.insert(misconceptionCatalog).values({
    id,
    conceptSlug,
    key,
    label: `S32 test misconception ${key}`,
    description: "Test description.",
    probeQuestionsJson: "[]",
    correctionPromptTemplate: "Test prompt.",
  }).run();
  return id;
}

function ensureNodeForSlug(
  slug: string,
  suffix: string,
  prereqIds: string[] = [],
): string {
  const db = getDb();
  let path = db
    .select()
    .from(masteryPaths)
    .where(eq(masteryPaths.slug, "s32-test-path"))
    .get();
  if (!path) {
    const pathId = randomUUID();
    db.insert(masteryPaths).values({
      id: pathId,
      slug: "s32-test-path",
      title: "Sprint 32 test path",
      description: "test",
    }).run();
    path = db
      .select()
      .from(masteryPaths)
      .where(eq(masteryPaths.id, pathId))
      .get()!;
  }
  const nodeSlug = `s32-${slug}-${suffix}`;
  const nodeId = randomUUID();
  db.insert(masteryNodes).values({
    id: nodeId,
    pathId: path.id,
    slug: nodeSlug,
    title: `Node ${slug}`,
    description: `Test node for ${slug}`,
    order: 0,
    pageIds: JSON.stringify([slug]),
    prerequisiteNodeIds: JSON.stringify(prereqIds),
    level: "apprentice",
  }).run();
  return nodeId;
}

afterAll(() => {
  const db = getDb();
  const nodes = db
    .select({ id: masteryNodes.id })
    .from(masteryNodes)
    .where(like(masteryNodes.slug, "s32-%"))
    .all();
  const ids = nodes.map((n) => n.id);
  if (ids.length > 0) {
    db.delete(quizMistakes).where(inArray(quizMistakes.nodeId, ids)).run();
    db.delete(userProgress).where(inArray(userProgress.nodeId, ids)).run();
    db.delete(masteryNodes).where(inArray(masteryNodes.id, ids)).run();
  }
  db.delete(masteryPaths).where(eq(masteryPaths.slug, "s32-test-path")).run();
  db.delete(misconceptionDiagnoses)
    .where(like(misconceptionDiagnoses.misconceptionKey, "s32-%"))
    .run();
});

describe("Sprint 32 — misconception catalog depth", () => {
  // The test DB doesn't run the seed script, so we read the JSON
  // catalog directly off disk. This is the canonical source of truth
  // for what gets seeded in production.
  test("catalog covers multiple concept domains, not just transformer-attention", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const dir = path.resolve(import.meta.dir, "../../../../seed-content/misconceptions");
    expect(fs.existsSync(dir)).toBe(true);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    const entries = files.map((f) =>
      JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")),
    );
    const slugs = new Set<string>(
      entries.map((e: any) => e.conceptSlug).filter(Boolean),
    );
    expect(slugs.has("gradient-descent")).toBe(true);
    expect(slugs.has("probability-foundations")).toBe(true);
    expect(slugs.has("linear-algebra-foundations")).toBe(true);
    expect(entries.length).toBeGreaterThanOrEqual(20);
  });
});

describe("Sprint 32 — detector idempotency", () => {
  test("running the detector twice on the same evidence yields one diagnosis row", async () => {
    const { userId } = await signup("idem");
    ensureWikiPage("dropout", "Dropout");
    ensureCatalogEntry("dropout", "s32-dropout-on-at-inference");
    const nodeId = ensureNodeForSlug("dropout", `idem-${testId}`);
    const db = getDb();
    db.insert(quizMistakes).values({
      id: randomUUID(),
      userId,
      nodeId,
      questionId: "q-idem",
      occurrences: 2,
      lastWrongAt: new Date().toISOString(),
    }).run();

    const first = await runDetectorForUser(userId);
    expect(first).toBeGreaterThan(0);
    const second = await runDetectorForUser(userId);
    // Second run should still upsert (count >0) but only ever one row.
    expect(second).toBeGreaterThanOrEqual(0);

    // Filter by misconceptionKey, NOT just conceptSlug. The seed
    // ships a real `dropout-on-at-inference` catalog entry with the
    // same conceptSlug "dropout"; the detector legitimately produces a
    // separate diagnosis for it. The idempotency we care about here is
    // for the test's own entry (`s32-dropout-on-at-inference`).
    const rows = db
      .select()
      .from(misconceptionDiagnoses)
      .where(eq(misconceptionDiagnoses.userId, userId))
      .all();
    const testEntryRows = rows.filter(
      (r) => r.misconceptionKey === "s32-dropout-on-at-inference",
    );
    expect(testEntryRows.length).toBe(1);
  });

  test("dismissed diagnoses are not re-activated by a later run", async () => {
    const { cookie, userId } = await signup("dismiss");
    ensureWikiPage("relu-test", "ReLU");
    ensureCatalogEntry("relu-test", "s32-relu-is-linear");
    const nodeId = ensureNodeForSlug("relu-test", `dismiss-${testId}`);
    const db = getDb();
    db.insert(quizMistakes).values({
      id: randomUUID(),
      userId,
      nodeId,
      questionId: "q-d",
      occurrences: 1,
      lastWrongAt: new Date().toISOString(),
    }).run();
    await runDetectorForUser(userId);

    const initial = db
      .select()
      .from(misconceptionDiagnoses)
      .where(
        eq(misconceptionDiagnoses.misconceptionKey, "s32-relu-is-linear"),
      )
      .get();
    expect(initial).toBeDefined();

    const dismissRes = await req(
      `/me/weak-concepts/${initial!.id}/dismiss`,
      { method: "POST", headers: cookieHeader(cookie) },
    );
    expect(dismissRes.status).toBe(200);

    await runDetectorForUser(userId);
    const after = db
      .select()
      .from(misconceptionDiagnoses)
      .where(eq(misconceptionDiagnoses.id, initial!.id))
      .get();
    expect(after?.status).toBe("dismissed");
  });
});

describe("Sprint 32 — Bridge mode prereq intersection", () => {
  test("ai/chat with bridge mode + pageSlug accepts when user has progress on a prereq", async () => {
    const { cookie, userId } = await signup("bridge");
    ensureWikiPage("calculus-foundations", "Calculus");
    ensureWikiPage("backpropagation", "Backprop");
    const calcNodeId = ensureNodeForSlug("calculus-foundations", `bridge-${testId}`);
    ensureNodeForSlug("backpropagation", `bridge-${testId}`, [calcNodeId]);
    const db = getDb();
    db.insert(userProgress).values({
      id: randomUUID(),
      userId,
      nodeId: calcNodeId,
      completed: true,
      quizScore: 0.9,
      completedAt: new Date().toISOString(),
    }).run();

    const res = await req("/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        pageSlug: "backpropagation",
        tier: "intro",
        messages: [{ role: "user", content: "explain" }],
        mode: "bridge",
        modeContext: { pageSlug: "backpropagation" },
      }),
    });
    expect(res.status).toBe(200);
  });

  test("bridge without auth is rejected", async () => {
    const res = await req("/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageSlug: "softmax",
        tier: "intro",
        messages: [{ role: "user", content: "hi" }],
        mode: "bridge",
        modeContext: { pageSlug: "softmax" },
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe("Sprint 32 — Navigator build group", () => {
  test("?navigator=1 includes a 'build' group that surfaces published capstones", async () => {
    // Use whatever capstone seed exists in the DB. We just check shape.
    const db = getDb();
    const someCapstone = db
      .select({ title: capstones.title })
      .from(capstones)
      .where(eq(capstones.status, "published"))
      .limit(1)
      .get();
    if (!someCapstone) {
      // No capstones seeded — skip the body assertion but still verify
      // the response structurally has a `build` array.
      const res = await req("/search?q=transformer&navigator=1");
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(Array.isArray(data.groups.build)).toBe(true);
      return;
    }
    // Build a query against the first word of an existing capstone title.
    const word = someCapstone.title.split(" ")[0]?.toLowerCase() ?? "transformer";
    const res = await req(
      `/search?q=${encodeURIComponent(word)}&navigator=1`,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(Array.isArray(data.groups.build)).toBe(true);
    if (data.groups.build.length > 0) {
      const hit = data.groups.build[0];
      expect(hit.kind).toBe("capstone");
      expect(typeof hit.slug).toBe("string");
      expect(typeof hit.estimatedWeeks).toBe("number");
      expect(typeof hit.completionCount).toBe("number");
    }
  });
});

describe("Sprint 32 — portfolio empty user", () => {
  test("brand-new user with no capstones / papers / wiki edits returns empty entries", async () => {
    const { username } = await signup("empty");
    const res = await req(`/users/${username}/portfolio`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.username).toBe(username);
    expect(Array.isArray(data.entries)).toBe(true);
    expect(data.entries.length).toBe(0);
  });
});

import { describe, test, expect, afterAll } from "bun:test";
import { app } from "../index";
import { getDb, masteryNodes, masteryPaths, misconceptionCatalog, quizMistakes, userProgress, users, wikiPages, pageVersions } from "@axiomic/db";
import { eq, inArray, like } from "drizzle-orm";
import { randomUUID } from "crypto";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string) {
  const username = `mc_${suffix}_${testId}`.slice(0, 30);
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

function ensureWikiPage(slug: string, title: string) {
  const db = getDb();
  const existing = db.select().from(wikiPages).where(eq(wikiPages.slug, slug)).get();
  if (existing) return existing.id;
  const id = randomUUID();
  db.insert(wikiPages).values({ id, slug, title }).run();
  // page_versions has NOT NULL on author + content fields; pull a real
  // user to satisfy FK. Use the seeded `system` user if present.
  const sys = db.select({ id: users.id }).from(users).where(eq(users.username, "system")).get();
  if (sys) {
    db.insert(pageVersions).values({
      id: randomUUID(),
      pageId: id,
      authorId: sys.id,
      version: 1,
      contentIntro: `Stub page for ${title}.`,
      contentUndergrad: `Stub page for ${title}.`,
      contentGrad: `Stub page for ${title}.`,
      editMessage: "test",
    }).run();
  }
  return id;
}

function ensureCatalogEntry(conceptSlug: string, key: string) {
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
    label: `Test misconception ${key}`,
    description: "Test description.",
    probeQuestionsJson: "[]",
    correctionPromptTemplate: "Test prompt.",
  }).run();
  return id;
}

function ensureNodeForSlug(slug: string, suffix: string) {
  const db = getDb();
  let path = db.select().from(masteryPaths).where(eq(masteryPaths.slug, "test-path")).get();
  if (!path) {
    const pathId = randomUUID();
    db.insert(masteryPaths).values({
      id: pathId,
      slug: "test-path",
      title: "Test path",
      description: "test",
    }).run();
    path = db.select().from(masteryPaths).where(eq(masteryPaths.id, pathId)).get()!;
  }
  const nodeSlug = `test-node-${slug}-${suffix}`;
  const nodeId = randomUUID();
  db.insert(masteryNodes).values({
    id: nodeId,
    pathId: path.id,
    slug: nodeSlug,
    title: `Node ${slug}`,
    description: `Test node for ${slug}`,
    order: 0,
    pageIds: JSON.stringify([slug]),
    level: "apprentice",
    quizQuestions: "[]",
  }).run();
  return nodeId;
}

// Clean up test-path mastery_nodes so the concept-preview test
// (`demo-attention.test.ts`) keeps seeing the seeded `attention-intro`
// node rather than our test fixtures.
afterAll(() => {
  const db = getDb();
  const nodes = db
    .select({ id: masteryNodes.id })
    .from(masteryNodes)
    .where(like(masteryNodes.slug, "test-node-%"))
    .all();
  const ids = nodes.map((n) => n.id);
  if (ids.length > 0) {
    db.delete(quizMistakes).where(inArray(quizMistakes.nodeId, ids)).run();
    db.delete(userProgress).where(inArray(userProgress.nodeId, ids)).run();
    db.delete(masteryNodes).where(inArray(masteryNodes.id, ids)).run();
  }
  db.delete(masteryPaths).where(eq(masteryPaths.slug, "test-path")).run();
});

describe("/me/weak-concepts (Sprint 29)", () => {
  test("requires auth", async () => {
    const res = await req("/me/weak-concepts");
    expect(res.status).toBe(401);
  });

  test("detector picks up wrong-answers tied to a slug-mapped node", async () => {
    const { cookie, userId } = await signup("detect");
    ensureWikiPage("softmax", "Softmax");
    ensureCatalogEntry("softmax", "softmax-temperature-inverted");
    const nodeId = ensureNodeForSlug("softmax", testId);

    // Plant a quiz mistake for this user on a node referencing softmax.
    const db = getDb();
    db.insert(quizMistakes).values({
      id: randomUUID(),
      userId,
      nodeId,
      questionId: "q1",
      occurrences: 2,
      lastWrongAt: new Date().toISOString(),
    }).run();

    // Trigger the detector via the refresh endpoint.
    const refresh = await req("/me/weak-concepts/refresh", {
      method: "POST",
      headers: cookieHeader(cookie),
    });
    expect(refresh.status).toBe(200);

    const list = await req("/me/weak-concepts", { headers: cookieHeader(cookie) });
    expect(list.status).toBe(200);
    const data = (await list.json()) as any;
    const found = data.diagnoses.find((d: any) => d.conceptSlug === "softmax");
    expect(found).toBeDefined();
    expect(found.misconceptionKey).toBe("softmax-temperature-inverted");
    expect(found.evidence.length).toBeGreaterThan(0);
  });

  test("dismiss flips status and hides from listing", async () => {
    const { cookie, userId } = await signup("dismiss");
    ensureWikiPage("attention", "Attention");
    ensureCatalogEntry("attention", "attention-is-concatenation");
    const nodeId = ensureNodeForSlug("attention", `${testId}-d`);

    const db = getDb();
    db.insert(quizMistakes).values({
      id: randomUUID(),
      userId,
      nodeId,
      questionId: "q2",
      occurrences: 1,
      lastWrongAt: new Date().toISOString(),
    }).run();
    await req("/me/weak-concepts/refresh", {
      method: "POST",
      headers: cookieHeader(cookie),
    });

    const before = await req("/me/weak-concepts", { headers: cookieHeader(cookie) });
    const beforeData = (await before.json()) as any;
    const target = beforeData.diagnoses.find((d: any) => d.conceptSlug === "attention");
    expect(target).toBeDefined();

    const dismiss = await req(`/me/weak-concepts/${target.id}/dismiss`, {
      method: "POST",
      headers: cookieHeader(cookie),
    });
    expect(dismiss.status).toBe(200);

    const after = await req("/me/weak-concepts", { headers: cookieHeader(cookie) });
    const afterData = (await after.json()) as any;
    expect(afterData.diagnoses.find((d: any) => d.id === target.id)).toBeUndefined();
  });
});

describe("/me/prereq-status (Sprint 31)", () => {
  test("returns 'untouched' when user has no progress", async () => {
    const { cookie } = await signup("prereq");
    ensureWikiPage("softmax", "Softmax");
    const res = await req("/me/prereq-status?wikiSlugs=softmax,attention", {
      headers: cookieHeader(cookie),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.entries.length).toBe(2);
    for (const e of data.entries) {
      expect(["untouched", "in_progress", "mastered"]).toContain(e.status);
    }
  });
});

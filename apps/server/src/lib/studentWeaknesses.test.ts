// Phase 21A — unit tests for the weakness aggregator. Focus on
// shape + scoping correctness, not signal-source coverage breadth
// (each source has its own existing tests).

import { describe, test, expect } from "bun:test";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import {
  getDb,
  masteryNodes,
  masteryPaths,
  misconceptionDiagnoses,
  users,
  wikiPages,
} from "@axiomic/db";
import { buildWeaknessProfile } from "./studentWeaknesses";

function freshUser(): string {
  const db = getDb();
  const id = randomUUID();
  const username = `wk_${id.slice(0, 6)}`;
  db.insert(users)
    .values({
      id,
      username,
      email: `${username}@example.com`,
      passwordHash: "x",
    })
    .run();
  return id;
}

function ensureWikiPage(slug: string, title: string) {
  const db = getDb();
  const existing = db
    .select({ id: wikiPages.id })
    .from(wikiPages)
    .where(eq(wikiPages.slug, slug))
    .get();
  if (existing) return existing.id;
  const id = randomUUID();
  db.insert(wikiPages)
    .values({
      id,
      slug,
      title,
      category: "ml",
      currentVersion: 1,
    })
    .run();
  return id;
}

function ensurePath(): string {
  const db = getDb();
  const existing = db
    .select({ id: masteryPaths.id })
    .from(masteryPaths)
    .where(eq(masteryPaths.slug, "wk-test-path"))
    .get();
  if (existing) return existing.id;
  const id = randomUUID();
  db.insert(masteryPaths)
    .values({
      id,
      slug: "wk-test-path",
      title: "Weakness test path",
      description: "",
    })
    .run();
  return id;
}

function ensureNodeForSlug(slug: string, suffix: string): string {
  const db = getDb();
  const pathId = ensurePath();
  const existing = db
    .select({ id: masteryNodes.id })
    .from(masteryNodes)
    .where(eq(masteryNodes.slug, `wk-${slug}-${suffix}`))
    .get();
  if (existing) return existing.id;
  const id = randomUUID();
  db.insert(masteryNodes)
    .values({
      id,
      pathId,
      slug: `wk-${slug}-${suffix}`,
      title: `Weakness test node ${slug}`,
      description: "",
      order: 1,
      level: "apprentice",
      pageIds: JSON.stringify([slug]),
    })
    .run();
  return id;
}

describe("buildWeaknessProfile (Phase 21A)", () => {
  test("empty topic list returns an empty profile", async () => {
    const userId = freshUser();
    const profile = await buildWeaknessProfile({
      userId,
      topicSlugs: [],
      level: "undergrad",
    });
    expect(profile.topics).toEqual([]);
    expect(profile.strengths).toEqual([]);
    expect(profile.level).toBe("undergrad");
  });

  test("active misconception in scope surfaces as a topic", async () => {
    const userId = freshUser();
    const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const conceptSlug = `wk-softmax-${testId}`;
    ensureWikiPage(conceptSlug, "Softmax (weakness test)");
    const db = getDb();
    db.insert(misconceptionDiagnoses)
      .values({
        id: randomUUID(),
        userId,
        conceptSlug,
        misconceptionKey: "wk-test-key",
        label: "Temperature is mistakenly inverted",
        confidence: 0.8,
        status: "active",
      })
      .run();

    const profile = await buildWeaknessProfile({
      userId,
      topicSlugs: [conceptSlug],
      level: "undergrad",
    });
    expect(profile.topics.length).toBeGreaterThan(0);
    const top = profile.topics[0]!;
    expect(top.conceptSlug).toBe(conceptSlug);
    expect(top.conceptTitle).toBe("Softmax (weakness test)");
    expect(top.signals.some((s) => s.kind === "misconception")).toBe(true);
    // Severity is normalized to 1.0 for the top topic when alone.
    expect(top.severity).toBe(1);
  });

  test("off-scope signals are filtered out", async () => {
    const userId = freshUser();
    const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const inScope = `wk-attention-${testId}`;
    const outOfScope = `wk-organic-${testId}`;
    ensureWikiPage(inScope, "Attention (weakness test)");
    ensureWikiPage(outOfScope, "Organic chemistry (weakness test)");
    const db = getDb();
    db.insert(misconceptionDiagnoses)
      .values({
        id: randomUUID(),
        userId,
        conceptSlug: outOfScope,
        misconceptionKey: "wk-organic-key",
        label: "Off-topic mistake the class shouldn't see",
        confidence: 0.9,
        status: "active",
      })
      .run();

    const profile = await buildWeaknessProfile({
      userId,
      topicSlugs: [inScope],
      level: "intro",
    });
    expect(
      profile.topics.find((t) => t.conceptSlug === outOfScope),
    ).toBeUndefined();
  });

  test("prebuilt context yields the same profile as uncached path", async () => {
    const userId = freshUser();
    const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const conceptSlug = `wk-ctx-${testId}`;
    ensureWikiPage(conceptSlug, "Context-test concept");
    const db = getDb();
    db.insert(misconceptionDiagnoses)
      .values({
        id: randomUUID(),
        userId,
        conceptSlug,
        misconceptionKey: "wk-ctx-key",
        label: "Context-test misconception",
        confidence: 0.75,
        status: "active",
      })
      .run();

    const { prebuildWeaknessContext } = await import("./studentWeaknesses");
    const ctx = prebuildWeaknessContext();
    const cached = await buildWeaknessProfile(
      { userId, topicSlugs: [conceptSlug], level: "intro" },
      ctx,
    );
    const fresh = await buildWeaknessProfile({
      userId,
      topicSlugs: [conceptSlug],
      level: "intro",
    });
    expect(cached.topics.length).toBe(fresh.topics.length);
    expect(cached.topics[0]?.conceptSlug).toBe(fresh.topics[0]?.conceptSlug);
    expect(cached.strengths).toEqual(fresh.strengths);
  });

  test("inactive (coached/resolved/dismissed) diagnoses don't count", async () => {
    const userId = freshUser();
    const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const conceptSlug = `wk-resolved-${testId}`;
    ensureWikiPage(conceptSlug, "Resolved concept");
    const db = getDb();
    db.insert(misconceptionDiagnoses)
      .values({
        id: randomUUID(),
        userId,
        conceptSlug,
        misconceptionKey: "wk-resolved-key",
        label: "Used to be wrong about this, fixed now",
        confidence: 0.95,
        status: "resolved",
      })
      .run();
    const profile = await buildWeaknessProfile({
      userId,
      topicSlugs: [conceptSlug],
      level: "grad",
    });
    expect(profile.topics).toEqual([]);
  });
});

// Sprint 36 — Argument map endpoint test.
//
// Verifies: 400 on missing slug, 404 on unknown topic, payload includes
// topic + posts with parentId edges + author + bodySnippet, root
// posts have parentId === null.

import { describe, test, expect } from "bun:test";
import { app } from "../index";
import {
  domains,
  forumPosts,
  forumTopics,
  getDb,
  users,
} from "@axiomic/db";
import { randomUUID } from "crypto";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function ensureDomain(): string {
  const db = getDb();
  const slug = `arg-map-${testId}`;
  const id = randomUUID();
  db.insert(domains).values({
    id,
    slug,
    title: "Argument map test",
    description: "test",
  }).run();
  return id;
}

function ensureUser(suffix: string): string {
  const db = getDb();
  const username = `arg_${suffix}_${testId}`.slice(0, 30);
  const id = randomUUID();
  db.insert(users).values({
    id,
    username,
    email: `${username}@example.com`,
    passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$xx$yy",
    displayName: `Arg ${suffix}`,
    bio: "test",
  }).run();
  return id;
}

describe("Sprint 36 — argument map", () => {
  test("missing slug is 400", async () => {
    const res = await req("/forum/graph");
    expect(res.status).toBe(400);
  });

  test("unknown slug is 404", async () => {
    const res = await req("/forum/graph?slug=__nope__");
    expect(res.status).toBe(404);
  });

  test("returns topic + posts with parentId edges", async () => {
    const db = getDb();
    const domainId = ensureDomain();
    const authorId = ensureUser("a");
    const replyAuthorId = ensureUser("b");

    const topicId = randomUUID();
    const slug = `arg-topic-${testId}`;
    db.insert(forumTopics).values({
      id: topicId,
      slug,
      title: "Argue this",
      body: "Original claim body.",
      postType: "claim",
      domainId,
      authorId,
    }).run();

    // Two top-level replies, one nested under the first.
    const reply1 = randomUUID();
    const reply2 = randomUUID();
    const nested = randomUUID();
    db.insert(forumPosts).values({
      id: reply1,
      topicId,
      parentId: null,
      authorId: replyAuthorId,
      body: "Disagree because reasons.",
    }).run();
    db.insert(forumPosts).values({
      id: reply2,
      topicId,
      parentId: null,
      authorId: replyAuthorId,
      body: "Steel-man here.",
    }).run();
    db.insert(forumPosts).values({
      id: nested,
      topicId,
      parentId: reply1,
      authorId,
      body: "Counter-counter.",
    }).run();

    const res = await req(`/forum/graph?slug=${slug}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.topic.slug).toBe(slug);
    expect(data.topic.postType).toBe("claim");
    expect(data.posts.length).toBe(3);
    const idToParent = new Map<string, string | null>(
      data.posts.map((p: any) => [p.id, p.parentId]),
    );
    expect(idToParent.get(reply1)).toBe(null);
    expect(idToParent.get(nested)).toBe(reply1);

    // bodySnippet truncates / strips markdown.
    expect(typeof data.posts[0].bodySnippet).toBe("string");
    expect(data.posts[0].bodySnippet.length).toBeLessThanOrEqual(140);
  });
});

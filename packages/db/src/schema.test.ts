import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import * as schema from "./schema";
import path from "path";

let sqlite: InstanceType<typeof Database>;
let db: ReturnType<typeof drizzle>;

beforeAll(() => {
  sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(import.meta.dir, "../drizzle") });
});

afterAll(() => {
  sqlite.close();
});

describe("Users", () => {
  test("can create and retrieve a user", () => {
    const userId = randomUUID();
    db.insert(schema.users).values({
      id: userId,
      username: "testuser",
      email: "test@example.com",
      passwordHash: "hashed",
    }).run();

    const user = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
    expect(user).toBeTruthy();
    expect(user!.username).toBe("testuser");
    expect(user!.email).toBe("test@example.com");
  });

  test("username uniqueness is enforced", () => {
    expect(() => {
      db.insert(schema.users).values({
        id: randomUUID(),
        username: "testuser",
        email: "other@example.com",
        passwordHash: "hashed",
      }).run();
    }).toThrow();
  });
});

describe("Wiki Pages and Versioning", () => {
  let pageId: string;

  test("can create a page with initial version", () => {
    pageId = randomUUID();
    db.insert(schema.wikiPages).values({
      id: pageId,
      slug: "test-page",
      title: "Test Page",
      category: "test",
    }).run();

    db.insert(schema.pageVersions).values({
      id: randomUUID(),
      pageId,
      version: 1,
      contentIntro: "Intro content",
      contentUndergrad: "Undergrad content",
      contentGrad: "Grad content",
    }).run();

    const page = db.select().from(schema.wikiPages).where(eq(schema.wikiPages.slug, "test-page")).get();
    expect(page).toBeTruthy();
    expect(page!.title).toBe("Test Page");
    expect(page!.currentVersion).toBe(1);
  });

  test("can create new versions", () => {
    db.insert(schema.pageVersions).values({
      id: randomUUID(),
      pageId,
      version: 2,
      contentIntro: "Updated intro",
      contentUndergrad: "Updated undergrad",
      contentGrad: "Updated grad",
      editMessage: "Fixed typo",
    }).run();

    db.update(schema.wikiPages)
      .set({ currentVersion: 2 })
      .where(eq(schema.wikiPages.id, pageId))
      .run();

    const page = db.select().from(schema.wikiPages).where(eq(schema.wikiPages.id, pageId)).get();
    expect(page!.currentVersion).toBe(2);

    const versions = db.select().from(schema.pageVersions).where(eq(schema.pageVersions.pageId, pageId)).all();
    expect(versions.length).toBe(2);
  });
});

describe("Comments and Voting", () => {
  let userId: string;
  let pageId: string;
  let commentId: string;

  beforeAll(() => {
    userId = randomUUID();
    db.insert(schema.users).values({
      id: userId,
      username: "commenter",
      email: "commenter@example.com",
      passwordHash: "hashed",
    }).run();

    pageId = randomUUID();
    db.insert(schema.wikiPages).values({
      id: pageId,
      slug: "comment-page",
      title: "Comment Page",
      category: "test",
    }).run();
  });

  test("can create a comment", () => {
    commentId = randomUUID();
    db.insert(schema.comments).values({
      id: commentId,
      pageId,
      userId,
      content: "Great article!",
    }).run();

    const comments = db.select().from(schema.comments).where(eq(schema.comments.pageId, pageId)).all();
    expect(comments.length).toBe(1);
    expect(comments[0].content).toBe("Great article!");
  });

  test("can create threaded replies", () => {
    const replyId = randomUUID();
    db.insert(schema.comments).values({
      id: replyId,
      pageId,
      parentId: commentId,
      userId,
      content: "Thanks!",
    }).run();

    const reply = db.select().from(schema.comments).where(eq(schema.comments.id, replyId)).get();
    expect(reply!.parentId).toBe(commentId);
  });

  test("can vote on comments", () => {
    const voteId = randomUUID();
    db.insert(schema.votes).values({
      id: voteId,
      commentId,
      userId,
      value: 1,
    }).run();

    const vote = db.select().from(schema.votes)
      .where(and(eq(schema.votes.commentId, commentId), eq(schema.votes.userId, userId)))
      .get();
    expect(vote!.value).toBe(1);
  });
});

describe("Mastery Paths", () => {
  test("can create a path with nodes", () => {
    const pathId = randomUUID();
    db.insert(schema.masteryPaths).values({
      id: pathId,
      slug: "test-path",
      title: "Test Path",
      description: "A test path",
    }).run();

    const nodeId = randomUUID();
    db.insert(schema.masteryNodes).values({
      id: nodeId,
      pathId,
      slug: "node-1",
      title: "Node 1",
      description: "First node",
      order: 1,
      level: "apprentice",
      pageIds: JSON.stringify(["test-page"]),
    }).run();

    const nodes = db.select().from(schema.masteryNodes).where(eq(schema.masteryNodes.pathId, pathId)).all();
    expect(nodes.length).toBe(1);
    expect(JSON.parse(nodes[0].pageIds)).toEqual(["test-page"]);
  });

  test("can track user progress", () => {
    const userId = randomUUID();
    db.insert(schema.users).values({
      id: userId,
      username: "learner",
      email: "learner@example.com",
      passwordHash: "hashed",
    }).run();

    const nodeId = db.select().from(schema.masteryNodes).all()[0].id;
    const progressId = randomUUID();

    db.insert(schema.userProgress).values({
      id: progressId,
      userId,
      nodeId,
      completed: true,
      quizScore: 0.8,
      completedAt: new Date().toISOString(),
    }).run();

    const progress = db.select().from(schema.userProgress)
      .where(eq(schema.userProgress.userId, userId))
      .all();
    expect(progress.length).toBe(1);
    expect(progress[0].completed).toBe(true);
    expect(progress[0].quizScore).toBe(0.8);
  });
});

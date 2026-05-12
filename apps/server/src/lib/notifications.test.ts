// Phase K — notifyMany() batch fanout tests.
//
// These exercise the bulk-INSERT path directly so we have a regression
// signal beyond the existing route tests that incidentally hit notify().

import { describe, test, expect, beforeAll } from "bun:test";
import { randomUUID } from "crypto";
import { eq, and, inArray } from "drizzle-orm";
import { getDb, users, notifications } from "@axiomic/db";
import { notifyMany, notify } from "./notifications";

let testRun = "";
let actorId = "";
let recipientA = "";
let recipientB = "";
let recipientC = "";

async function makeUser(suffix: string, prefs: {
  notifyMentions?: boolean;
  notifyReplies?: boolean;
  notifyMastery?: boolean;
} = {}): Promise<string> {
  const db = getDb();
  const id = randomUUID();
  db.insert(users).values({
    id,
    username: `nm_${testRun}_${suffix}`,
    email: `nm_${testRun}_${suffix}@example.com`,
    passwordHash: "x",
    displayName: `nm_${suffix}`,
    notifyMentions: prefs.notifyMentions ?? true,
    notifyReplies: prefs.notifyReplies ?? true,
    notifyMastery: prefs.notifyMastery ?? true,
  }).run();
  return id;
}

beforeAll(async () => {
  testRun = Date.now().toString(36);
  actorId = await makeUser("actor");
  recipientA = await makeUser("a");
  recipientB = await makeUser("b");
  recipientC = await makeUser("c");
});

function fetchNotifsForKindSubject(
  recipientIds: string[],
  kind: string,
  subjectId: string,
) {
  const db = getDb();
  return db
    .select()
    .from(notifications)
    .where(
      and(
        inArray(notifications.userId, recipientIds),
        eq(notifications.kind, kind as never),
        eq(notifications.subjectId, subjectId),
      ),
    )
    .all();
}

describe("notifyMany — Phase K batch fanout", () => {
  test("empty recipients returns {0,0} and inserts nothing", async () => {
    const subjectId = `s-${testRun}-empty`;
    const res = await notifyMany([], {
      actorId,
      kind: "forum_topic_posted",
      subjectType: "topic",
      subjectId,
      contextSlug: null,
      preview: "empty",
    });
    expect(res).toEqual({ inserted: 0, skipped: 0 });
    const rows = fetchNotifsForKindSubject(
      [actorId, recipientA, recipientB],
      "forum_topic_posted",
      subjectId,
    );
    expect(rows.length).toBe(0);
  });

  test("inserts one row per recipient for an always-on kind", async () => {
    const subjectId = `s-${testRun}-bulk`;
    const res = await notifyMany([recipientA, recipientB, recipientC], {
      actorId,
      kind: "forum_topic_posted",
      subjectType: "topic",
      subjectId,
      contextSlug: "slug-bulk",
      preview: "hello",
    });
    expect(res.inserted).toBe(3);
    expect(res.skipped).toBe(0);
    const rows = fetchNotifsForKindSubject(
      [recipientA, recipientB, recipientC],
      "forum_topic_posted",
      subjectId,
    );
    expect(rows.length).toBe(3);
    const userIds = rows.map((r) => r.userId).sort();
    expect(userIds).toEqual([recipientA, recipientB, recipientC].sort());
  });

  test("self-skip: actorId in recipients is dropped", async () => {
    const subjectId = `s-${testRun}-self`;
    const res = await notifyMany([actorId, recipientA], {
      actorId,
      kind: "forum_topic_posted",
      subjectType: "topic",
      subjectId,
      contextSlug: null,
      preview: "self",
    });
    expect(res.inserted).toBe(1);
    const rows = fetchNotifsForKindSubject(
      [actorId, recipientA],
      "forum_topic_posted",
      subjectId,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].userId).toBe(recipientA);
  });

  test("system events (actorId=null) deliver to all including the would-be 'self'", async () => {
    // mastery_level_up's whole point: the user gets a notification about
    // their own milestone. The self-skip rule only applies when actorId
    // is a real user, so a null actor with the user in recipients lands.
    const subjectId = `s-${testRun}-system`;
    const res = await notifyMany([recipientA], {
      actorId: null,
      kind: "mastery_level_up",
      subjectType: "mastery_node",
      subjectId,
      contextSlug: null,
      preview: "level up",
    });
    expect(res.inserted).toBe(1);
  });

  test("dedups recipients passed multiple times", async () => {
    const subjectId = `s-${testRun}-dedupe`;
    const res = await notifyMany(
      [recipientA, recipientA, recipientB, recipientB, recipientB],
      {
        actorId,
        kind: "forum_topic_posted",
        subjectType: "topic",
        subjectId,
        contextSlug: null,
        preview: "dedupe",
      },
    );
    expect(res.inserted).toBe(2);
  });

  test("preference gating filters opted-out recipients", async () => {
    const optedOut = await makeUser("opt", { notifyReplies: false });
    const subjectId = `s-${testRun}-pref`;
    const res = await notifyMany([recipientA, optedOut], {
      actorId,
      kind: "topic_reply",
      subjectType: "topic",
      subjectId,
      contextSlug: null,
      preview: "reply",
    });
    // Only recipientA receives; optedOut is filtered by the pref-gate.
    expect(res.inserted).toBe(1);
    expect(res.skipped).toBe(1);
    const rows = fetchNotifsForKindSubject(
      [recipientA, optedOut],
      "topic_reply",
      subjectId,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].userId).toBe(recipientA);
  });

  test("idempotence: calling twice with same (recipient, kind, subject, actor) yields no duplicates", async () => {
    const subjectId = `s-${testRun}-idem`;
    await notifyMany([recipientA, recipientB], {
      actorId,
      kind: "forum_topic_posted",
      subjectType: "topic",
      subjectId,
      contextSlug: null,
      preview: "first",
    });
    await notifyMany([recipientA, recipientB], {
      actorId,
      kind: "forum_topic_posted",
      subjectType: "topic",
      subjectId,
      contextSlug: null,
      preview: "second",
    });
    const rows = fetchNotifsForKindSubject(
      [recipientA, recipientB],
      "forum_topic_posted",
      subjectId,
    );
    expect(rows.length).toBe(2);
  });

  test("notify() still returns true on insert and false on opt-out (wrapper semantics preserved)", async () => {
    const optedOut = await makeUser("notify-wrapper", { notifyMentions: false });
    const subjectId = `s-${testRun}-wrap`;

    const inserted = await notify({
      recipientId: recipientA,
      actorId,
      kind: "mention",
      subjectType: "topic",
      subjectId,
      contextSlug: null,
      preview: "ping",
    });
    expect(inserted).toBe(true);

    const gated = await notify({
      recipientId: optedOut,
      actorId,
      kind: "mention",
      subjectType: "topic",
      subjectId,
      contextSlug: null,
      preview: "ping",
    });
    expect(gated).toBe(false);
  });
});

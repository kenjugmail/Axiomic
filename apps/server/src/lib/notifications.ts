import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb, notifications, users, type Db } from "@axiomic/db";

export type NotificationKind =
  | "mention"
  | "topic_reply"
  | "post_reply"
  | "comment_reply"
  | "mastery_level_up"
  | "news_edit_proposed"
  | "news_edit_approved"
  | "news_edit_rejected"
  | "news_published"
  | "forum_topic_posted";

export type NotificationSubject =
  | "topic"
  | "post"
  | "comment"
  | "mastery_node"
  | "news_article"
  | "news_proposal"
  | "news_comment";

const MAX_MENTIONS_PER_BODY = 10;
const PREVIEW_MAX = 140;

// Strip code/math/URLs/emails before mention extraction so @user inside
// `code`, ```fences```, or $math$ doesn't generate false positives, and
// user@email.com isn't read as a mention of "email".
export function extractMentionUsernames(body: string): string[] {
  if (!body) return [];

  let text = body;

  // Remove fenced code blocks (``` and ~~~).
  text = text.replace(/```[\s\S]*?```/g, " ");
  text = text.replace(/~~~[\s\S]*?~~~/g, " ");

  // Remove inline code spans.
  text = text.replace(/`[^`\n]*`/g, " ");

  // Remove block math.
  text = text.replace(/\$\$[\s\S]*?\$\$/g, " ");
  // Inline math (single-line only — guard against picking up dollar signs).
  text = text.replace(/\$[^$\n]+\$/g, " ");

  // Remove URLs and email-like tokens.
  text = text.replace(/https?:\/\/\S+/gi, " ");
  text = text.replace(/\S+@\S+\.\S+/g, " ");

  // Match @username with a lookbehind to avoid matching emails defensively
  // (the email strip above already handles most cases). Username rules: 3-32
  // chars, [A-Za-z0-9_].
  const re = /(?<![A-Za-z0-9_])@([A-Za-z0-9_]{3,32})\b/g;
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    found.add(m[1].toLowerCase());
    if (found.size >= MAX_MENTIONS_PER_BODY) break;
  }
  return [...found];
}

export function toPreview(body: string): string {
  if (!body) return "";
  // Strip markdown markers minimally: code fences, headings, link syntax.
  const flat = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_>~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > PREVIEW_MAX ? flat.slice(0, PREVIEW_MAX - 1) + "…" : flat;
}

interface NotifyArgs {
  recipientId: string;
  actorId: string | null;
  kind: NotificationKind;
  subjectType: NotificationSubject;
  subjectId: string;
  contextSlug: string | null;
  preview: string | null;
}

// Map a notification kind to the user-pref column that gates it. Returns
// null when the kind is always-on.
function kindGate(
  kind: NotificationKind,
): "notifyMentions" | "notifyReplies" | "notifyMastery" | null {
  switch (kind) {
    case "mention":
      return "notifyMentions";
    case "topic_reply":
    case "post_reply":
    case "comment_reply":
      return "notifyReplies";
    case "mastery_level_up":
      return "notifyMastery";
    case "news_edit_proposed":
    case "news_edit_approved":
    case "news_edit_rejected":
    case "news_published":
    case "forum_topic_posted":
      // News flow + follow events are direct + low-volume — always on.
      return null;
  }
}

// Insert one notification. Idempotent on (recipient, kind, subject, actor)
// while unread, via the partial unique index. Skips self-notifications and
// recipients who have opted out of this kind. Returns true when a row was
// (potentially) inserted, false when gated out — callers use this to
// decide whether to fall back to a less-specific notification kind.
// Best-effort: any DB error is swallowed and logged.
export async function notify(args: NotifyArgs, db: Db = getDb()): Promise<boolean> {
  // Skip self-notifications, but only when actorId is a real user. System
  // events (actorId === null) are allowed to land in the recipient's bell —
  // that's how mastery_level_up notifies the user about their own milestone.
  if (args.actorId !== null && args.actorId === args.recipientId) return false;
  try {
    const gate = kindGate(args.kind);
    if (gate) {
      const prefs = db
        .select({
          notifyMentions: users.notifyMentions,
          notifyReplies: users.notifyReplies,
          notifyMastery: users.notifyMastery,
        })
        .from(users)
        .where(eq(users.id, args.recipientId))
        .get();
      if (prefs && prefs[gate] === false) return false;
    }

    await db
      .insert(notifications)
      .values({
        id: randomUUID(),
        userId: args.recipientId,
        actorId: args.actorId,
        kind: args.kind,
        subjectType: args.subjectType,
        subjectId: args.subjectId,
        contextSlug: args.contextSlug,
        preview: args.preview,
      })
      .onConflictDoNothing();
    return true;
  } catch (err) {
    console.error("notify failed", err);
    return false;
  }
}

interface NotifyMentionsArgs {
  body: string;
  actorId: string;
  subjectType: NotificationSubject;
  subjectId: string;
  contextSlug: string | null;
  preview: string | null;
}

// Resolve @mention usernames to user IDs (silently dropping unknowns) and
// fire one mention notification per mentioned user. Returns the set of
// resolved recipient IDs so callers can dedupe with reply-style
// notifications (a recipient who is both mentioned and replied-to should
// receive only the more-specific mention).
export async function notifyMentions(
  args: NotifyMentionsArgs,
  db: Db = getDb(),
): Promise<Set<string>> {
  const usernames = extractMentionUsernames(args.body);
  if (usernames.length === 0) return new Set();

  const rows = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(inArray(users.username, usernames))
    .all();

  const recipients = new Set<string>();
  for (const row of rows) {
    if (row.id === args.actorId) continue;
    const inserted = await notify(
      {
        recipientId: row.id,
        actorId: args.actorId,
        kind: "mention",
        subjectType: args.subjectType,
        subjectId: args.subjectId,
        contextSlug: args.contextSlug,
        preview: args.preview,
      },
      db,
    );
    // Only count recipients who actually received the mention. A user who
    // muted mentions but not replies should still get a reply notification.
    if (inserted) recipients.add(row.id);
  }
  return recipients;
}

// Convenience: resolve a single user by ID. Returns null if missing.
export function findUserById(userId: string, db: Db = getDb()) {
  return db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get();
}

import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb, notifications, users, type Db } from "@axiomic/db";

export type NotificationKind =
  | "mention"
  | "topic_reply"
  | "post_reply"
  | "comment_reply";

export type NotificationSubject = "topic" | "post" | "comment";

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

// Insert one notification. Idempotent on (recipient, kind, subject, actor)
// while unread, via the partial unique index. Skips self-notifications.
// Best-effort: any DB error is swallowed and logged.
export async function notify(args: NotifyArgs, db: Db = getDb()): Promise<void> {
  if (args.recipientId === args.actorId) return;
  try {
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
  } catch (err) {
    console.error("notify failed", err);
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
    recipients.add(row.id);
    await notify(
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
  }
  return recipients;
}

// Convenience: resolve a single user by ID. Returns null if missing.
export function findUserById(userId: string, db: Db = getDb()) {
  return db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get();
}

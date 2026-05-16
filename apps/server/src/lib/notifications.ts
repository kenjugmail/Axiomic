import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb, notifications, users, type Db } from "@axiomic/db";
import { publishToUser } from "./liveBus";
import { pushToUser } from "./pushSender";

export type NotificationKind =
  | "mention"
  | "topic_reply"
  | "post_reply"
  | "comment_reply"
  | "claim_thread_reply"
  | "mastery_level_up"
  | "news_edit_proposed"
  | "news_edit_approved"
  | "news_edit_rejected"
  | "news_published"
  | "article_reproduced"
  | "forum_topic_posted"
  // Sprint 52
  | "track_completed"
  | "cohort_invitation"
  | "proposal_approved"
  | "proposal_rejected"
  // Sprint 71 — funding feed.
  | "grant_match"
  | "grant_deadline_soon"
  // Sprint 80 — lab protocol runs + safety certifications.
  | "lab_signoff_requested"
  | "lab_signoff_approved"
  | "lab_signoff_rejected"
  | "lab_cert_passed"
  | "lab_cert_expiring"
  // S88 — classroom + pet engagement loop.
  | "cosmetic_granted"
  | "competition_won"
  | "pet_hatched"
  // S90 — pet evolution.
  | "pet_leveled_up"
  // Phase L — pet skin grant.
  | "skin_granted"
  // Phase 25A — class stream + per-task discussion notifications.
  // Both always-on; per-user mute toggle deferred.
  | "class_announcement"
  | "class_discussion_post"
  // Phase 27 — hackathon lifecycle events. All always-on; the
  // judging-complete + prize-won events are direct and rare,
  // so no per-user mute toggle in v1.
  | "hackathon_registered"
  | "hackathon_judging_complete"
  | "hackathon_prize_won"
  // Phase 28 — reproduction credential + research bounty events.
  // Always-on; direct + rare.
  | "reproduction_verified"
  | "bounty_claimed"
  | "bounty_accepted";

export type NotificationSubject =
  | "topic"
  | "post"
  | "comment"
  | "mastery_node"
  | "news_article"
  | "news_proposal"
  | "news_comment"
  | "claim_thread"
  | "reproduction"
  // Sprint 52
  | "capstone_track"
  | "cohort_invitation"
  | "content_proposal"
  // Sprint 71
  | "grant"
  // Sprint 80
  | "lab_protocol_run"
  | "lab_cert"
  // S88 — classroom + pet engagement loop.
  | "cosmetic"
  | "competition"
  | "pet"
  // Phase L — skin grant.
  | "pet_skin"
  // Phase 25A — classroom feed surfaces. subjectId carries the
  // announcement / discussion row id; contextSlug is the class slug.
  | "class_announcement"
  | "class_task_discussion"
  // Phase 27 — hackathon entities. subjectId carries the
  // hackathon / team / prize row id; contextSlug is the
  // hackathon slug.
  | "hackathon"
  | "hackathon_team"
  | "hackathon_prize"
  // Phase 28 — reproduction credential + research bounty.
  | "reproduction"
  | "research_bounty";

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
    case "claim_thread_reply":
      return "notifyReplies";
    case "mastery_level_up":
      return "notifyMastery";
    case "news_edit_proposed":
    case "news_edit_approved":
    case "news_edit_rejected":
    case "news_published":
    case "article_reproduced":
    case "forum_topic_posted":
    case "track_completed":
    case "cohort_invitation":
    case "proposal_approved":
    case "proposal_rejected":
    case "grant_match":
    case "grant_deadline_soon":
    case "lab_signoff_requested":
    case "lab_signoff_approved":
    case "lab_signoff_rejected":
    case "lab_cert_passed":
    case "lab_cert_expiring":
    case "cosmetic_granted":
    case "competition_won":
    case "pet_hatched":
    case "pet_leveled_up":
    case "skin_granted":
    case "class_announcement":
    case "class_discussion_post":
    case "hackathon_registered":
    case "hackathon_judging_complete":
    case "hackathon_prize_won":
    case "reproduction_verified":
    case "bounty_claimed":
    case "bounty_accepted":
      // News flow + follow events + admin pipeline + funding
      // alerts + Sprint 80 lab operational signals + S88
      // classroom/pet events + S90 pet evolution + Phase 25A
      // classroom feed surfaces + Phase 27 hackathon lifecycle
      // events are direct + low-volume — always on (per-user
      // mute toggle deferred).
      return null;
  }
}

// Insert one notification. Idempotent on (recipient, kind, subject, actor)
// while unread, via the partial unique index. Skips self-notifications and
// recipients who have opted out of this kind. Returns true when a row was
// (potentially) inserted, false when gated out — callers use this to
// decide whether to fall back to a less-specific notification kind.
// Best-effort: any DB error is swallowed and logged.
//
// Phase K — implemented as a thin n=1 wrapper over notifyMany() so the
// pref/insert/push semantics live in exactly one place.
export async function notify(args: NotifyArgs, db: Db = getDb()): Promise<boolean> {
  const { recipientId, ...shared } = args;
  const { inserted } = await notifyMany([recipientId], shared, db);
  return inserted > 0;
}

// Phase K — chunk size for the bulk INSERT. SQLite's default
// SQLITE_MAX_VARIABLE_NUMBER is 999 and the notifications row has 8
// columns, so 100 rows per INSERT keeps us well under the cap with
// room for the prefs SELECT we may run in the same chunk.
const NOTIFY_CHUNK_SIZE = 100;

// Phase K — batched fan-out for the (very common) shape of "one event,
// many recipients, identical metadata except for recipientId". Callers
// like forum follow-publish and news article publish previously looped
// notify() per follower, which fired 1–3 queries per recipient. This
// helper folds the prefs lookup into one SELECT, the insert into one
// (chunked) INSERT, and keeps the per-user WebSocket / Web Push fan-out
// as fire-and-forget calls — those are in-memory and unavoidably per-user.
export async function notifyMany(
  recipients: string[] | Set<string>,
  shared: Omit<NotifyArgs, "recipientId">,
  db: Db = getDb(),
): Promise<{ inserted: number; skipped: number }> {
  // Step A: normalize + self-skip. System events (actorId === null)
  // intentionally land in the recipient's own bell (e.g. mastery_level_up),
  // so we only drop actorId when it's a real user.
  const ids = [...new Set(recipients)].filter(
    (r) => shared.actorId === null || r !== shared.actorId,
  );
  if (ids.length === 0) return { inserted: 0, skipped: 0 };

  let filtered = ids;
  let skipped = 0;

  // Step B: bulk preference gating. One SELECT replaces N — the user
  // can have opted out of mentions/replies/mastery. Always-on kinds
  // (gate === null) skip this step entirely.
  const gate = kindGate(shared.kind);
  if (gate) {
    try {
      const prefRows = db
        .select({
          id: users.id,
          notifyMentions: users.notifyMentions,
          notifyReplies: users.notifyReplies,
          notifyMastery: users.notifyMastery,
        })
        .from(users)
        .where(inArray(users.id, ids))
        .all();
      const prefById = new Map(prefRows.map((r) => [r.id, r]));
      filtered = ids.filter((id) => {
        const row = prefById.get(id);
        // Mirror notify()'s single-row behavior: if the user has no
        // row (deleted) we drop them; if they have a row with the
        // gate set false they opted out.
        if (!row) return false;
        return row[gate] !== false;
      });
      skipped = ids.length - filtered.length;
    } catch (err) {
      console.error("notifyMany prefs lookup failed", err);
      return { inserted: 0, skipped: ids.length };
    }
  }

  if (filtered.length === 0) return { inserted: 0, skipped };

  // Step C: bulk INSERT (chunked). Each recipient still gets its own
  // UUID — the WebSocket payload carries the row id, and clients
  // dedupe by it. The partial unique index handles cross-call
  // idempotence, same as the single-row path.
  const rowIds: string[] = filtered.map(() => randomUUID());
  const createdAt = new Date().toISOString();
  try {
    for (let offset = 0; offset < filtered.length; offset += NOTIFY_CHUNK_SIZE) {
      const chunk = filtered.slice(offset, offset + NOTIFY_CHUNK_SIZE);
      const rows = chunk.map((recipientId, i) => ({
        id: rowIds[offset + i],
        userId: recipientId,
        actorId: shared.actorId,
        kind: shared.kind,
        subjectType: shared.subjectType,
        subjectId: shared.subjectId,
        contextSlug: shared.contextSlug,
        preview: shared.preview,
      }));
      await db.insert(notifications).values(rows).onConflictDoNothing();
    }
  } catch (err) {
    console.error("notifyMany insert failed", err);
    return { inserted: 0, skipped };
  }

  // Step D: live push. WebSocket + Web Push are per-user by nature
  // (one open socket per session, one push subscription per device),
  // but they're in-memory / fire-and-forget so the loop is cheap.
  // Actor lookup is shared — one SELECT instead of N.
  try {
    let actor: { id: string; username: string } | null = null;
    if (shared.actorId) {
      const row = db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(eq(users.id, shared.actorId))
        .get();
      actor = row ?? null;
    }
    for (let i = 0; i < filtered.length; i++) {
      const payload = {
        kind: "notification" as const,
        notification: {
          id: rowIds[i],
          kind: shared.kind,
          subjectType: shared.subjectType,
          subjectId: shared.subjectId,
          contextSlug: shared.contextSlug,
          preview: shared.preview,
          readAt: null,
          createdAt,
          actor,
        },
      };
      try {
        publishToUser(filtered[i], payload);
        void pushToUser(filtered[i], payload);
      } catch {
        // ignore per-recipient live-push errors
      }
    }
  } catch {
    // ignore actor-lookup / fan-out errors
  }

  return { inserted: filtered.length, skipped };
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

// Sprint 52 — A learner just earned a capstone track. Best-effort
// notify; the artifact slug doubles as the deep-link target.
export function notifyTrackCompletion(
  userId: string,
  trackId: string,
  trackSlug: string,
  artifactPageSlug: string,
): void {
  void notify({
    recipientId: userId,
    actorId: null,
    kind: "track_completed",
    subjectType: "capstone_track",
    subjectId: trackId,
    contextSlug: artifactPageSlug,
    preview: `You earned the ${trackSlug} track`,
  });
}

// Sprint 52 — Notify the invitee (when they have an account with the
// matching email). The contextSlug is the invitation token so the bell
// can deep-link to /invitations/:token.
export function notifyCohortInvitation(
  recipientId: string,
  inviterId: string,
  invitationId: string,
  token: string,
  cohortName: string,
): void {
  void notify({
    recipientId,
    actorId: inviterId,
    kind: "cohort_invitation",
    subjectType: "cohort_invitation",
    subjectId: invitationId,
    contextSlug: token,
    preview: `Invited to cohort: ${cohortName}`,
  });
}

// Sprint 52 — Approval / rejection of a content proposal.
export function notifyProposalDecision(
  recipientId: string,
  reviewerId: string,
  proposalId: string,
  approved: boolean,
  preview: string,
): void {
  void notify({
    recipientId,
    actorId: reviewerId,
    kind: approved ? "proposal_approved" : "proposal_rejected",
    subjectType: "content_proposal",
    subjectId: proposalId,
    contextSlug: null,
    preview,
  });
}

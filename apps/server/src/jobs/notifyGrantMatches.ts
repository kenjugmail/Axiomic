// Sprint 71 — Daily grant-match + deadline notifier.
//
// For each researcher (any user with ≥1 published research paper or
// a non-empty institution + ORCID), compute the top grant matches.
// Send a `grant_match` notification once per (user, grant) — tracked
// in `grant_notifications_sent`. For grants close to their deadline,
// fire `grant_deadline_soon` at the 14d / 7d / 3d marks (one per
// window per user).

import { randomUUID } from "crypto";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import {
  getDb,
  grantNotificationsSent,
  grants,
  researchPapers,
  users,
} from "@axiomic/db";
import { matchGrantsForUser } from "../lib/grantMatch";
import { notify } from "../lib/notifications";
import type { JobDefinition } from "../lib/jobs";

const MATCH_TOP_N = 3;
const DEADLINE_WINDOWS = [14, 7, 3] as const;

function dueWindow(deadlineIso: string | null): number | null {
  if (!deadlineIso) return null;
  const t = Date.parse(deadlineIso);
  if (!Number.isFinite(t)) return null;
  const daysOut = Math.ceil((t - Date.now()) / 86400_000);
  if (daysOut < 0) return null;
  for (const w of DEADLINE_WINDOWS) {
    if (daysOut <= w) return w;
  }
  return null;
}

function activeResearcherIds(): string[] {
  const db = getDb();
  // Researchers = anyone with ≥1 published research paper, OR with
  // an ORCID set (signaling intent to claim external work).
  const fromPapers = db
    .selectDistinct({ id: researchPapers.authorId })
    .from(researchPapers)
    .where(eq(researchPapers.status, "published"))
    .all();
  const fromOrcid = db
    .select({ id: users.id })
    .from(users)
    .where(isNotNull(users.orcid))
    .all();
  const seen = new Set<string>();
  for (const r of [...fromPapers, ...fromOrcid]) {
    if (r.id) seen.add(r.id);
  }
  return [...seen];
}

function alreadySentMatch(userId: string, grantId: string): boolean {
  const db = getDb();
  const row = db
    .select({ id: grantNotificationsSent.id })
    .from(grantNotificationsSent)
    .where(
      and(
        eq(grantNotificationsSent.userId, userId),
        eq(grantNotificationsSent.grantId, grantId),
        eq(grantNotificationsSent.kind, "match"),
      ),
    )
    .get();
  return Boolean(row);
}

function alreadySentDeadline(
  userId: string,
  grantId: string,
  windowDays: number,
): boolean {
  const db = getDb();
  const row = db
    .select({ id: grantNotificationsSent.id })
    .from(grantNotificationsSent)
    .where(
      and(
        eq(grantNotificationsSent.userId, userId),
        eq(grantNotificationsSent.grantId, grantId),
        eq(grantNotificationsSent.kind, "deadline_soon"),
        eq(grantNotificationsSent.windowDays, windowDays),
      ),
    )
    .get();
  return Boolean(row);
}

function recordSent(
  userId: string,
  grantId: string,
  kind: "match" | "deadline_soon",
  windowDays: number | null,
): void {
  try {
    getDb()
      .insert(grantNotificationsSent)
      .values({
        id: randomUUID(),
        userId,
        grantId,
        kind,
        windowDays,
      })
      .run();
  } catch {
    // Race condition on the unique index = already sent. Fine.
  }
}

export const notifyGrantMatchesJob: JobDefinition = {
  name: "notify_grant_matches",
  intervalMs: 24 * 60 * 60_000, // 24h
  async run() {
    const db = getDb();
    const userIds = activeResearcherIds();
    let sent = 0;

    for (const userId of userIds) {
      const matches = await matchGrantsForUser(userId, {
        limit: MATCH_TOP_N,
      });
      for (const m of matches) {
        if (alreadySentMatch(userId, m.grant.id)) continue;
        const ok = await notify({
          recipientId: userId,
          actorId: null,
          kind: "grant_match",
          subjectType: "grant",
          subjectId: m.grant.id,
          contextSlug: m.grant.id,
          preview:
            m.grant.title.length > 120
              ? m.grant.title.slice(0, 119) + "…"
              : m.grant.title,
        });
        if (ok) {
          recordSent(userId, m.grant.id, "match", null);
          sent++;
        }
      }
    }

    // Deadline-soon: scan grants with deadlines in the next 14 days
    // once globally; for each, notify users who've bookmarked it OR
    // who matched it earlier (subscriber set = bookmarks ∪ users
    // we've already sent a match for).
    const upcoming = db
      .select()
      .from(grants)
      .where(isNotNull(grants.deadlineAt))
      .orderBy(desc(grants.deadlineAt))
      .all();
    for (const g of upcoming) {
      const window = dueWindow(g.deadlineAt);
      if (!window) continue;
      const subscribers = db
        .selectDistinct({ userId: grantNotificationsSent.userId })
        .from(grantNotificationsSent)
        .where(eq(grantNotificationsSent.grantId, g.id))
        .all();
      for (const sub of subscribers) {
        if (alreadySentDeadline(sub.userId, g.id, window)) continue;
        const ok = await notify({
          recipientId: sub.userId,
          actorId: null,
          kind: "grant_deadline_soon",
          subjectType: "grant",
          subjectId: g.id,
          contextSlug: g.id,
          preview: `Closes in ${window} day${window === 1 ? "" : "s"}: ${g.title.slice(0, 100)}`,
        });
        if (ok) {
          recordSent(sub.userId, g.id, "deadline_soon", window);
          sent++;
        }
      }
    }

    return { itemsProcessed: sent };
  },
};

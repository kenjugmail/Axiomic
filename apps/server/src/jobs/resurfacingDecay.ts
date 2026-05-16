// Phase 32D — proactive decay-aware resurfacing.
//
// SM-2 review is lazy-on-read and a misconception that flips to
// 'resolved' (Phase 31A) never gets re-checked. Knowledge decays
// silently. This daily job nudges two decay signals:
//
//   1. A signed reproduction credential gone STALE (Phase 32B
//      freshness band) → "re-attest to keep it fresh".
//   2. A misconception resolved long ago → "prove it again".
//
// Stateless/derived (no schema): the notify() partial-unique-while-
// unread index makes daily re-runs idempotent, so we don't track
// per-user snooze in v1. `review_due` is muteable via the mastery
// notification toggle (kindGate). Skips revoked credentials — a
// revoked credential needs revocation handling, not a freshness
// nudge.

import { and, eq, isNotNull, isNull } from "drizzle-orm";
import {
  getDb,
  misconceptionDiagnoses,
  notifications,
  reproductions,
} from "@axiomic/db";
import { notify } from "../lib/notifications";
import { ageDays, freshnessBand } from "../lib/freshness";
import { revocationKey, revokedKeySet } from "../lib/revocation";
import type { JobDefinition } from "../lib/jobs";

// A misconception resolved more than this long ago is due for a
// re-check. Module-top so it tunes without touching the loop.
export const RESOLVED_DECAY_DAYS = 90;

export const resurfacingDecayJob: JobDefinition = {
  name: "resurfacing_decay",
  intervalMs: 24 * 60 * 60_000, // daily
  async run() {
    const db = getDb();
    let sent = 0;

    // True idempotence: the notifications partial-unique index does
    // NOT dedupe rows whose actorId is NULL (SQLite treats NULLs as
    // distinct), so a system nudge would otherwise re-fire every
    // day. Snapshot the already-pending review_due nudges and skip
    // any (user, subject) we've already nudged while it's unread.
    const pending = new Set(
      db
        .select({
          userId: notifications.userId,
          subjectId: notifications.subjectId,
        })
        .from(notifications)
        .where(
          and(
            eq(notifications.kind, "review_due"),
            isNull(notifications.readAt),
          ),
        )
        .all()
        .map((n) => `${n.userId}:${n.subjectId}`),
    );
    const alreadyNudged = (userId: string, subjectId: string): boolean => {
      const k = `${userId}:${subjectId}`;
      if (pending.has(k)) return true;
      pending.add(k);
      return false;
    };

    // 1. Stale signed reproduction credentials → re-attest nudge.
    const revoked = revokedKeySet();
    const minted = db
      .select({
        id: reproductions.id,
        reproducerId: reproductions.reproducerId,
        mintedAt: reproductions.credentialMintedAt,
      })
      .from(reproductions)
      .where(isNotNull(reproductions.credentialMintedAt))
      .all();
    for (const r of minted) {
      if (!r.mintedAt) continue;
      if (revoked.has(revocationKey("reproduction", r.id))) continue;
      if (freshnessBand(r.mintedAt) !== "stale") continue;
      if (alreadyNudged(r.reproducerId, r.id)) continue;
      const ok = await notify({
        recipientId: r.reproducerId,
        actorId: null,
        kind: "review_due",
        subjectType: "reproduction",
        subjectId: r.id,
        contextSlug: null,
        preview:
          "A reproduction credential has gone stale — re-attest it to keep your proof fresh.",
      });
      if (ok) sent++;
    }

    // 2. Long-resolved misconceptions → prove-it-again nudge.
    const resolved = db
      .select({
        id: misconceptionDiagnoses.id,
        userId: misconceptionDiagnoses.userId,
        conceptSlug: misconceptionDiagnoses.conceptSlug,
        label: misconceptionDiagnoses.label,
        resolvedAt: misconceptionDiagnoses.resolvedAt,
      })
      .from(misconceptionDiagnoses)
      .where(
        and(
          eq(misconceptionDiagnoses.status, "resolved"),
          isNotNull(misconceptionDiagnoses.resolvedAt),
        ),
      )
      .all();
    for (const d of resolved) {
      const age = ageDays(d.resolvedAt);
      if (age === null || age < RESOLVED_DECAY_DAYS) continue;
      if (alreadyNudged(d.userId, d.id)) continue;
      const ok = await notify({
        recipientId: d.userId,
        actorId: null,
        kind: "review_due",
        subjectType: "mastery_node",
        subjectId: d.id,
        contextSlug: d.conceptSlug,
        preview: `Time to refresh "${d.label}" — prove it again to keep it sharp.`,
      });
      if (ok) sent++;
    }

    return { itemsProcessed: sent };
  },
};

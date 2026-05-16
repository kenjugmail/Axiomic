// Phase 34D — daily lapse sweep for learning commitments.
//
// Past-deadline 'active' commitments flip to 'lapsed' and the
// owner (+ witness, if any) is notified once. Idempotent: the
// status update only matches still-active rows, so re-runs are
// no-ops; the notify partial-unique-while-unread index dedupes
// the owner ping.

import { and, eq, lt } from "drizzle-orm";
import { getDb, learningCommitments } from "@axiomic/db";
import { notify } from "../lib/notifications";
import type { JobDefinition } from "../lib/jobs";

export const lapseCommitmentsJob: JobDefinition = {
  name: "lapse_commitments",
  intervalMs: 24 * 60 * 60_000, // daily
  async run() {
    const db = getDb();
    const now = new Date().toISOString();
    const due = db
      .select()
      .from(learningCommitments)
      .where(
        and(
          eq(learningCommitments.status, "active"),
          lt(learningCommitments.deadlineAt, now),
        ),
      )
      .all();
    let lapsed = 0;
    for (const cm of due) {
      const r = db
        .update(learningCommitments)
        .set({ status: "lapsed" })
        .where(
          and(
            eq(learningCommitments.id, cm.id),
            eq(learningCommitments.status, "active"),
          ),
        )
        .run();
      if (((r as unknown as { changes?: number }).changes ?? 0) === 0) {
        continue;
      }
      lapsed++;
      await notify({
        recipientId: cm.userId,
        actorId: null,
        kind: "commitment_lapsed",
        subjectType: "commitment",
        subjectId: cm.id,
        contextSlug: null,
        preview: `Your commitment "${cm.goalTitle}" passed its deadline.`,
      });
      if (cm.witnessUserId) {
        await notify({
          recipientId: cm.witnessUserId,
          actorId: null,
          kind: "commitment_lapsed",
          subjectType: "commitment",
          subjectId: cm.id,
          contextSlug: null,
          preview: `A commitment you witnessed lapsed: ${cm.goalTitle}.`,
        });
      }
    }
    return { itemsProcessed: lapsed };
  },
};

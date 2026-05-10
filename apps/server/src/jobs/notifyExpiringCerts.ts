// Sprint 80 — Daily cert-expiry notifier.
//
// For each non-expired userSafetyCertifications row, if the days-out
// to `expiresAt` falls in {30, 7, 1}, fire a `lab_cert_expiring`
// notification to the holder. Dedupe is handled by the partial
// unique index on notifications (idempotent while unread on
// (recipient, kind, subjectType, subjectId, actorId)).

import { isNotNull, eq } from "drizzle-orm";
import {
  getDb,
  safetyCertifications,
  userSafetyCertifications,
} from "@axiomic/db";
import { notify } from "../lib/notifications";
import type { JobDefinition } from "../lib/jobs";

const EXPIRY_WINDOWS = [30, 7, 1] as const;

function daysUntil(iso: string): number | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - Date.now()) / 86400_000);
}

export const notifyExpiringCertsJob: JobDefinition = {
  name: "notify_expiring_certs",
  intervalMs: 24 * 60 * 60_000, // daily
  async run() {
    const db = getDb();
    const rows = db
      .select({
        userId: userSafetyCertifications.userId,
        certSlug: userSafetyCertifications.certSlug,
        expiresAt: userSafetyCertifications.expiresAt,
        certId: safetyCertifications.id,
        certTitle: safetyCertifications.title,
      })
      .from(userSafetyCertifications)
      .leftJoin(
        safetyCertifications,
        eq(userSafetyCertifications.certSlug, safetyCertifications.slug),
      )
      .where(isNotNull(userSafetyCertifications.expiresAt))
      .all();

    let sent = 0;
    for (const r of rows) {
      if (!r.expiresAt) continue;
      const days = daysUntil(r.expiresAt);
      if (days === null || days <= 0) continue;
      if (!EXPIRY_WINDOWS.includes(days as (typeof EXPIRY_WINDOWS)[number])) {
        continue;
      }
      const ok = await notify({
        recipientId: r.userId,
        actorId: null,
        kind: "lab_cert_expiring",
        subjectType: "lab_cert",
        subjectId: r.certId ?? r.certSlug,
        contextSlug: r.certSlug,
        preview: `${r.certTitle ?? r.certSlug} — ${days}d until expiry`,
      });
      if (ok) sent++;
    }
    return { itemsProcessed: sent };
  },
};

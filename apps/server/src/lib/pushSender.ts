// S107a — Web Push fan-out.
//
// Sits alongside the in-tab WebSocket fan-out (publishToUser from
// liveBus.ts) so notification-bell events also surface as native
// browser notifications when the tab is closed.
//
// VAPID keys must be set via WEB_PUSH_VAPID_PUBLIC_KEY +
// WEB_PUSH_VAPID_PRIVATE_KEY. If unset, the sender is a no-op —
// dev servers without keys still run normally; only the push leg
// goes silent. Use the `bun run vapid:gen` task to generate a
// keypair for a new environment.

import { eq } from "drizzle-orm";
import webpush from "web-push";
import { getDb, pushSubscriptions } from "@axiomic/db";

let configured = false;
function configure(): boolean {
  if (configured) return true;
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT ?? "mailto:noreply@axiomic.dev";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export function getVapidPublicKey(): string | null {
  return process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? null;
}

// Sends `payload` to every subscription the user has. Best-effort:
// each failure is logged but doesn't unwind the others. HTTP 410
// (subscription gone) deletes that row so we don't keep paying to
// fail on dead endpoints.
export async function pushToUser(userId: string, payload: unknown): Promise<void> {
  if (!configure()) return;
  const db = getDb();
  const subs = db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .all();
  if (subs.length === 0) return;
  const body = JSON.stringify(payload);
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dhKey, auth: s.authKey },
          },
          body,
        );
        // Touch last-used so we can prune dormant subscriptions
        // later if needed.
        db.update(pushSubscriptions)
          .set({ lastUsedAt: new Date().toISOString() })
          .where(eq(pushSubscriptions.id, s.id))
          .run();
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          // Subscription is gone — drop the row so we stop retrying.
          db.delete(pushSubscriptions)
            .where(eq(pushSubscriptions.id, s.id))
            .run();
          return;
        }
        console.error("pushToUser send failed", { userId, status, err });
      }
    }),
  );
}

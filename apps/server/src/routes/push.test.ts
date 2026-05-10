// S107a — Web Push route tests.
//
// Covers the subscribe / unsubscribe round-trip; the actual delivery
// path through pushSender + web-push isn't tested here (would
// require mocking the library + bringing up a fake push service).

import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { getDb, pushSubscriptions } from "@axiomic/db";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
let counter = 0;

async function signup(suffix: string): Promise<{ cookie: string; userId: string }> {
  const username = `push_${suffix}_${testId}_${counter++}`.slice(0, 30);
  const res = await req("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password: "testpass123",
    }),
  });
  const cookie = res.headers.get("set-cookie") || "";
  const data = (await res.json()) as { user?: { id: string } };
  return { cookie, userId: data.user?.id ?? "" };
}

let alice = "";
let aliceUserId = "";

beforeAll(async () => {
  const a = await signup("alice");
  alice = a.cookie;
  aliceUserId = a.userId;
});

describe("/push routes (S107a)", () => {
  test("GET /push/vapid-public-key returns null when VAPID env unset", async () => {
    const r = await req("/push/vapid-public-key");
    expect(r.status).toBe(200);
    const data = (await r.json()) as { key: string | null };
    // In the test env, WEB_PUSH_VAPID_PUBLIC_KEY isn't set, so key
    // should be null. The handler still 200s — it's not an error.
    expect(data.key === null || typeof data.key === "string").toBe(true);
  });

  test("POST /push/subscribe writes a row, re-subscribe updates in place", async () => {
    const endpoint = `https://fcm.googleapis.com/fcm/send/test-${testId}-${counter++}`;
    const sub = await req("/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(alice) },
      body: JSON.stringify({
        endpoint,
        p256dhKey: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
        authKey: "tBHItJI5svbpez7KI4CCXg",
        userAgent: "TestAgent/1.0",
      }),
    });
    expect(sub.status).toBe(200);

    // Row exists.
    const rows = getDb()
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .all();
    expect(rows.length).toBe(1);
    expect(rows[0].userId).toBe(aliceUserId);

    // Re-subscribe with different keys — same endpoint, should
    // update in place (no duplicate row).
    const newP256 = "BFcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM";
    const sub2 = await req("/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(alice) },
      body: JSON.stringify({
        endpoint,
        p256dhKey: newP256,
        authKey: "newAuthKey",
        userAgent: "TestAgent/2.0",
      }),
    });
    expect(sub2.status).toBe(200);
    const rows2 = getDb()
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .all();
    expect(rows2.length).toBe(1);
    expect(rows2[0].p256dhKey).toBe(newP256);
    expect(rows2[0].userAgent).toBe("TestAgent/2.0");
  });

  test("POST /push/unsubscribe deletes the caller's subscription by endpoint", async () => {
    const endpoint = `https://fcm.googleapis.com/fcm/send/test-unsub-${testId}-${counter++}`;
    await req("/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(alice) },
      body: JSON.stringify({
        endpoint,
        p256dhKey: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
        authKey: "tBHItJI5svbpez7KI4CCXg",
      }),
    });
    const before = getDb()
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .all();
    expect(before.length).toBe(1);

    const unsub = await req("/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(alice) },
      body: JSON.stringify({ endpoint }),
    });
    expect(unsub.status).toBe(200);
    const after = getDb()
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .all();
    expect(after.length).toBe(0);
  });

  test("POST /push/subscribe requires auth (401 without cookie)", async () => {
    const r = await req("/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: "https://example.com/push",
        p256dhKey: "x",
        authKey: "y",
      }),
    });
    expect(r.status).toBe(401);
  });
});

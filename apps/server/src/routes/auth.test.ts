// Sprint 66b — auth route coverage.
//
// `auth.ts` was exercised through signup helpers in many other test
// files but had no dedicated suite. This covers the full login /
// logout / me lifecycle + the validation rejections.

import { describe, test, expect } from "bun:test";
import { app } from "../index";
import {
  emailVerificationTokens,
  getDb,
  passwordResetTokens,
  sessions,
  users,
} from "@axiomic/db";
import { eq } from "drizzle-orm";
import { checkRateLimit, rateLimits } from "../lib/rateLimit";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
let counter = 0;
function nextUsername(label: string): string {
  return `auth_${label}_${testId}_${counter++}`;
}

describe("auth route (Sprint 66b)", () => {
  test("signup happy path returns 201 + sets cookie", async () => {
    const username = nextUsername("happy");
    const res = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        email: `${username}@example.com`,
        password: "testpass123",
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.user.username).toBe(username);
    expect(body.user.email).toBe(`${username}@example.com`);
    expect(body.user.displayName).toBe(username);
    expect(res.headers.get("set-cookie")).toBeTruthy();
  });

  test("signup with displayName uses the provided value", async () => {
    const username = nextUsername("display");
    const res = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        email: `${username}@example.com`,
        password: "testpass123",
        displayName: "Captain Test",
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.user.displayName).toBe("Captain Test");
  });

  test("signup rejects duplicate email with 409", async () => {
    const username = nextUsername("dupe1");
    const email = `${username}@example.com`;
    const first = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password: "testpass123" }),
    });
    expect(first.status).toBe(201);
    const second = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: nextUsername("dupe2"),
        email,
        password: "testpass123",
      }),
    });
    expect(second.status).toBe(409);
    const body = (await second.json()) as any;
    expect(body.error).toMatch(/email/i);
  });

  test("signup rejects duplicate username with 409", async () => {
    const username = nextUsername("dupeuser");
    const first = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        email: `${username}-1@example.com`,
        password: "testpass123",
      }),
    });
    expect(first.status).toBe(201);
    const second = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        email: `${username}-2@example.com`,
        password: "testpass123",
      }),
    });
    expect(second.status).toBe(409);
    const body = (await second.json()) as any;
    expect(body.error).toMatch(/username/i);
  });

  test("signup rejects short password (zod)", async () => {
    const username = nextUsername("shortpw");
    const res = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        email: `${username}@example.com`,
        password: "short",
      }),
    });
    expect(res.status).toBe(400);
  });

  test("signup rejects invalid username characters", async () => {
    const res = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "invalid name!",
        email: `bad_${testId}@example.com`,
        password: "testpass123",
      }),
    });
    expect(res.status).toBe(400);
  });

  test("login happy path with correct password", async () => {
    const username = nextUsername("login");
    const email = `${username}@example.com`;
    const password = "loginpass1234";
    await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });
    const res = await req("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.user.username).toBe(username);
    expect(res.headers.get("set-cookie")).toBeTruthy();
  });

  test("login rejects wrong password with 401", async () => {
    const username = nextUsername("wrongpw");
    const email = `${username}@example.com`;
    await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password: "rightpass1234" }),
    });
    const res = await req("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "wrongpass1234" }),
    });
    expect(res.status).toBe(401);
  });

  test("login rejects unknown email with 401", async () => {
    const res = await req("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `nobody_${testId}@example.com`,
        password: "anything1234",
      }),
    });
    expect(res.status).toBe(401);
  });

  test("/me returns null user when anonymous", async () => {
    const res = await req("/auth/me");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.user).toBeNull();
  });

  test("/me returns the signed-in user", async () => {
    const username = nextUsername("me");
    const signup = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        email: `${username}@example.com`,
        password: "testpass123",
      }),
    });
    const cookie = signup.headers.get("set-cookie") || "";
    const res = await req("/auth/me", { headers: cookieHeader(cookie) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.user.username).toBe(username);
  });

  test("logout clears the session — subsequent /me with same cookie returns null", async () => {
    const username = nextUsername("logout");
    const signup = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        email: `${username}@example.com`,
        password: "testpass123",
      }),
    });
    const cookie = signup.headers.get("set-cookie") || "";
    const logout = await req("/auth/logout", {
      method: "POST",
      headers: cookieHeader(cookie),
    });
    expect(logout.status).toBe(200);
    // Use the cookie that logout sent back (it cleared the session).
    const cleared = logout.headers.get("set-cookie") || cookie;
    const res = await req("/auth/me", { headers: cookieHeader(cleared) });
    const body = (await res.json()) as any;
    expect(body.user).toBeNull();
  });
});

// =================================================================
// S109 — Coverage for the email-verification + password-reset +
// password-change endpoints shipped in Phases A and D.
// =================================================================

// Signup helper that returns the cookie + the username + the latest
// emailVerificationTokens row (signup mints one on the fly).
async function signupAndGetVerifyToken(label: string): Promise<{
  username: string;
  email: string;
  cookie: string;
  token: string;
  userId: string;
}> {
  const username = nextUsername(label);
  const email = `${username}@example.com`;
  const signup = await req("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password: "testpass123" }),
  });
  expect(signup.status).toBe(201);
  const cookie = signup.headers.get("set-cookie") || "";
  const body = (await signup.json()) as { user: { id: string } };
  const userId = body.user.id;
  // The signup route auto-sets emailVerifiedAt in NODE_ENV=test so
  // every other test file can publish without juggling tokens.
  // The verify-email tests specifically need the unverified state,
  // so reset the column here.
  getDb()
    .update(users)
    .set({ emailVerifiedAt: null })
    .where(eq(users.id, userId))
    .run();
  // signup fires sendVerifyEmail asynchronously; the token row exists
  // by the time the response returns because the DB write is sync.
  const row = getDb()
    .select()
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.userId, userId))
    .get();
  expect(row).toBeTruthy();
  return { username, email, cookie, token: row!.token, userId };
}

describe("POST /auth/verify-email (Phase A)", () => {
  test("valid token flips emailVerifiedAt", async () => {
    const { userId, token } = await signupAndGetVerifyToken("vok");
    const before = getDb()
      .select({ ev: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    expect(before?.ev).toBeNull();

    const res = await req("/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    expect(res.status).toBe(200);

    const after = getDb()
      .select({ ev: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    expect(after?.ev).toBeTruthy();
  });

  test("invalid token returns 400", async () => {
    const res = await req("/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "deadbeef".repeat(8) }),
    });
    expect(res.status).toBe(400);
  });

  test("expired token returns 400 and deletes the row", async () => {
    const { userId, token } = await signupAndGetVerifyToken("vexp");
    // Backdate the token's expiresAt by 1 day.
    getDb()
      .update(emailVerificationTokens)
      .set({ expiresAt: new Date(Date.now() - 24 * 60 * 60_000).toISOString() })
      .where(eq(emailVerificationTokens.token, token))
      .run();

    const res = await req("/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    expect(res.status).toBe(400);

    // The row should be gone — expired tokens are cleaned up on use.
    const remaining = getDb()
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.token, token))
      .get();
    expect(remaining).toBeUndefined();

    // emailVerifiedAt is still null.
    const u = getDb()
      .select({ ev: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    expect(u?.ev).toBeNull();
  });

  test("reused token returns 400", async () => {
    const { token } = await signupAndGetVerifyToken("vreu");
    const first = await req("/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    expect(first.status).toBe(200);

    const second = await req("/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    expect(second.status).toBe(400);
  });
});

describe("POST /auth/resend-verify (Phase A)", () => {
  test("unauthenticated returns 401", async () => {
    const res = await req("/auth/resend-verify", { method: "POST" });
    expect(res.status).toBe(401);
  });

  test("authenticated user gets a fresh token row", async () => {
    const { userId, cookie } = await signupAndGetVerifyToken("rfr");
    // Drop the existing token so the next call has to create one.
    getDb()
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, userId))
      .run();

    const res = await req("/auth/resend-verify", {
      method: "POST",
      headers: cookieHeader(cookie),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; alreadyVerified?: boolean };
    expect(body.ok).toBe(true);
    expect(body.alreadyVerified).toBeFalsy();

    const row = getDb()
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, userId))
      .get();
    expect(row).toBeTruthy();
  });

  test("already-verified user returns ok + alreadyVerified flag, no token minted", async () => {
    const { userId, cookie } = await signupAndGetVerifyToken("ralr");
    // Mark verified + drop tokens.
    getDb()
      .update(users)
      .set({ emailVerifiedAt: new Date().toISOString() })
      .where(eq(users.id, userId))
      .run();
    getDb()
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, userId))
      .run();

    const res = await req("/auth/resend-verify", {
      method: "POST",
      headers: cookieHeader(cookie),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; alreadyVerified?: boolean };
    expect(body.alreadyVerified).toBe(true);

    const row = getDb()
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, userId))
      .get();
    expect(row).toBeUndefined();
  });
});

describe("POST /auth/forgot-password (Phase D)", () => {
  test("returns 204 for a known email and writes a token row", async () => {
    const { userId, email } = await signupAndGetVerifyToken("fkn");
    // Drop any existing reset tokens for this user.
    getDb()
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId))
      .run();

    const res = await req("/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    expect(res.status).toBe(204);

    const row = getDb()
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId))
      .get();
    expect(row).toBeTruthy();
  });

  test("returns 204 for an unknown email and does NOT write a token", async () => {
    const fakeEmail = `nobody_${testId}_${counter++}@example.com`;
    const before = getDb().select().from(passwordResetTokens).all().length;
    const res = await req("/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: fakeEmail }),
    });
    expect(res.status).toBe(204);
    const after = getDb().select().from(passwordResetTokens).all().length;
    expect(after).toBe(before);
  });

  test("rate limiter math: 5 succeed, 6th rejected on same IP key", () => {
    // The endpoint skips checkRateLimit when NODE_ENV=test. We test
    // the rate-limit configuration directly to prove the limit is
    // 5/min and the key shape works.
    const key = `forgot-pw:test-ip-${testId}-${counter++}`;
    rateLimits.delete(key);
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, 5, 60_000)).toBe(true);
    }
    expect(checkRateLimit(key, 5, 60_000)).toBe(false);
  });
});

describe("POST /auth/reset-password (Phase D)", () => {
  async function setupResetToken(label: string): Promise<{
    userId: string;
    email: string;
    cookie: string;
    token: string;
  }> {
    const { userId, email, cookie } = await signupAndGetVerifyToken(label);
    // Mint a reset token directly (the endpoint dispatches the email
    // asynchronously and we don't want to wait on that).
    const token = "rstok_" + Math.random().toString(36).slice(2) + "_" + Date.now().toString(36);
    const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
    getDb()
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId))
      .run();
    getDb()
      .insert(passwordResetTokens)
      .values({ token, userId, expiresAt })
      .run();
    return { userId, email, cookie, token };
  }

  test("valid token rotates the hash and new password works at login", async () => {
    const { userId, email, token } = await setupResetToken("rrot");
    const newPassword = "freshpass12345";

    const before = getDb()
      .select({ h: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    const beforeHash = before!.h;

    const res = await req("/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword }),
    });
    expect(res.status).toBe(200);

    const after = getDb()
      .select({ h: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    expect(after!.h).not.toBe(beforeHash);

    // New password works at login.
    const login = await req("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: newPassword }),
    });
    expect(login.status).toBe(200);
  });

  test("valid token destroys all of the user's sessions", async () => {
    const { userId, token } = await setupResetToken("rkll");
    // Confirm the signup session exists.
    const before = getDb()
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .all();
    expect(before.length).toBeGreaterThan(0);

    const res = await req("/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword: "anothernewpw123" }),
    });
    expect(res.status).toBe(200);

    const after = getDb()
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .all();
    expect(after.length).toBe(0);
  });

  test("expired token returns 400 and is cleaned up", async () => {
    const { userId, token } = await setupResetToken("rexp");
    getDb()
      .update(passwordResetTokens)
      .set({ expiresAt: new Date(Date.now() - 60_000).toISOString() })
      .where(eq(passwordResetTokens.token, token))
      .run();

    const res = await req("/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword: "expiredflow123" }),
    });
    expect(res.status).toBe(400);

    const remaining = getDb()
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId))
      .get();
    expect(remaining).toBeUndefined();
  });

  test("already-consumed token returns 400 (deleted on use)", async () => {
    const { token } = await setupResetToken("rreu");
    const first = await req("/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword: "firstuse12345" }),
    });
    expect(first.status).toBe(200);

    const second = await req("/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword: "seconduse123" }),
    });
    expect(second.status).toBe(400);
  });

  test("newPassword shorter than 8 chars returns 400 (zod)", async () => {
    const { token } = await setupResetToken("rsht");
    const res = await req("/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword: "short" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/change-password (Phase D)", () => {
  test("unauthenticated returns 401", async () => {
    const res = await req("/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: "x", newPassword: "anothernew1234" }),
    });
    expect(res.status).toBe(401);
  });

  test("wrong current password returns 401 and hash is unchanged", async () => {
    const { userId, cookie } = await signupAndGetVerifyToken("cwrg");
    const before = getDb()
      .select({ h: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    const res = await req("/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        currentPassword: "completelyWRONG",
        newPassword: "anothernew1234",
      }),
    });
    expect(res.status).toBe(401);
    const after = getDb()
      .select({ h: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    expect(after!.h).toBe(before!.h);
  });

  test("correct password rotates the hash, keeps current session, kills other sessions", async () => {
    const { userId, email, cookie } = await signupAndGetVerifyToken("ckpt");
    // Add a second session via login.
    const second = await req("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "testpass123" }),
    });
    expect(second.status).toBe(200);
    const secondCookie = second.headers.get("set-cookie") || "";

    const beforeSessions = getDb()
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .all();
    expect(beforeSessions.length).toBe(2);

    const beforeHash = getDb()
      .select({ h: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .get()!.h;

    const res = await req("/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        currentPassword: "testpass123",
        newPassword: "rotatedpass1234",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; otherSessionsRevoked: number };
    expect(body.ok).toBe(true);
    expect(body.otherSessionsRevoked).toBe(1);

    // The hash should be different.
    const afterHash = getDb()
      .select({ h: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .get()!.h;
    expect(afterHash).not.toBe(beforeHash);

    // Current session still works (cookie not the kicked one).
    const me = await req("/auth/me", { headers: cookieHeader(cookie) });
    const meBody = (await me.json()) as { user: { id?: string } | null };
    expect(meBody.user?.id).toBe(userId);

    // Second session is dead.
    const me2 = await req("/auth/me", { headers: cookieHeader(secondCookie) });
    const me2Body = (await me2.json()) as { user: { id?: string } | null };
    expect(me2Body.user).toBeNull();
  });

  test("rate limiter math: 5 succeed, 6th rejected on same user+IP key", () => {
    // /auth/change-password's runtime limiter is skipped in test
    // env, but the key shape + max are configured in the route.
    // This verifies the math.
    const key = `pw-change:user-${testId}-${counter++}:test-ip`;
    rateLimits.delete(key);
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, 5, 60_000)).toBe(true);
    }
    expect(checkRateLimit(key, 5, 60_000)).toBe(false);
  });
});

// =================================================================
// S109 — Phase H.2: requireVerifiedEmail enforcement.
// =================================================================

describe("requireVerifiedEmail gate (Phase H.2)", () => {
  // Helper: signup, then force the user to unverified state.
  async function signupUnverified(label: string) {
    const username = nextUsername(label);
    const email = `${username}@example.com`;
    const signup = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password: "testpass123" }),
    });
    expect(signup.status).toBe(201);
    const cookie = signup.headers.get("set-cookie") || "";
    const body = (await signup.json()) as { user: { id: string } };
    getDb()
      .update(users)
      .set({ emailVerifiedAt: null })
      .where(eq(users.id, body.user.id))
      .run();
    return { cookie, userId: body.user.id };
  }

  test("verified user can POST /forum/topics (201)", async () => {
    const username = nextUsername("vgok");
    const signup = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        email: `${username}@example.com`,
        password: "testpass123",
      }),
    });
    const cookie = signup.headers.get("set-cookie") || "";
    // Signup auto-verifies in test mode, so this user is verified.
    const res = await req("/forum/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        title: "Hello verified",
        body: "Body content from a verified user.",
        postType: "claim",
        domainSlug: "ml",
      }),
    });
    expect(res.status).toBe(201);
  });

  test("unverified user POST /forum/topics returns 403", async () => {
    const { cookie } = await signupUnverified("vgno");
    const res = await req("/forum/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        title: "Should be blocked",
        body: "Body from an unverified user.",
        postType: "claim",
        domainSlug: "ml",
      }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/verif/i);
  });

  test("unverified user POST /comments returns 403", async () => {
    const { cookie } = await signupUnverified("cgno");
    const res = await req("/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        pageId: "some-page",
        content: "I am unverified and shouldn't be able to comment.",
      }),
    });
    expect(res.status).toBe(403);
  });
});

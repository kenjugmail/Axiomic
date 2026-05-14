// Auth routes — signup, login, logout, me, verify-email, resend-verify.
//
// S108 — Beta hardening:
//   - Per-IP rate limit on /signup (10/min) and /login (20/min).
//   - Per-email login lockout: 5 failed attempts within 15 minutes
//     blocks further attempts with HTTP 423. A successful login (or
//     a fresh window) clears the lockout.
//   - Cloudflare Turnstile captcha verified on /signup when
//     TURNSTILE_SECRET_KEY is set; silently bypassed otherwise so
//     dev / CI / self-hosted-without-captcha still work.
//   - On /signup, mint an email-verification token and dispatch the
//     verify email (real Resend send in production, console log in
//     dev). Users can log in without verifying — they just see a
//     banner and can't publish until they do.
//   - Login refuses accounts with `deletedAt is not null` and points
//     the user at support.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  authLoginAttempts,
  emailVerificationTokens,
  getDb,
  passwordResetTokens,
  users,
} from "@axiomic/db";
import { and, eq, gt, sql } from "drizzle-orm";
import { randomUUID, randomBytes } from "crypto";
import {
  createSession,
  currentSessionId,
  destroyAllSessions,
  destroySession,
  getSessionUser,
} from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { verifyTurnstile } from "../lib/turnstile";
import { sendEmail } from "../lib/email";
import { env } from "../lib/envConfig";
import { logger } from "../lib/logger";
import { maybeHatchPet } from "../lib/xp";

const auth = new Hono();

const signupSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/),
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().optional(),
  // Turnstile widget token. Optional in the schema because dev /
  // tests don't have Turnstile; the server-side verifyTurnstile()
  // call bypasses cleanly when TURNSTILE_SECRET_KEY is unset.
  turnstileToken: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// Lockout config: 5 failed attempts in 15 minutes locks the email.
const LOGIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCKOUT_THRESHOLD = 5;

function clientIp(c: { req: { header: (n: string) => string | undefined } }): string | undefined {
  const xff = c.req.header("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim();
  return undefined;
}

function recordLoginAttempt(email: string, ip: string | undefined, success: boolean): void {
  const db = getDb();
  db.insert(authLoginAttempts).values({
    id: randomUUID(),
    email: email.toLowerCase(),
    ip: ip ?? null,
    success,
  }).run();
}

function isLockedOut(email: string): boolean {
  const db = getDb();
  const cutoff = new Date(Date.now() - LOGIN_LOCKOUT_WINDOW_MS).toISOString();
  const failures = db
    .select({ n: sql<number>`count(*)` })
    .from(authLoginAttempts)
    .where(
      and(
        eq(authLoginAttempts.email, email.toLowerCase()),
        eq(authLoginAttempts.success, false),
        gt(authLoginAttempts.attemptedAt, cutoff),
      ),
    )
    .get();
  return Number(failures?.n ?? 0) >= LOGIN_LOCKOUT_THRESHOLD;
}

function clearFailedAttempts(email: string): void {
  const db = getDb();
  // Mark recent failures as expired by deleting them. Cheaper than
  // adding a "cleared_at" column and keeps the lockout query simple.
  db.delete(authLoginAttempts)
    .where(
      and(
        eq(authLoginAttempts.email, email.toLowerCase()),
        eq(authLoginAttempts.success, false),
      ),
    )
    .run();
}

function appBaseUrl(c: { req: { header: (n: string) => string | undefined; url: string } }): string {
  if (env.APP_BASE_URL) return env.APP_BASE_URL.replace(/\/$/, "");
  // Prefer Origin/Host headers over the raw request URL — the server
  // is usually behind a reverse proxy that rewrites the path.
  const origin = c.req.header("origin");
  if (origin) return origin.replace(/\/$/, "");
  const host = c.req.header("host");
  const proto = c.req.header("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  try {
    return new URL(c.req.url).origin;
  } catch {
    return "https://axiomic.app";
  }
}

async function sendVerifyEmail(userId: string, email: string, baseUrl: string): Promise<void> {
  const db = getDb();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  db.insert(emailVerificationTokens).values({
    token,
    userId,
    expiresAt,
  }).run();
  const verifyUrl = `${baseUrl}/verify-email?token=${token}`;
  const subject = "Verify your Axiomic email";
  const text = `Welcome to Axiomic!\n\nClick this link to verify your email address:\n${verifyUrl}\n\nThis link expires in 24 hours.`;
  const html =
    `<p>Welcome to Axiomic!</p>` +
    `<p>Click the link below to verify your email address:</p>` +
    `<p><a href="${verifyUrl}">${verifyUrl}</a></p>` +
    `<p>This link expires in 24 hours.</p>`;
  await sendEmail({ to: email, subject, html, text });
}

auth.post("/signup", zValidator("json", signupSchema), async (c) => {
  const ip = clientIp(c);

  // Rate-limit signups per IP. 10/min is plenty for any legitimate
  // browser; a bot sweeping the endpoint hits the wall immediately.
  // Skipped in NODE_ENV=test so test helpers can spin up many users.
  if (env.NODE_ENV !== "test") {
    const rateKey = `signup:${ip ?? "anon"}`;
    if (!checkRateLimit(rateKey, 10, 60_000)) {
      return c.json({ error: "Too many signup attempts. Try again in a minute." }, 429);
    }
  }

  const { username, email, password, displayName, turnstileToken } = c.req.valid("json");

  // Cloudflare Turnstile verification. Silently passes when the
  // secret isn't configured for this deploy.
  const captcha = await verifyTurnstile(turnstileToken, ip);
  if (!captcha.ok) {
    logger.warn({
      kind: "auth.turnstile_failed",
      msg: "Turnstile verification failed",
      email,
      reason: captcha.reason,
    });
    return c.json({ error: "Captcha verification failed. Refresh and try again." }, 400);
  }

  const db = getDb();
  const existingEmail = db.select().from(users).where(eq(users.email, email)).get();
  if (existingEmail) {
    return c.json({ error: "Email already registered" }, 409);
  }
  const existingUsername = db.select().from(users).where(eq(users.username, username)).get();
  if (existingUsername) {
    return c.json({ error: "Username already taken" }, 409);
  }

  const passwordHash = await Bun.password.hash(password, "bcrypt");
  const userId = randomUUID();

  db.insert(users).values({
    id: userId,
    username,
    email,
    passwordHash,
    displayName: displayName || username,
    // S109 — auto-verify in the test environment so existing test
    // helpers can publish/comment/upload without each test having to
    // first mint and consume a verify-email token. Tests that
    // specifically exercise the verify-email or requireVerifiedEmail
    // flow reset this column to null manually after signup.
    emailVerifiedAt: env.NODE_ENV === "test" ? new Date().toISOString() : null,
  }).run();

  // Phase X — auto-hatch the user's first pet at signup so /me/pet,
  // forum bylines, and leaderboards have a visible avatar immediately.
  // Idempotent (no-op if a pet already exists for this user).
  maybeHatchPet(userId);

  // Fire-and-forget the verify email. We don't await because the
  // network call to Resend can be slow and the user shouldn't wait
  // on it to see the signup-success response.
  sendVerifyEmail(userId, email, appBaseUrl(c)).catch((e) => {
    logger.warn({
      kind: "auth.signup.verify_email_failed",
      msg: "verify email send failed",
      err: String(e),
    });
  });

  await createSession(c, userId);

  return c.json({
    user: { id: userId, username, email, displayName: displayName || username, emailVerifiedAt: null },
  }, 201);
});

auth.post("/login", zValidator("json", loginSchema), async (c) => {
  const ip = clientIp(c);
  if (env.NODE_ENV !== "test") {
    const rateKey = `login-ip:${ip ?? "anon"}`;
    if (!checkRateLimit(rateKey, 20, 60_000)) {
      return c.json({ error: "Too many login attempts from this IP. Wait a minute." }, 429);
    }
  }

  const { email, password } = c.req.valid("json");

  // Lockout check happens BEFORE the password verify so an attacker
  // can't time-side-channel valid emails from invalid passwords once
  // they're locked out. Skipped in tests.
  if (env.NODE_ENV !== "test" && isLockedOut(email)) {
    return c.json(
      {
        error: "Account temporarily locked",
        message: "Too many failed login attempts. Try again in 15 minutes or reset your password.",
      },
      423,
    );
  }

  const db = getDb();
  const user = db.select().from(users).where(eq(users.email, email)).get();
  if (!user) {
    recordLoginAttempt(email, ip, false);
    return c.json({ error: "Invalid email or password" }, 401);
  }

  if (user.deletedAt) {
    return c.json(
      {
        error: "Account scheduled for deletion",
        message:
          "This account was deleted and is being purged in 30 days. Contact support to recover before then.",
      },
      403,
    );
  }

  const valid = await Bun.password.verify(password, user.passwordHash, "bcrypt");
  if (!valid) {
    recordLoginAttempt(email, ip, false);
    return c.json({ error: "Invalid email or password" }, 401);
  }

  recordLoginAttempt(email, ip, true);
  clearFailedAttempts(email);
  await createSession(c, user.id);

  return c.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      emailVerifiedAt: user.emailVerifiedAt,
    },
  });
});

auth.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

auth.get("/me", async (c) => {
  const user = await getSessionUser(c);
  if (!user) {
    return c.json({ user: null });
  }
  return c.json({ user });
});

// S108 — Verify email link target. The user clicks
// /verify-email?token=... in their inbox; the frontend page POSTs
// the token here. On success, sets `emailVerifiedAt` and returns ok.
auth.post(
  "/verify-email",
  zValidator("json", z.object({ token: z.string().min(16).max(128) })),
  async (c) => {
    const { token } = c.req.valid("json");
    const db = getDb();
    const row = db
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.token, token))
      .get();
    if (!row) {
      return c.json({ error: "Invalid or expired verification link" }, 400);
    }
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.token, token)).run();
      return c.json({ error: "Verification link expired. Request a new one." }, 400);
    }
    db.update(users)
      .set({ emailVerifiedAt: new Date().toISOString() })
      .where(eq(users.id, row.userId))
      .run();
    db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.token, token)).run();
    return c.json({ ok: true });
  },
);

// POST /auth/resend-verify — for the banner's "Resend" button. Auth'd;
// idempotent (overwrites the live token).
auth.post("/resend-verify", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (user.emailVerifiedAt) return c.json({ ok: true, alreadyVerified: true });
  const db = getDb();
  // Drop any existing token for this user.
  db.delete(emailVerificationTokens)
    .where(eq(emailVerificationTokens.userId, user.id))
    .run();
  await sendVerifyEmail(user.id, user.email, appBaseUrl(c));
  return c.json({ ok: true });
});

// =================================================================
// S109 — Password reset + change password.
// =================================================================

const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

async function sendPasswordResetEmail(
  userId: string,
  email: string,
  baseUrl: string,
): Promise<void> {
  const db = getDb();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS).toISOString();
  // Idempotent: if a previous unused token exists, drop it so only one
  // active link is in flight at a time.
  db.delete(passwordResetTokens)
    .where(eq(passwordResetTokens.userId, userId))
    .run();
  db.insert(passwordResetTokens)
    .values({ token, userId, expiresAt })
    .run();
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;
  const subject = "Reset your Axiomic password";
  const text = `Someone (hopefully you) requested a password reset for your Axiomic account.\n\nReset link (expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`;
  const html =
    `<p>Someone (hopefully you) requested a password reset for your Axiomic account.</p>` +
    `<p>Reset link (expires in 1 hour): <a href="${resetUrl}">${resetUrl}</a></p>` +
    `<p>If you didn't request this, you can safely ignore this email.</p>`;
  await sendEmail({ to: email, subject, html, text });
}

// POST /auth/forgot-password — request a reset email. Rate-limited
// per IP. ALWAYS returns 204 regardless of whether the email exists
// so an attacker can't enumerate registered accounts via this route.
auth.post(
  "/forgot-password",
  zValidator("json", z.object({ email: z.string().email() })),
  async (c) => {
    const ip = clientIp(c);
    if (env.NODE_ENV !== "test") {
      const key = `forgot-pw:${ip ?? "anon"}`;
      if (!checkRateLimit(key, 5, 60_000)) {
        // Even on rate-limit we hide the 429 from leaking enumeration.
        // Return 204; the legitimate user can try again next minute.
        return c.body(null, 204);
      }
    }
    const { email } = c.req.valid("json");
    const db = getDb();
    const user = db.select().from(users).where(eq(users.email, email)).get();
    if (user && !user.deletedAt) {
      sendPasswordResetEmail(user.id, user.email, appBaseUrl(c)).catch((e) => {
        logger.warn({
          kind: "auth.forgot_password.email_failed",
          msg: "password reset email send failed",
          err: String(e),
        });
      });
    }
    // Always 204 — never leak existence.
    return c.body(null, 204);
  },
);

// POST /auth/reset-password — consume the token, update the
// password, destroy ALL sessions for the user (so anyone who already
// had a stolen cookie is kicked out).
auth.post(
  "/reset-password",
  zValidator(
    "json",
    z.object({
      token: z.string().min(16).max(128),
      newPassword: z.string().min(8),
    }),
  ),
  async (c) => {
    const { token, newPassword } = c.req.valid("json");
    const db = getDb();
    const row = db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token))
      .get();
    if (!row) {
      return c.json({ error: "Invalid or expired reset link" }, 400);
    }
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      db.delete(passwordResetTokens).where(eq(passwordResetTokens.token, token)).run();
      return c.json({ error: "Reset link expired. Request a new one." }, 400);
    }
    const passwordHash = await Bun.password.hash(newPassword, "bcrypt");
    db.update(users)
      .set({ passwordHash })
      .where(eq(users.id, row.userId))
      .run();
    db.delete(passwordResetTokens).where(eq(passwordResetTokens.token, token)).run();
    // Forced sign-out everywhere. Anyone holding a session cookie for
    // this account loses it on their next request.
    destroyAllSessions(row.userId);
    return c.json({ ok: true });
  },
);

// POST /auth/verify-email-change — confirm a pending email change.
// User clicked the link sent to the NEW address. Copies
// pendingEmail → email, marks emailVerifiedAt, deletes the token,
// and (defense in depth) destroys every other session so the old
// address can't continue using whatever cookie it held.
auth.post(
  "/verify-email-change",
  zValidator("json", z.object({ token: z.string().min(16).max(128) })),
  async (c) => {
    const { token } = c.req.valid("json");
    const db = getDb();
    const tok = db
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.token, token))
      .get();
    if (!tok) return c.json({ error: "Invalid or expired link" }, 400);
    if (new Date(tok.expiresAt).getTime() < Date.now()) {
      db.delete(emailVerificationTokens)
        .where(eq(emailVerificationTokens.token, token))
        .run();
      return c.json({ error: "Verification link expired. Request a new one." }, 400);
    }
    const u = db.select().from(users).where(eq(users.id, tok.userId)).get();
    if (!u || !u.pendingEmail) {
      return c.json({ error: "No pending email change for this account." }, 400);
    }
    // Make sure the pending address is still free.
    const taken = db.select({ id: users.id }).from(users).where(eq(users.email, u.pendingEmail)).get();
    if (taken && taken.id !== u.id) {
      // Someone else grabbed it between request and verify. Clear
      // the pending flag so the user can try a different one.
      db.update(users).set({ pendingEmail: null }).where(eq(users.id, u.id)).run();
      db.delete(emailVerificationTokens)
        .where(eq(emailVerificationTokens.token, token))
        .run();
      return c.json({ error: "That email is no longer available." }, 409);
    }
    // Phase 20A — the line 481 pre-check can be raced. If a
    // concurrent verify between here and the UPDATE below grabs the
    // same address, the UNIQUE constraint on users.email throws.
    // Catch it, clear pendingEmail, and surface the same 409 the
    // pre-check returns rather than a 500 with a SQLite stack.
    try {
      db.update(users)
        .set({
          email: u.pendingEmail,
          pendingEmail: null,
          emailVerifiedAt: new Date().toISOString(),
        })
        .where(eq(users.id, u.id))
        .run();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/UNIQUE/i.test(msg) && /email/i.test(msg)) {
        db.update(users).set({ pendingEmail: null }).where(eq(users.id, u.id)).run();
        db.delete(emailVerificationTokens)
          .where(eq(emailVerificationTokens.token, token))
          .run();
        return c.json({ error: "That email is no longer available." }, 409);
      }
      throw e;
    }
    db.delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.token, token))
      .run();
    // Forced sign-out everywhere except the calling browser (which
    // might not be signed in at all — clicking the link from email
    // often opens an anonymous tab — in which case this revokes
    // every existing session).
    const cur = currentSessionId(c);
    destroyAllSessions(u.id, cur);
    return c.json({ ok: true, newEmail: u.pendingEmail });
  },
);

// POST /auth/change-password — authenticated user rotates their own
// password. Verifies the old password (so a stolen session cookie
// can't be used to lock out the real user), then destroys every
// OTHER session, keeping the current browser logged in.
auth.post(
  "/change-password",
  zValidator(
    "json",
    z.object({
      currentPassword: z.string(),
      newPassword: z.string().min(8),
    }),
  ),
  async (c) => {
    const user = await getSessionUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    // S109 — rate-limit the current-password check so a session-cookie
    // holder can't brute-force the user's current password. Keyed by
    // user id + IP so legitimate use from a single browser isn't
    // affected by other sessions hitting the limit. Skipped in test.
    if (env.NODE_ENV !== "test") {
      const ip = clientIp(c);
      const key = `pw-change:${user.id}:${ip ?? "anon"}`;
      if (!checkRateLimit(key, 5, 60_000)) {
        return c.json(
          { error: "Too many password change attempts. Try again in a minute." },
          429,
        );
      }
    }
    const { currentPassword, newPassword } = c.req.valid("json");
    const db = getDb();
    const row = db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, user.id))
      .get();
    if (!row) return c.json({ error: "User not found" }, 404);
    const ok = await Bun.password.verify(currentPassword, row.passwordHash, "bcrypt");
    if (!ok) return c.json({ error: "Current password is incorrect" }, 401);
    const passwordHash = await Bun.password.hash(newPassword, "bcrypt");
    db.update(users)
      .set({ passwordHash })
      .where(eq(users.id, user.id))
      .run();
    // Keep the calling browser logged in; kill every other device.
    const cur = currentSessionId(c);
    const removed = destroyAllSessions(user.id, cur);
    return c.json({ ok: true, otherSessionsRevoked: removed });
  },
);

export { auth };

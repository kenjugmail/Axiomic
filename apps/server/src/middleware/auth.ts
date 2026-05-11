import { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { getDb, sessions, users } from "@axiomic/db";
import { eq, and, gt, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { Env } from "../env";
import { env } from "../lib/envConfig";

const SESSION_COOKIE = "axiomic_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function createSession(c: Context, userId: string): Promise<string> {
  const db = getDb();
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

  // S109 — capture the calling client's UA + IP so the user can see
  // and revoke devices from settings. Both are nullable.
  const userAgent = c.req.header("user-agent")?.slice(0, 500) ?? null;
  const xff = c.req.header("x-forwarded-for");
  const ip = xff ? xff.split(",")[0]?.trim().slice(0, 64) ?? null : null;

  db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt,
    userAgent,
    ip,
  }).run();

  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
    // Force HTTPS-only cookies in production. Local dev keeps secure
    // off so the cookie works against http://localhost.
    secure: env.NODE_ENV === "production",
  });

  return sessionId;
}

// S109 — Expose the current session id without revealing the cookie
// to other modules. Used by /auth/change-password to keep the
// calling browser logged in while destroying every other session.
export function currentSessionId(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}

export async function destroySession(c: Context): Promise<void> {
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (sessionId) {
    const db = getDb();
    db.delete(sessions).where(eq(sessions.id, sessionId)).run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

// S109 — Destroy every session row for a user. Used by:
//   - /auth/reset-password (forced sign-out everywhere after a reset)
//   - /auth/change-password (everywhere except current — passes `exceptId`)
//   - /me/email-change once the new address verifies
// Returns the number of rows removed.
export function destroyAllSessions(userId: string, exceptId?: string): number {
  const db = getDb();
  const filter = exceptId
    ? and(eq(sessions.userId, userId), sql`${sessions.id} <> ${exceptId}`)
    : eq(sessions.userId, userId);
  const rows = db.select({ id: sessions.id }).from(sessions).where(filter).all();
  if (rows.length === 0) return 0;
  db.delete(sessions).where(filter).run();
  return rows.length;
}

const SESSION_USER_COLUMNS = {
  id: users.id,
  username: users.username,
  email: users.email,
  displayName: users.displayName,
  bio: users.bio,
  role: users.role,
  createdAt: users.createdAt,
  primaryPersona: users.primaryPersona,
  // S108 — surfaced for the verify-email banner + requireVerifiedEmail.
  emailVerifiedAt: users.emailVerifiedAt,
  deletedAt: users.deletedAt,
} as const;

function devBypassEnabled(): boolean {
  return env.DEV_AUTH_BYPASS === "1" && env.NODE_ENV !== "production";
}

// Resolve a session-cookie's owning user from a raw Cookie header.
// Used by the WebSocket upgrade handler, which has a Request but not
// a Hono Context. Returns null if there's no valid session.
export function userFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) {
    if (devBypassEnabled()) {
      const username = env.DEV_AUTH_BYPASS_USER;
      const db = getDb();
      const u = db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, username))
        .get();
      return u?.id ?? null;
    }
    return null;
  }
  const cookies = Object.fromEntries(
    cookieHeader.split(/;\s*/).map((p) => {
      const i = p.indexOf("=");
      return i === -1 ? [p, ""] : [p.slice(0, i), decodeURIComponent(p.slice(i + 1))];
    }),
  );
  const sessionId = cookies[SESSION_COOKIE];
  if (!sessionId) return null;
  const now = new Date().toISOString();
  const db = getDb();
  const result = db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, now)))
    .get();
  return result?.userId ?? null;
}

export async function getSessionUser(c: Context) {
  const sessionId = getCookie(c, SESSION_COOKIE);
  const db = getDb();

  if (sessionId) {
    const now = new Date().toISOString();
    const result = db
      .select(SESSION_USER_COLUMNS)
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, now)))
      .get();
    if (result) return result;
  }

  if (devBypassEnabled()) {
    const username = env.DEV_AUTH_BYPASS_USER;
    const result = db
      .select(SESSION_USER_COLUMNS)
      .from(users)
      .where(eq(users.username, username))
      .get();
    return result || null;
  }

  return null;
}

export async function requireAuth(c: Context<Env>, next: Next) {
  const user = await getSessionUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("user", user);
  return next();
}

// S108 — Gate destructive / outbound-visible actions behind email
// verification. Login still works without verification (so the user
// can read the verify-email banner and request a resend); publishing
// + uploading is what we want to block until they prove the email is
// theirs. Applied as middleware on POST /wiki publish, POST /uploads,
// and similar.
export async function requireVerifiedEmail(c: Context<Env>, next: Next) {
  const user = await getSessionUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (!user.emailVerifiedAt) {
    return c.json(
      {
        error: "Email verification required",
        message: "Verify your email address before publishing or uploading content.",
      },
      403,
    );
  }
  c.set("user", user);
  return next();
}

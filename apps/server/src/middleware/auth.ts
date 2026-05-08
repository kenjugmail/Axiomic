import { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { getDb, sessions, users } from "@axiomic/db";
import { eq, and, gt } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { Env } from "../env";
import { env } from "../lib/envConfig";

const SESSION_COOKIE = "axiomic_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function createSession(c: Context, userId: string): Promise<string> {
  const db = getDb();
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

  db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt,
  }).run();

  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });

  return sessionId;
}

export async function destroySession(c: Context): Promise<void> {
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (sessionId) {
    const db = getDb();
    db.delete(sessions).where(eq(sessions.id, sessionId)).run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

const SESSION_USER_COLUMNS = {
  id: users.id,
  username: users.username,
  email: users.email,
  displayName: users.displayName,
  bio: users.bio,
  role: users.role,
  createdAt: users.createdAt,
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

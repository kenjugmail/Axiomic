import { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { getDb, sessions, users } from "@axiomic/db";
import { eq, and, gt } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { Env } from "../env";

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

export async function getSessionUser(c: Context) {
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (!sessionId) return null;

  const db = getDb();
  const now = new Date().toISOString();

  const result = db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      displayName: users.displayName,
      bio: users.bio,
      createdAt: users.createdAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, now)))
    .get();

  return result || null;
}

export async function requireAuth(c: Context<Env>, next: Next) {
  const user = await getSessionUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("user", user);
  return next();
}

// Sprint 52 — Admin-only middleware. Mirrors requireAuth but also
// checks ctx.user.role === 'admin'. Returns 403 otherwise.
import type { Context, Next } from "hono";
import type { Env } from "../env";
import { getSessionUser } from "./auth";

export async function requireAdmin(c: Context<Env>, next: Next) {
  const user = await getSessionUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (user.role !== "admin") {
    return c.json({ error: "Admin role required" }, 403);
  }
  c.set("user", user);
  return next();
}

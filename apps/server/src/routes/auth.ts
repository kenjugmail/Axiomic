import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb, users } from "@axiomic/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createSession, destroySession, getSessionUser } from "../middleware/auth";

const auth = new Hono();

const signupSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/),
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

auth.post("/signup", zValidator("json", signupSchema), async (c) => {
  const { username, email, password, displayName } = c.req.valid("json");
  const db = getDb();

  // Check if user exists
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
  }).run();

  await createSession(c, userId);

  return c.json({
    user: { id: userId, username, email, displayName: displayName || username },
  }, 201);
});

auth.post("/login", zValidator("json", loginSchema), async (c) => {
  const { email, password } = c.req.valid("json");
  const db = getDb();

  const user = db.select().from(users).where(eq(users.email, email)).get();
  if (!user) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const valid = await Bun.password.verify(password, user.passwordHash, "bcrypt");
  if (!valid) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  await createSession(c, user.id);

  return c.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
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

export { auth };

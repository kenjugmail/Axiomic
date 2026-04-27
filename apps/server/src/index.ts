import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { auth } from "./routes/auth";

type Variables = {
  user: {
    id: string;
    username: string;
    email: string;
    displayName: string | null;
    bio: string | null;
    createdAt: string;
  } | null;
};

const app = new Hono<{ Variables: Variables }>().basePath("/api/v1");

app.use("*", cors({ origin: "http://localhost:5173", credentials: true }));
app.use("*", logger());

app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));
app.get("/ready", (c) => c.json({ status: "ready" }));

app.route("/auth", auth);

const port = parseInt(process.env.PORT || "3000");
console.log(`Axiomic server starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};

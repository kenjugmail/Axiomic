import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import pino from "pino";

const log = pino({ transport: { target: "pino-pretty" } });

const app = new Hono().basePath("/api/v1");

app.use("*", cors({ origin: "http://localhost:5173", credentials: true }));
app.use("*", logger());

app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));
app.get("/ready", (c) => c.json({ status: "ready" }));

const port = parseInt(process.env.PORT || "3000");
log.info(`Axiomic server starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};

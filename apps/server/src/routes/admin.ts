// Sprint 50 — Admin operations.
//
// v1 surface for operators to inspect + manually trigger backend
// jobs. Auth-gated via the bootstrap-admin envelope: a signed-in
// user matching env.BOOTSTRAP_ADMIN_USERNAME, or any signed-in user
// when the env var is unset (placeholder until S14's role system
// lands). Production deploys SHOULD set BOOTSTRAP_ADMIN_USERNAME.

import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { env } from "../lib/envConfig";
import {
  getLastBuildStats,
  getSearchIndex,
  invalidateSearchIndex,
} from "../lib/searchIndex";
import type { Env } from "../env";

export const adminRouter = new Hono<Env>();

function isAdmin(username: string): boolean {
  if (!env.BOOTSTRAP_ADMIN_USERNAME) return true; // open in v1 if unset
  return username === env.BOOTSTRAP_ADMIN_USERNAME;
}

adminRouter.get("/search-stats", requireAuth, async (c) => {
  const user = c.get("user")!;
  if (!isAdmin(user.username)) return c.json({ error: "Forbidden" }, 403);
  return c.json({
    lastBuild: getLastBuildStats(),
  });
});

adminRouter.post("/reindex", requireAuth, async (c) => {
  const user = c.get("user")!;
  if (!isAdmin(user.username)) return c.json({ error: "Forbidden" }, 403);

  invalidateSearchIndex();
  const t0 = performance.now();
  const items = await getSearchIndex();
  const durationMs = Math.round(performance.now() - t0);
  return c.json({
    rebuilt: true,
    durationMs,
    itemCount: items.length,
  });
});

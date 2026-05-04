import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { scoreQuery } from "../lib/searchIndex";
import type { Env } from "../env";

export const searchRouter = new Hono<Env>();

const querySchema = z.object({
  q: z.string().optional().default(""),
  limit: z
    .string()
    .optional()
    .transform((v) => Math.min(20, Math.max(1, parseInt(v ?? "12", 10) || 12))),
});

searchRouter.get("/", zValidator("query", querySchema), async (c) => {
  const { q, limit } = c.req.valid("query");
  const trimmed = q.trim();
  if (!trimmed) {
    return c.json({ query: "", results: [] });
  }

  const scored = await scoreQuery(trimmed, limit);

  const results = scored.map((s) => {
    const base = {
      id: s.item.id,
      slug: s.item.slug,
      title: s.item.title,
      snippet: s.item.snippet.slice(0, 180),
      score: Math.round(s.score * 1000) / 1000,
      matchedBy: s.matchedBy,
    };
    if (s.item.kind === "page") {
      return {
        kind: "page" as const,
        ...base,
        category: s.item.category,
      };
    }
    return {
      kind: "topic" as const,
      ...base,
      postType: s.item.postType,
    };
  });

  return c.json({ query: trimmed, results });
});

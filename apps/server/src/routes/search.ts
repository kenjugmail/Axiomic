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
  // Sprint 25 — comma-separated kind filter, e.g. ?kind=research or
  // ?kind=research,news. Empty / unset returns all kinds.
  kind: z.string().optional(),
});

searchRouter.get("/", zValidator("query", querySchema), async (c) => {
  const { q, limit, kind } = c.req.valid("query");
  const trimmed = q.trim();
  if (!trimmed) {
    return c.json({ query: "", results: [] });
  }

  const wanted = kind
    ? new Set(
        kind
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      )
    : null;

  // Pull a wider candidate set when filtering so the top-N after the
  // filter still contains `limit` items.
  const candidateLimit = wanted ? Math.max(limit * 4, 40) : limit;
  const scored = await scoreQuery(trimmed, candidateLimit);

  const filtered = wanted
    ? scored.filter((s) => wanted.has(s.item.kind))
    : scored;

  const results = filtered.slice(0, limit).map((s) => {
    const base = {
      id: s.item.id,
      slug: s.item.slug,
      title: s.item.title,
      snippet: s.item.snippet.slice(0, 180),
      score: Math.round(s.score * 1000) / 1000,
      matchedBy: s.matchedBy,
    };
    if (s.item.kind === "page") {
      return { kind: "page" as const, ...base, category: s.item.category };
    }
    if (s.item.kind === "lesson") {
      return {
        kind: "lesson" as const,
        ...base,
        pathSlug: s.item.pathSlug,
        nodeSlug: s.item.nodeSlug,
      };
    }
    if (s.item.kind === "news") {
      return { kind: "news" as const, ...base };
    }
    if (s.item.kind === "research") {
      return { kind: "research" as const, ...base, format: s.item.format };
    }
    return { kind: "topic" as const, ...base, postType: s.item.postType };
  });

  return c.json({ query: trimmed, results });
});

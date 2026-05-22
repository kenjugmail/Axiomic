// Sprint 17 — Concept preview endpoint.
//
// Returns a compact payload for hover cards rendered anywhere a wiki
// concept is referenced via the `[[slug]]` link syntax. The payload
// is a strict subset of /wiki/:slug — just enough to render the card
// without committing the user to a navigation.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, count, desc, sql } from "drizzle-orm";
import {
  getDb,
  wikiPages,
  pageVersions,
  forumTopics,
  userProgress,
  masteryNodes,
  masteryPaths,
} from "@axiomic/db";
import { getSessionUser } from "../middleware/auth";
import { nodesForWikiSlug } from "../lib/crossLinks";
import type { Env } from "../env";

export const conceptsRouter = new Hono<Env>();

// Pull the first non-empty paragraph from a markdown body, stripped of
// directives and headings. Used as the one-line definition.
function firstParagraph(markdown: string, max = 220): string {
  if (!markdown) return "";
  const paragraphs = markdown
    .replace(/^---[\s\S]*?---\n?/, "") // YAML front-matter
    .replace(/<!--[\s\S]*?-->/g, "")
    .split(/\n\s*\n/);
  for (const raw of paragraphs) {
    const cleaned = raw
      .replace(/^#{1,6}\s+.*$/gm, "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/:::[\s\S]*?:::/g, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, _slug, label) => label || _slug)
      .replace(/[*_`>~]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length > 20) {
      return cleaned.length > max ? cleaned.slice(0, max - 1) + "…" : cleaned;
    }
  }
  return "";
}

conceptsRouter.get("/:slug/preview", async (c) => {
  const slug = c.req.param("slug")!;
  const db = getDb();
  const session = await getSessionUser(c);

  const page = db
    .select({
      id: wikiPages.id,
      slug: wikiPages.slug,
      title: wikiPages.title,
      category: wikiPages.category,
      currentVersion: wikiPages.currentVersion,
    })
    .from(wikiPages)
    .where(eq(wikiPages.slug, slug))
    .get();
  if (!page) return c.json({ error: "Concept not found" }, 404);

  const version = db
    .select({
      contentIntro: pageVersions.contentIntro,
      contentUndergrad: pageVersions.contentUndergrad,
      contentGrad: pageVersions.contentGrad,
    })
    .from(pageVersions)
    .where(
      and(
        eq(pageVersions.pageId, page.id),
        eq(pageVersions.version, page.currentVersion),
      ),
    )
    .get();

  const oneLineDef = firstParagraph(version?.contentIntro ?? "");

  // Forum thread count tagged to this page (no user filtering — public
  // count for the badge).
  const threadRow = db
    .select({ n: count() })
    .from(forumTopics)
    .where(eq(forumTopics.wikiPageId, page.id))
    .get();
  const threadCount = Number(threadRow?.n ?? 0);

  // Pick the first / best mastery node teaching this concept — used
  // for the "Practice this" CTA inside the card. nodesForWikiSlug
  // already returns ordered results.
  const linkedNodes = nodesForWikiSlug(slug, 1);
  const nodeRef = linkedNodes[0] ?? null;

  // Per-user mastery: progress on the first linked node, when signed
  // in. Cheap heuristic — full mastery breakdown lives on the path
  // page.
  let masteryStatus: "not_started" | "in_progress" | "completed" | null = null;
  if (session && nodeRef) {
    const progress = db
      .select({
        completed: userProgress.completed,
        quizScore: userProgress.quizScore,
      })
      .from(userProgress)
      .where(
        and(
          eq(userProgress.userId, session.id),
          eq(userProgress.nodeId, nodeRef.nodeId),
        ),
      )
      .get();
    if (!progress) masteryStatus = "not_started";
    else if (progress.completed) masteryStatus = "completed";
    else if (progress.quizScore != null) masteryStatus = "in_progress";
    else masteryStatus = "not_started";
  }

  return c.json({
    slug: page.slug,
    title: page.title,
    category: page.category,
    oneLineDef,
    threadCount,
    nodeRef,
    masteryStatus,
  });
});

// Suppress unused-import warning for desc (kept for future
// enrichment — e.g., recent forum activity timestamp).
void desc;

// ---- Cross-path concept search ---------------------------------------
//
// Lightweight keyword scan across mastery_nodes joined to mastery_paths.
// Unlike the embeddings-backed /search route, this needs no AI provider
// — pure SQL LIKE — so it's fast + dependency-free + always available.
// Returns hits grouped by path so the UI can show "this concept appears
// in 4 paths" naturally.
//
// Scoring: node-title match (3) > lesson slide-title match (2) >
// node-description or lesson-body match (1). Per node we report the
// highest-scoring location it matched.

const searchSchema = z.object({
  q: z.string().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(200).default(80),
});

type MatchKind = "node-title" | "node-description" | "lesson-title" | "lesson-body" | "path-title";

interface SlideShape {
  kind?: string;
  title?: string;
  body?: string;
  question?: { question?: string };
}

function lowerIncludes(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle);
}

function makeSnippet(text: string, needle: string, windowChars = 120): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(needle);
  if (idx < 0) return text.slice(0, windowChars);
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + needle.length + windowChars - 40);
  let s = text.slice(start, end);
  if (start > 0) s = "…" + s;
  if (end < text.length) s = s + "…";
  return s;
}

function searchLesson(lessonJson: string, needle: string): { matchedIn: MatchKind; snippet: string; score: number } | null {
  let parsed: { slides?: SlideShape[] };
  try {
    parsed = JSON.parse(lessonJson) as { slides?: SlideShape[] };
  } catch {
    return null;
  }
  const slides = parsed.slides ?? [];
  for (const s of slides) {
    if (lowerIncludes(s.title, needle)) {
      return { matchedIn: "lesson-title", snippet: s.title ?? "", score: 2 };
    }
    if (lowerIncludes(s.question?.question, needle)) {
      return { matchedIn: "lesson-title", snippet: s.question?.question ?? "", score: 2 };
    }
  }
  for (const s of slides) {
    if (lowerIncludes(s.body, needle)) {
      return { matchedIn: "lesson-body", snippet: makeSnippet(s.body ?? "", needle), score: 1 };
    }
  }
  return null;
}

conceptsRouter.get("/search", zValidator("query", searchSchema), (c) => {
  const { q, limit } = c.req.valid("query");
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) {
    return c.json({ query: q, groups: [], totalHits: 0 });
  }
  const pattern = `%${needle}%`;
  const db = getDb();

  const rows = db
    .select({
      nodeId: masteryNodes.id,
      nodeSlug: masteryNodes.slug,
      nodeTitle: masteryNodes.title,
      nodeDescription: masteryNodes.description,
      nodeOrder: masteryNodes.order,
      lessonData: masteryNodes.lessonData,
      pathSlug: masteryPaths.slug,
      pathTitle: masteryPaths.title,
    })
    .from(masteryNodes)
    .innerJoin(masteryPaths, eq(masteryNodes.pathId, masteryPaths.id))
    .where(
      sql`lower(${masteryNodes.title}) LIKE ${pattern} OR lower(${masteryNodes.description}) LIKE ${pattern} OR (${masteryNodes.lessonData} IS NOT NULL AND lower(${masteryNodes.lessonData}) LIKE ${pattern}) OR lower(${masteryPaths.title}) LIKE ${pattern}`,
    )
    .limit(500)
    .all();

  interface ConceptHit {
    pathSlug: string;
    pathTitle: string;
    nodeSlug: string;
    nodeTitle: string;
    nodeDescription: string;
    nodeOrder: number;
    matchedIn: MatchKind;
    snippet: string;
    score: number;
  }

  const hits: ConceptHit[] = [];
  for (const row of rows) {
    let matchedIn: MatchKind | null = null;
    let snippet = "";
    let score = 0;
    if (lowerIncludes(row.nodeTitle, needle)) {
      matchedIn = "node-title";
      snippet = row.nodeTitle ?? "";
      score = 3;
    } else if (lowerIncludes(row.nodeDescription, needle)) {
      matchedIn = "node-description";
      snippet = makeSnippet(row.nodeDescription ?? "", needle);
      score = 1;
    } else if (row.lessonData) {
      const found = searchLesson(row.lessonData, needle);
      if (found) {
        matchedIn = found.matchedIn;
        snippet = found.snippet;
        score = found.score;
      }
    }
    if (matchedIn === null && lowerIncludes(row.pathTitle, needle)) {
      matchedIn = "path-title";
      snippet = row.nodeDescription ?? row.nodeTitle ?? "";
      score = 0.5;
    }
    if (matchedIn === null) continue;
    hits.push({
      pathSlug: row.pathSlug,
      pathTitle: row.pathTitle,
      nodeSlug: row.nodeSlug,
      nodeTitle: row.nodeTitle,
      nodeDescription: row.nodeDescription ?? "",
      nodeOrder: row.nodeOrder ?? 0,
      matchedIn,
      snippet,
      score,
    });
  }

  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.pathTitle !== b.pathTitle) return a.pathTitle.localeCompare(b.pathTitle);
    return a.nodeOrder - b.nodeOrder;
  });
  const trimmed = hits.slice(0, limit);

  interface ConceptGroup {
    pathSlug: string;
    pathTitle: string;
    topScore: number;
    hits: Array<Omit<ConceptHit, "pathSlug" | "pathTitle">>;
  }
  const byPath = new Map<string, ConceptGroup>();
  for (const h of trimmed) {
    const existing = byPath.get(h.pathSlug) ?? {
      pathSlug: h.pathSlug,
      pathTitle: h.pathTitle,
      topScore: 0,
      hits: [],
    };
    existing.hits.push({
      nodeSlug: h.nodeSlug,
      nodeTitle: h.nodeTitle,
      nodeDescription: h.nodeDescription,
      nodeOrder: h.nodeOrder,
      matchedIn: h.matchedIn,
      snippet: h.snippet,
      score: h.score,
    });
    if (h.score > existing.topScore) existing.topScore = h.score;
    byPath.set(h.pathSlug, existing);
  }

  const groups = Array.from(byPath.values()).sort((a, b) => b.topScore - a.topScore);
  return c.json({ query: q, groups, totalHits: trimmed.length });
});

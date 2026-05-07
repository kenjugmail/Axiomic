// Sprint 17 — Concept preview endpoint.
//
// Returns a compact payload for hover cards rendered anywhere a wiki
// concept is referenced via the `[[slug]]` link syntax. The payload
// is a strict subset of /wiki/:slug — just enough to render the card
// without committing the user to a navigation.

import { Hono } from "hono";
import { eq, and, count, desc } from "drizzle-orm";
import {
  getDb,
  wikiPages,
  pageVersions,
  forumTopics,
  userProgress,
  masteryNodes,
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

// Suppress unused-import warning for desc + masteryNodes (kept for
// future enrichment — e.g., recent forum activity timestamp).
void desc;
void masteryNodes;

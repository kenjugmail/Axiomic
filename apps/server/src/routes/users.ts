// Sprint 31 — Public-portfolio aggregator.
//
// Mounted at /api/v1/users/:username/portfolio. Returns a single
// payload assembling the strongest-evidence content the user has
// produced across surfaces (capstone artifacts, research papers,
// authored wiki pages, reproductions count).

import { Hono } from "hono";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  capstoneEnrollments,
  capstones,
  getDb,
  pageVersions,
  researchPapers,
  reproductions,
  users,
  wikiPages,
} from "@axiomic/db";
import type { Env } from "../env";
import type { PortfolioEntry } from "@axiomic/types";

export const usersRouter = new Hono<Env>();

usersRouter.get("/:username/portfolio", async (c) => {
  const username = c.req.param("username")!;
  const db = getDb();

  const user = db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
    })
    .from(users)
    .where(eq(users.username, username))
    .get();
  if (!user) return c.json({ error: "User not found" }, 404);

  const entries: PortfolioEntry[] = [];

  // Completed capstones — ordered most-recent first.
  const enrollments = db
    .select({
      capstoneId: capstoneEnrollments.capstoneId,
      capstoneSlug: capstones.slug,
      capstoneTitle: capstones.title,
      coverEmoji: capstones.coverEmoji,
      accentColor: capstones.accentColor,
      artifactPageSlug: capstoneEnrollments.artifactPageSlug,
      completedAt: capstoneEnrollments.completedAt,
    })
    .from(capstoneEnrollments)
    .innerJoin(capstones, eq(capstoneEnrollments.capstoneId, capstones.id))
    .where(
      and(
        eq(capstoneEnrollments.userId, user.id),
        isNotNull(capstoneEnrollments.completedAt),
      ),
    )
    .orderBy(desc(capstoneEnrollments.completedAt))
    .all();
  for (const e of enrollments) {
    if (!e.artifactPageSlug || !e.completedAt) continue;
    entries.push({
      kind: "capstone",
      capstoneSlug: e.capstoneSlug,
      capstoneTitle: e.capstoneTitle,
      artifactPageSlug: e.artifactPageSlug,
      completedAt: e.completedAt,
      coverEmoji: e.coverEmoji,
      accentColor: e.accentColor as PortfolioEntry extends { accentColor: infer A } ? A : never,
    });
  }

  // Published research papers.
  const papers = db
    .select({
      slug: researchPapers.slug,
      title: researchPapers.title,
      summary: researchPapers.summary,
      format: researchPapers.format,
      createdAt: researchPapers.createdAt,
    })
    .from(researchPapers)
    .where(
      and(
        eq(researchPapers.authorId, user.id),
        eq(researchPapers.status, "published"),
      ),
    )
    .orderBy(desc(researchPapers.createdAt))
    .all();
  for (const p of papers) {
    entries.push({
      kind: "research",
      slug: p.slug,
      title: p.title,
      summary: p.summary,
      format: p.format as PortfolioEntry extends { format: infer F } ? F : never,
      publishedAt: p.createdAt,
    });
  }

  // Wiki pages where this user authored at least one version. Counts
  // come from a single GROUP BY across pageVersions instead of N+1
  // lookups per page.
  const authoredRows = db
    .select({
      pageId: wikiPages.id,
      slug: wikiPages.slug,
      title: wikiPages.title,
    })
    .from(pageVersions)
    .innerJoin(wikiPages, eq(pageVersions.pageId, wikiPages.id))
    .where(eq(pageVersions.editedBy, user.id))
    .groupBy(wikiPages.id)
    .all();
  if (authoredRows.length > 0) {
    const pageIds = authoredRows.map((r) => r.pageId);
    const totals = db
      .select({
        pageId: pageVersions.pageId,
        total: sql<number>`COUNT(*)`,
        mine: sql<number>`SUM(CASE WHEN ${pageVersions.editedBy} = ${user.id} THEN 1 ELSE 0 END)`,
      })
      .from(pageVersions)
      .where(inArray(pageVersions.pageId, pageIds))
      .groupBy(pageVersions.pageId)
      .all();
    const byPage = new Map(
      totals.map((t) => [
        t.pageId,
        { total: Number(t.total), mine: Number(t.mine) },
      ]),
    );
    for (const w of authoredRows) {
      const counts = byPage.get(w.pageId);
      const fraction =
        counts && counts.total > 0 ? counts.mine / counts.total : 0;
      entries.push({
        kind: "wiki",
        slug: w.slug,
        title: w.title,
        authoredFraction: fraction,
      });
    }
  }

  // Total reproductions contributed.
  const repros = db
    .select({ id: reproductions.id })
    .from(reproductions)
    .where(eq(reproductions.reproducerId, user.id))
    .all();
  if (repros.length > 0) {
    entries.push({ kind: "reproduction", count: repros.length });
  }

  return c.json({ username: user.username, entries });
});

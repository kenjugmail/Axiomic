// Sprint 72 — Author profile aggregator.
//
// /authors/:username consolidates:
//   - internal research papers authored by the user (published only)
//   - external papers the user has claimed via ORCID auto-match or
//     admin-verified manual claim
//   - recent BlueSky posts from the user that referenced any paper
//
// The response is shaped so the UI can render a single "everything
// this researcher has done" view without N+1 calls.

import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import {
  externalPaperAuthorships,
  externalPapers,
  getDb,
  researchPapers,
  socialPosts,
  users,
} from "@axiomic/db";
import type { Env } from "../env";

export const authorsRouter = new Hono<Env>();

interface ExternalAuthorshipPayload {
  externalPaperId: string;
  ordinal: number;
  verifiedVia: string;
  verifiedAt: string;
  paper: {
    title: string;
    source: string;
    sourceId: string;
    venue: string | null;
    publishedAt: string | null;
    htmlUrl: string | null;
    citationCount: number;
  };
}

interface SocialPostPayload {
  id: string;
  source: string;
  text: string;
  url: string;
  postedAt: string | null;
  // The local externalPaper.id when we resolved the reference; null
  // when the referenced paper isn't in our corpus yet.
  referencedPaperId: string | null;
  referencedSource: string | null;
  referencedSourceId: string | null;
}

authorsRouter.get("/:username", async (c) => {
  const username = c.req.param("username");
  if (!username) return c.json({ error: "Missing username" }, 400);
  const db = getDb();
  const user = db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      bio: users.bio,
      orcid: users.orcid,
      scholarUrl: users.scholarUrl,
      blueskyHandle: users.blueskyHandle,
      institution: users.institution,
      hIndex: users.hIndex,
    })
    .from(users)
    .where(eq(users.username, username))
    .get();
  if (!user) return c.json({ error: "Not found" }, 404);

  // Internal published papers by this user.
  const internal = db
    .select({
      id: researchPapers.id,
      slug: researchPapers.slug,
      title: researchPapers.title,
      summary: researchPapers.summary,
      format: researchPapers.format,
      tags: researchPapers.tags,
      citationCount: researchPapers.citationCount,
      createdAt: researchPapers.createdAt,
    })
    .from(researchPapers)
    .where(eq(researchPapers.authorId, user.id))
    .orderBy(desc(researchPapers.createdAt))
    .all();

  const safeTagsJson = (s: string): string[] => {
    try {
      const arr = JSON.parse(s ?? "[]");
      return Array.isArray(arr)
        ? arr.filter((x): x is string => typeof x === "string")
        : [];
    } catch {
      return [];
    }
  };

  // Claimed external authorships joined to the upstream paper row.
  const claimedRows = db
    .select({
      authorship: externalPaperAuthorships,
      paper: externalPapers,
    })
    .from(externalPaperAuthorships)
    .innerJoin(
      externalPapers,
      eq(externalPaperAuthorships.externalPaperId, externalPapers.id),
    )
    .where(eq(externalPaperAuthorships.userId, user.id))
    .all();
  const claimed: ExternalAuthorshipPayload[] = claimedRows.map((r) => ({
    externalPaperId: r.paper.id,
    ordinal: r.authorship.ordinal,
    verifiedVia: r.authorship.verifiedVia,
    verifiedAt: r.authorship.verifiedAt,
    paper: {
      title: r.paper.title,
      source: r.paper.source,
      sourceId: r.paper.sourceId,
      venue: r.paper.venue,
      publishedAt: r.paper.publishedAt,
      htmlUrl: r.paper.htmlUrl,
      citationCount: r.paper.citationCount ?? 0,
    },
  }));
  // Sort claimed by paper publishedAt desc (nulls last).
  claimed.sort((a, b) => {
    const ap = a.paper.publishedAt ? Date.parse(a.paper.publishedAt) : 0;
    const bp = b.paper.publishedAt ? Date.parse(b.paper.publishedAt) : 0;
    return bp - ap;
  });

  // Recent BlueSky posts mentioning papers, scoped to this user.
  const postsRows = db
    .select()
    .from(socialPosts)
    .where(eq(socialPosts.userId, user.id))
    .orderBy(desc(socialPosts.postedAt))
    .limit(20)
    .all();
  const posts: SocialPostPayload[] = postsRows.map((p) => ({
    id: p.id,
    source: p.source,
    text: p.text,
    url: p.url,
    postedAt: p.postedAt,
    referencedPaperId: p.referencedPaperId,
    referencedSource: p.referencedSource,
    referencedSourceId: p.referencedSourceId,
  }));

  return c.json({
    user: {
      ...user,
      // hIndex defaults to null for non-set; clients render "—".
      hIndex: user.hIndex ?? null,
    },
    papers: {
      internal: internal.map((p) => ({
        ...p,
        tags: safeTagsJson(p.tags ?? "[]"),
      })),
      external: claimed,
    },
    socialPosts: posts,
  });
});

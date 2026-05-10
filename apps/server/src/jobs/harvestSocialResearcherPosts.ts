// Sprint 72 — Harvest BlueSky posts from researchers who've claimed
// their handle in `users.blueskyHandle`. Runs every 4h. For each
// post that references a paper (DOI/arXiv), upsert into
// `social_posts` and try to resolve `referencedPaperId` against
// the local externalPapers table by DOI or by source/sourceId.

import { randomUUID } from "crypto";
import { and, eq, isNotNull } from "drizzle-orm";
import {
  externalPapers,
  getDb,
  socialPosts,
  users,
} from "@axiomic/db";
import { fetchResearcherPosts } from "../lib/external/blueskyClient";
import type { ExtractedRef } from "../lib/external/extractPaperRefs";
import type { JobDefinition } from "../lib/jobs";

interface ResearcherTarget {
  userId: string;
  handle: string;
}

function activeBlueskyResearchers(): ResearcherTarget[] {
  const db = getDb();
  const rows = db
    .select({ id: users.id, handle: users.blueskyHandle })
    .from(users)
    .where(isNotNull(users.blueskyHandle))
    .all();
  const out: ResearcherTarget[] = [];
  for (const r of rows) {
    const h = (r.handle ?? "").trim().replace(/^@/, "");
    if (h.length > 0) out.push({ userId: r.id, handle: h });
  }
  return out;
}

function findReferencedPaperId(
  ref: ExtractedRef,
): { paperId: string; source: string; sourceId: string } | null {
  const db = getDb();
  if (ref.source === "doi") {
    const row = db
      .select({
        id: externalPapers.id,
        source: externalPapers.source,
        sourceId: externalPapers.sourceId,
      })
      .from(externalPapers)
      .where(eq(externalPapers.doi, ref.sourceId))
      .get();
    if (row) {
      return { paperId: row.id, source: row.source, sourceId: row.sourceId };
    }
    return null;
  }
  // arXiv: source matches "arxiv" + sourceId is the bare paper id.
  const row = db
    .select({
      id: externalPapers.id,
      source: externalPapers.source,
      sourceId: externalPapers.sourceId,
    })
    .from(externalPapers)
    .where(
      and(
        eq(externalPapers.source, "arxiv"),
        eq(externalPapers.sourceId, ref.sourceId),
      ),
    )
    .get();
  if (row) {
    return { paperId: row.id, source: row.source, sourceId: row.sourceId };
  }
  return null;
}

export const harvestSocialResearcherPostsJob: JobDefinition = {
  name: "harvest_social_researcher_posts",
  intervalMs: 4 * 60 * 60_000, // 4h
  async run() {
    const db = getDb();
    const targets = activeBlueskyResearchers();
    let inserted = 0;

    for (const target of targets) {
      let posts;
      try {
        posts = await fetchResearcherPosts(target.handle);
      } catch (err) {
        // One handle's failure shouldn't kill the job for other
        // researchers. Log + continue.
        console.warn(
          `[bluesky] failed for handle ${target.handle}:`,
          err,
        );
        continue;
      }

      for (const post of posts) {
        // One row per (post, referenced-paper). A post mentioning N
        // papers becomes N rows so the lookup index on
        // referencedPaperId stays useful for the paper-detail
        // "discussed by" rail.
        for (const ref of post.references) {
          const sourceCompositeId = `${post.postId}:${ref.source}:${ref.sourceId}`;
          const existing = db
            .select({ id: socialPosts.id })
            .from(socialPosts)
            .where(
              and(
                eq(socialPosts.source, "bluesky"),
                eq(socialPosts.sourceId, sourceCompositeId),
              ),
            )
            .get();
          if (existing) continue;

          const resolved = findReferencedPaperId(ref);
          try {
            db.insert(socialPosts)
              .values({
                id: randomUUID(),
                source: "bluesky",
                sourceId: sourceCompositeId,
                authorRef: post.authorHandle,
                userId: target.userId,
                text: post.text,
                url: post.url,
                postedAt: post.postedAt,
                referencedSource: resolved?.source ?? ref.source,
                referencedSourceId: resolved?.sourceId ?? ref.sourceId,
                referencedPaperId: resolved?.paperId ?? null,
              })
              .run();
            inserted++;
          } catch (err) {
            console.warn(
              `[bluesky] persist failed for ${sourceCompositeId}:`,
              err,
            );
          }
        }
      }
    }

    return { itemsProcessed: inserted };
  },
};

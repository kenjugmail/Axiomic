// Phase 32C — signed-proof skill-gap analyzer.
//
// Every competitor lets you self-report skills. Axiomic can diff a
// target skill set against what a learner has actually *proven*
// (userSkillIndex — populated only from signed credentials) and
// what they have *mastery progress* on (userProgress via the
// shared node↔slug context), classifying each target skill as:
//
//   proven   — backed by ≥1 signed credential
//   weak     — some mastery progress but no credential yet
//   missing  — no progress, no proof
//
// Reuse-only: userSkillIndex (Phase 30C), prebuildWeaknessContext
// (Phase 22A node→slug map), resolveWikiTitles for display names.
// Pairs with goalPlanner's new kind:'skills' to turn the gap into
// a dependency-ordered path.

import { and, eq, inArray } from "drizzle-orm";
import { getDb, userProgress, userSkillIndex } from "@axiomic/db";
import { prebuildWeaknessContext } from "./studentWeaknesses";
import { resolveWikiTitles } from "./credentialSkills";

export const MASTERY_THRESHOLD = 0.7; // mirrors goalPlanner/knowledgeMri

export interface SkillGap {
  target: string[];
  proven: Array<{
    slug: string;
    title: string;
    proofCount: number;
    latestProofAt: string | null;
  }>;
  weak: Array<{ slug: string; title: string; quizScore: number | null }>;
  missing: Array<{ slug: string; title: string }>;
  // 0..1 — proven / target. A quick "how close are you" headline.
  coverage: number;
}

function cleanSlugs(slugs: string[]): string[] {
  return [
    ...new Set(
      slugs.map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0),
    ),
  ];
}

export function analyzeSkillGap(
  userId: string,
  targetSlugsRaw: string[],
): SkillGap {
  const db = getDb();
  const target = cleanSlugs(targetSlugsRaw);
  if (target.length === 0) {
    return { target, proven: [], weak: [], missing: [], coverage: 0 };
  }

  // 1. Proven — present in the signed-credential skill index.
  const provenRows = db
    .select({
      slug: userSkillIndex.skillSlug,
      title: userSkillIndex.skillTitle,
      proofCount: userSkillIndex.proofCount,
      latestProofAt: userSkillIndex.latestProofAt,
    })
    .from(userSkillIndex)
    .where(
      and(
        eq(userSkillIndex.userId, userId),
        inArray(userSkillIndex.skillSlug, target),
      ),
    )
    .all();
  const provenSet = new Set(provenRows.map((r) => r.slug));

  // 2. For the rest, look at mastery progress via the shared
  //    node↔slug context (the exact primitive goalPlanner uses).
  const rest = target.filter((s) => !provenSet.has(s));
  const ctx = prebuildWeaknessContext();
  const slugToNodeIds = new Map<string, string[]>();
  const titleBySlug = new Map<string, string>();
  for (const [nodeId, slug] of ctx.nodeToSlug) {
    if (!rest.includes(slug)) continue;
    const arr = slugToNodeIds.get(slug) ?? [];
    arr.push(nodeId);
    slugToNodeIds.set(slug, arr);
    if (!titleBySlug.has(slug)) {
      titleBySlug.set(slug, ctx.nodeTitles.get(nodeId) ?? slug);
    }
  }
  // Nicer display names where a wiki page exists.
  const wikiTitles = resolveWikiTitles(rest);
  for (const [slug, t] of wikiTitles) titleBySlug.set(slug, t);

  const allRestNodeIds = [...slugToNodeIds.values()].flat();
  const bestScoreByNode = new Map<string, number | null>();
  if (allRestNodeIds.length > 0) {
    for (const row of db
      .select({
        nodeId: userProgress.nodeId,
        quizScore: userProgress.quizScore,
      })
      .from(userProgress)
      .where(
        and(
          eq(userProgress.userId, userId),
          inArray(userProgress.nodeId, allRestNodeIds),
        ),
      )
      .all()) {
      bestScoreByNode.set(row.nodeId, row.quizScore);
    }
  }

  const weak: SkillGap["weak"] = [];
  const missing: SkillGap["missing"] = [];
  for (const slug of rest) {
    const title = titleBySlug.get(slug) ?? slug;
    const nodeIds = slugToNodeIds.get(slug) ?? [];
    let hasProgress = false;
    let best: number | null = null;
    for (const nid of nodeIds) {
      if (bestScoreByNode.has(nid)) {
        hasProgress = true;
        const q = bestScoreByNode.get(nid) ?? null;
        if (q != null && (best == null || q > best)) best = q;
      }
    }
    if (hasProgress) weak.push({ slug, title, quizScore: best });
    else missing.push({ slug, title });
  }

  return {
    target,
    proven: provenRows.map((r) => ({
      slug: r.slug,
      title: r.title,
      proofCount: r.proofCount,
      latestProofAt: r.latestProofAt,
    })),
    weak,
    missing,
    coverage:
      target.length > 0
        ? Math.round((provenSet.size / target.length) * 100) / 100
        : 0,
  };
}

// Phase 29C — credential → concept/skill mapping.
//
// Pure aggregation over primitives that already exist (no new
// schema — the knowledgeMri.ts "thin aggregator" precedent).
// Each helper is best-effort: a missing/garbled linkage degrades
// to an empty result, never throws, so the wallet stays robust.

import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  getDb,
  masteryPaths,
  newsArticles,
  researchPapers,
  userSkillIndex,
  users,
  wikiPages,
} from "@axiomic/db";

export interface Skill {
  slug: string;
  title: string;
}

export function parseSlugList(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return v.filter((s): s is string => typeof s === "string" && s.length > 0);
  } catch {
    return [];
  }
}

// slug -> human title for wiki concept slugs (capstone prereqs).
export function resolveWikiTitles(slugs: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const uniq = [...new Set(slugs)].filter(Boolean);
  if (uniq.length === 0) return out;
  const rows = getDb()
    .select({ slug: wikiPages.slug, title: wikiPages.title })
    .from(wikiPages)
    .where(inArray(wikiPages.slug, uniq))
    .all();
  for (const r of rows) out.set(r.slug, r.title);
  return out;
}

// mastery-path slug -> title (exam pathSlug).
export function resolvePathTitles(slugs: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const uniq = [...new Set(slugs)].filter(Boolean);
  if (uniq.length === 0) return out;
  const rows = getDb()
    .select({ slug: masteryPaths.slug, title: masteryPaths.title })
    .from(masteryPaths)
    .where(inArray(masteryPaths.slug, uniq))
    .all();
  for (const r of rows) out.set(r.slug, r.title);
  return out;
}

// `${targetKind}:${targetId}` -> tag list, for reproduction
// credentials (the reproduced paper/article's domain tags read
// as the skills demonstrated).
export function fetchTargetTags(
  targets: Array<{ kind: string; id: string }>,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const paperIds = targets
    .filter((t) => t.kind === "research_paper")
    .map((t) => t.id);
  const articleIds = targets
    .filter((t) => t.kind === "news_article")
    .map((t) => t.id);
  if (paperIds.length > 0) {
    const rows = getDb()
      .select({ id: researchPapers.id, tags: researchPapers.tags })
      .from(researchPapers)
      .where(inArray(researchPapers.id, [...new Set(paperIds)]))
      .all();
    for (const r of rows) {
      out.set(`research_paper:${r.id}`, parseSlugList(r.tags));
    }
  }
  if (articleIds.length > 0) {
    const rows = getDb()
      .select({ id: newsArticles.id, tags: newsArticles.tags })
      .from(newsArticles)
      .where(inArray(newsArticles.id, [...new Set(articleIds)]))
      .all();
    for (const r of rows) {
      out.set(`news_article:${r.id}`, parseSlugList(r.tags));
    }
  }
  return out;
}

// Turn a raw slug list into displayable skills, preferring a
// resolved title, falling back to a humanized slug.
export function toSkills(
  slugs: string[],
  titleMap: Map<string, string>,
): Skill[] {
  const seen = new Set<string>();
  const skills: Skill[] = [];
  for (const slug of slugs) {
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    skills.push({
      slug,
      title:
        titleMap.get(slug) ??
        slug.replace(/[-_]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
    });
  }
  return skills;
}

// Phase 30C — keep the denormalized recruiter search index in
// sync from a freshly-built wallet's skills summary. Self-healing
// + idempotent: called best-effort on every wallet build.
// credentialsPublic=false ⇒ the user's rows are deleted so opting
// out removes discoverability. Never throws (caller try/catch too).
export function refreshUserSkillIndex(
  userId: string,
  summary: Array<{
    slug: string;
    skill: string;
    provenBy: Array<{ earnedAt: string }>;
  }>,
): void {
  const db = getDb();
  const pref = db
    .select({ credentialsPublic: users.credentialsPublic })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  if (!pref || pref.credentialsPublic === false) {
    db.delete(userSkillIndex)
      .where(eq(userSkillIndex.userId, userId))
      .run();
    return;
  }

  const wantSlugs = new Set(summary.map((s) => s.slug));
  // Drop rows for skills the user no longer proves.
  const existing = db
    .select({ id: userSkillIndex.id, skillSlug: userSkillIndex.skillSlug })
    .from(userSkillIndex)
    .where(eq(userSkillIndex.userId, userId))
    .all();
  const staleIds = existing
    .filter((r) => !wantSlugs.has(r.skillSlug))
    .map((r) => r.id);
  if (staleIds.length > 0) {
    db.delete(userSkillIndex)
      .where(inArray(userSkillIndex.id, staleIds))
      .run();
  }

  for (const s of summary) {
    const latest = s.provenBy.reduce<string | null>(
      (mx, p) => (mx == null || p.earnedAt > mx ? p.earnedAt : mx),
      null,
    );
    db.insert(userSkillIndex)
      .values({
        id: randomUUID(),
        userId,
        skillSlug: s.slug,
        skillTitle: s.skill,
        proofCount: s.provenBy.length,
        latestProofAt: latest,
      })
      .onConflictDoUpdate({
        target: [userSkillIndex.userId, userSkillIndex.skillSlug],
        set: {
          skillTitle: s.skill,
          proofCount: s.provenBy.length,
          latestProofAt: latest,
        },
      })
      .run();
  }
}

void and;

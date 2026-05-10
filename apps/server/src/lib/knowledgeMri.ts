// Sprint 33 — Knowledge MRI aggregator.
//
// Composes existing tables — masteryPaths, masteryNodes, userProgress,
// misconceptionDiagnoses, quizMistakes, flashcards, flashcardReviews —
// into a single concept-level diagnostic snapshot. No new schema; the
// MRI is purely a thin aggregator on top of substrate that already
// exists.
//
// Shape returned matches packages/types/src/index.ts: `KnowledgeMri`.

import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import {
  flashcardReviews,
  flashcards,
  getDb,
  masteryNodes,
  masteryPaths,
  misconceptionDiagnoses,
  quizMistakes,
  userProgress,
  wikiPages,
} from "@axiomic/db";
import type {
  KnowledgeMri,
  KnowledgeMriNode,
  KnowledgeMriPath,
} from "@axiomic/types";

const MASTERY_THRESHOLD = 0.7;
const HEAT_WINDOW_DAYS = 30;

interface NodeRaw {
  id: string;
  slug: string;
  title: string;
  level: string;
  pathId: string;
  pageIds: string;
  prerequisiteNodeIds: string;
  order: number | null;
}

export async function buildKnowledgeMri(userId: string): Promise<KnowledgeMri> {
  const db = getDb();

  const paths = db
    .select({
      id: masteryPaths.id,
      slug: masteryPaths.slug,
      title: masteryPaths.title,
    })
    .from(masteryPaths)
    .all();

  const allNodes = db
    .select({
      id: masteryNodes.id,
      slug: masteryNodes.slug,
      title: masteryNodes.title,
      level: masteryNodes.level,
      pathId: masteryNodes.pathId,
      pageIds: masteryNodes.pageIds,
      prerequisiteNodeIds: masteryNodes.prerequisiteNodeIds,
      order: masteryNodes.order,
    })
    .from(masteryNodes)
    .all() as NodeRaw[];

  if (paths.length === 0 || allNodes.length === 0) {
    return {
      paths: [],
      overall: {
        mastered: 0,
        inProgress: 0,
        untouched: 0,
        activeDiagnoses: 0,
        hottestPath: null,
      },
    };
  }

  // Bulk pulls keyed on userId so we hit each table once.
  const progressRows = db
    .select()
    .from(userProgress)
    .where(eq(userProgress.userId, userId))
    .all();
  const progressByNode = new Map(progressRows.map((p) => [p.nodeId, p]));

  const diagnoses = db
    .select({
      id: misconceptionDiagnoses.id,
      conceptSlug: misconceptionDiagnoses.conceptSlug,
      misconceptionKey: misconceptionDiagnoses.misconceptionKey,
      label: misconceptionDiagnoses.label,
      status: misconceptionDiagnoses.status,
      confidence: misconceptionDiagnoses.confidence,
    })
    .from(misconceptionDiagnoses)
    .where(eq(misconceptionDiagnoses.userId, userId))
    .all();
  const activeDiagnoses = diagnoses.filter(
    (d) => d.status === "active" || d.status === "coached",
  );
  // Group by conceptSlug for fast lookup per node.
  const diagnosesBySlug = new Map<string, typeof activeDiagnoses>();
  for (const d of activeDiagnoses) {
    const list = diagnosesBySlug.get(d.conceptSlug) ?? [];
    list.push(d);
    diagnosesBySlug.set(d.conceptSlug, list);
  }

  const mistakes = db
    .select({
      nodeId: quizMistakes.nodeId,
      occurrences: quizMistakes.occurrences,
    })
    .from(quizMistakes)
    .where(
      and(eq(quizMistakes.userId, userId), isNull(quizMistakes.resolvedAt)),
    )
    .all();
  const mistakesByNode = new Map<string, number>();
  for (const m of mistakes) {
    mistakesByNode.set(
      m.nodeId,
      (mistakesByNode.get(m.nodeId) ?? 0) + (m.occurrences ?? 1),
    );
  }

  // Flashcard retention by page slug. We average the SM-2 rating over
  // the last 30 days of reviews for each card, then aggregate by the
  // card's pageSlug.
  const since = new Date(
    Date.now() - HEAT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const recentReviews = db
    .select({
      cardId: flashcardReviews.cardId,
      rating: flashcardReviews.rating,
      pageSlug: flashcards.pageSlug,
    })
    .from(flashcardReviews)
    .innerJoin(flashcards, eq(flashcardReviews.cardId, flashcards.id))
    .where(
      and(
        eq(flashcardReviews.userId, userId),
        gte(flashcardReviews.reviewedAt, since),
      ),
    )
    .all();
  const retentionBySlug = new Map<string, { sum: number; n: number }>();
  for (const r of recentReviews) {
    const cur = retentionBySlug.get(r.pageSlug) ?? { sum: 0, n: 0 };
    cur.sum += r.rating;
    cur.n += 1;
    retentionBySlug.set(r.pageSlug, cur);
  }

  // Wiki titles for a friendly conceptTitle on each node — a node has
  // multiple wiki page slugs, but we surface its first one as the
  // primary concept reference.
  const allSlugs = new Set<string>();
  for (const n of allNodes) {
    try {
      const slugs: unknown = JSON.parse(n.pageIds);
      if (Array.isArray(slugs)) {
        for (const s of slugs) if (typeof s === "string") allSlugs.add(s);
      }
    } catch {}
  }
  const wikiTitles = allSlugs.size
    ? db
        .select({ slug: wikiPages.slug, title: wikiPages.title })
        .from(wikiPages)
        .where(inArray(wikiPages.slug, [...allSlugs]))
        .all()
    : [];
  const titleBySlug = new Map(wikiTitles.map((w) => [w.slug, w.title]));

  const nodesByPath = new Map<string, NodeRaw[]>();
  for (const n of allNodes) {
    const list = nodesByPath.get(n.pathId) ?? [];
    list.push(n);
    nodesByPath.set(n.pathId, list);
  }

  let totalMastered = 0;
  let totalInProgress = 0;
  let totalUntouched = 0;
  const totalActiveDiagnoses = activeDiagnoses.length;

  const builtPaths: KnowledgeMriPath[] = [];
  for (const path of paths) {
    const nodes = nodesByPath.get(path.id) ?? [];
    nodes.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    let pathMastered = 0;
    let pathInProgress = 0;
    let pathUntouched = 0;
    let scoreSum = 0;
    let scoreCount = 0;
    let pathDiagnoses = 0;

    const builtNodes: KnowledgeMriNode[] = nodes.map((n) => {
      let pageSlugs: string[] = [];
      try {
        const parsed = JSON.parse(n.pageIds);
        if (Array.isArray(parsed)) {
          pageSlugs = parsed.filter(
            (s): s is string => typeof s === "string",
          );
        }
      } catch {}
      const primarySlug = pageSlugs[0] ?? null;

      const progress = progressByNode.get(n.id);
      const quizScore = progress?.quizScore ?? null;
      let status: "mastered" | "in_progress" | "untouched" = "untouched";
      if (quizScore != null && quizScore >= MASTERY_THRESHOLD) {
        status = "mastered";
      } else if (progress) {
        status = "in_progress";
      }
      if (status === "mastered") pathMastered++;
      else if (status === "in_progress") pathInProgress++;
      else pathUntouched++;

      if (quizScore != null) {
        scoreSum += quizScore;
        scoreCount++;
      }

      // Aggregate diagnoses across every wiki slug this node references.
      let nodeDiagCount = 0;
      for (const slug of pageSlugs) {
        nodeDiagCount += diagnosesBySlug.get(slug)?.length ?? 0;
      }
      pathDiagnoses += nodeDiagCount;

      const unresolvedMistakes = mistakesByNode.get(n.id) ?? 0;

      // Retention across all referenced slugs (average of SM-2 ratings).
      let ratingSum = 0;
      let ratingN = 0;
      for (const slug of pageSlugs) {
        const r = retentionBySlug.get(slug);
        if (r) {
          ratingSum += r.sum;
          ratingN += r.n;
        }
      }
      const flashcardRetention = ratingN > 0 ? ratingSum / ratingN / 5 : null;

      // Are all prereq nodes mastered?
      let prereqsMet = true;
      try {
        const prereqIds: unknown = JSON.parse(n.prerequisiteNodeIds);
        if (Array.isArray(prereqIds) && prereqIds.length > 0) {
          for (const id of prereqIds) {
            if (typeof id !== "string") continue;
            const pp = progressByNode.get(id);
            if (!pp || (pp.quizScore ?? 0) < MASTERY_THRESHOLD) {
              prereqsMet = false;
              break;
            }
          }
        }
      } catch {}

      return {
        nodeId: n.id,
        nodeSlug: n.slug,
        title: n.title,
        level: n.level,
        pageSlug: primarySlug,
        pageTitle: primarySlug ? titleBySlug.get(primarySlug) ?? null : null,
        status,
        quizScore,
        activeDiagnoses: nodeDiagCount,
        unresolvedMistakes,
        flashcardRetention,
        lastTouchedAt: progress?.completedAt ?? null,
        prereqsMet,
      };
    });

    totalMastered += pathMastered;
    totalInProgress += pathInProgress;
    totalUntouched += pathUntouched;

    builtPaths.push({
      slug: path.slug,
      title: path.title,
      summary: {
        totalNodes: nodes.length,
        completedNodes: pathMastered,
        averageQuizScore: scoreCount > 0 ? scoreSum / scoreCount : 0,
        activeDiagnoses: pathDiagnoses,
      },
      nodes: builtNodes,
    });
  }

  // Hottest path = max ratio of (active diagnoses + unresolved mistakes)
  // to total nodes. Ties broken by highest absolute count.
  let hottestPath: { slug: string; title: string; heat: number } | null = null;
  for (const p of builtPaths) {
    if (p.nodes.length === 0) continue;
    const totalHeat =
      p.nodes.reduce(
        (s, n) => s + n.activeDiagnoses + n.unresolvedMistakes,
        0,
      ) / p.nodes.length;
    if (totalHeat <= 0) continue;
    if (!hottestPath || totalHeat > hottestPath.heat) {
      hottestPath = { slug: p.slug, title: p.title, heat: totalHeat };
    }
  }

  return {
    paths: builtPaths,
    overall: {
      mastered: totalMastered,
      inProgress: totalInProgress,
      untouched: totalUntouched,
      activeDiagnoses: totalActiveDiagnoses,
      hottestPath: hottestPath
        ? { slug: hottestPath.slug, title: hottestPath.title }
        : null,
    },
  };
}

// Suppress unused-import warning for `desc` (kept for future ranking).
void desc;

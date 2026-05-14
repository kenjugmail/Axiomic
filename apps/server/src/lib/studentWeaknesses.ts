// Phase 21A — student weakness aggregator. Collapses signals from six
// tables (misconception diagnoses, quiz mistakes, mastery progress,
// flashcard reviews, exam-attempt answers, capstone submissions)
// into a compact, prompt-ready profile that the AI variant generator
// can chew on. Filters everything to a topic-slug allowlist so a
// transformer class doesn't generate prompts around the student's
// organic-chemistry struggles.
//
// Reuse-first: the same shape is useful for any per-student
// personalization surface, not just class assignments.

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  flashcardReviews,
  flashcards,
  getDb,
  masteryNodes,
  misconceptionDiagnoses,
  quizMistakes,
  userProgress,
  wikiPages,
} from "@axiomic/db";

export interface WeaknessSignal {
  kind: "misconception" | "quiz_mistake" | "low_mastery" | "flashcard_struggle";
  evidence: string;
  recency: string; // ISO timestamp
}

export interface WeaknessTopic {
  conceptSlug: string;
  conceptTitle: string | null;
  severity: number; // 0..1 — relative within the profile
  signals: WeaknessSignal[];
}

export interface WeaknessProfile {
  topics: WeaknessTopic[];
  strengths: string[]; // concept slugs the student is solid on
  level: "intro" | "undergrad" | "grad" | null;
}

export interface BuildProfileOptions {
  userId: string;
  topicSlugs: string[];
  level: "intro" | "undergrad" | "grad" | null;
  // Limit on topics returned. Default 5 — keeps the AI prompt small.
  maxTopics?: number;
  // Time window for "recent" signals. Default 60 days.
  windowDays?: number;
}

// Phase 22A — masteryNodes is a small-but-not-tiny table (a few
// hundred rows). When bulk-generating variants for a 30-student
// class, the per-student profile build used to re-load it 30 times.
// Callers can now precompute the shared context once and pass it
// in; the loaded shape is identical to the inline-loaded version so
// existing single-shot callers don't change.
export interface PrebuiltWeaknessContext {
  nodeToSlug: Map<string, string>;
  nodeTitles: Map<string, string>;
}

export function prebuildWeaknessContext(): PrebuiltWeaknessContext {
  const db = getDb();
  const allNodes = db
    .select({
      id: masteryNodes.id,
      pageIds: masteryNodes.pageIds,
      title: masteryNodes.title,
    })
    .from(masteryNodes)
    .all();
  const nodeToSlug = new Map<string, string>();
  const nodeTitles = new Map<string, string>();
  for (const n of allNodes) {
    let primarySlug: string | null = null;
    try {
      const parsed = JSON.parse(n.pageIds);
      if (Array.isArray(parsed) && typeof parsed[0] === "string") {
        primarySlug = parsed[0];
      }
    } catch {}
    if (primarySlug) {
      nodeToSlug.set(n.id, primarySlug);
      nodeTitles.set(n.id, n.title);
    }
  }
  return { nodeToSlug, nodeTitles };
}

interface InternalAccumulator {
  signals: WeaknessSignal[];
  rawScore: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function recencyWeight(iso: string, windowDays: number): number {
  // Recent signals score higher. Linear decay from 1.0 at now to 0.2
  // at the window edge, floor at 0.1 for older signals.
  const ageMs = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ageMs) || ageMs < 0) return 1.0;
  const ageDays = ageMs / MS_PER_DAY;
  if (ageDays <= 0) return 1.0;
  if (ageDays >= windowDays) return 0.1;
  return 1.0 - (0.8 * ageDays) / windowDays;
}

export async function buildWeaknessProfile(
  opts: BuildProfileOptions,
  ctx?: PrebuiltWeaknessContext,
): Promise<WeaknessProfile> {
  const { userId, topicSlugs, level } = opts;
  const maxTopics = opts.maxTopics ?? 5;
  const windowDays = opts.windowDays ?? 60;
  const db = getDb();

  // Empty topic list = no scoping, so we'd flood the AI prompt with
  // every weakness this user has ever had. Better to return empty
  // and let the caller decide whether to call without scoping.
  if (topicSlugs.length === 0) {
    return { topics: [], strengths: [], level };
  }

  const topicSet = new Set(topicSlugs);
  const accumulators = new Map<string, InternalAccumulator>();
  const ensure = (slug: string): InternalAccumulator => {
    let a = accumulators.get(slug);
    if (!a) {
      a = { signals: [], rawScore: 0 };
      accumulators.set(slug, a);
    }
    return a;
  };

  // 1. Misconception diagnoses — direct conceptSlug match.
  const diagnoses = db
    .select({
      conceptSlug: misconceptionDiagnoses.conceptSlug,
      label: misconceptionDiagnoses.label,
      confidence: misconceptionDiagnoses.confidence,
      status: misconceptionDiagnoses.status,
      lastSeenAt: misconceptionDiagnoses.lastSeenAt,
    })
    .from(misconceptionDiagnoses)
    .where(
      and(
        eq(misconceptionDiagnoses.userId, userId),
        inArray(misconceptionDiagnoses.conceptSlug, topicSlugs),
        eq(misconceptionDiagnoses.status, "active"),
      ),
    )
    .all();
  for (const d of diagnoses) {
    const acc = ensure(d.conceptSlug);
    const w = recencyWeight(d.lastSeenAt, windowDays);
    acc.rawScore += d.confidence * w * 1.5; // misconceptions weigh heaviest
    acc.signals.push({
      kind: "misconception",
      evidence: d.label,
      recency: d.lastSeenAt,
    });
  }

  // 2. Mastery nodes whose primary page slug is in topic scope —
  // collect node ids so we can join quizMistakes and userProgress.
  // Reuses the caller-supplied context when present (Phase 22A
  // bulk-generate hoists this load out of the per-student loop).
  const fullContext = ctx ?? prebuildWeaknessContext();
  // Re-scope the supplied context to this request's topic slugs.
  // The prebuilt map is global (every node); the local maps only
  // hold entries whose primary slug is in scope.
  const nodeToSlug = new Map<string, string>();
  const nodeTitles = new Map<string, string>();
  for (const [nodeId, slug] of fullContext.nodeToSlug) {
    if (topicSet.has(slug)) {
      nodeToSlug.set(nodeId, slug);
      const title = fullContext.nodeTitles.get(nodeId);
      if (title) nodeTitles.set(nodeId, title);
    }
  }
  const scopedNodeIds = [...nodeToSlug.keys()];

  // 3. Quiz mistakes — recent + unresolved on scoped nodes.
  if (scopedNodeIds.length > 0) {
    const mistakes = db
      .select({
        nodeId: quizMistakes.nodeId,
        occurrences: quizMistakes.occurrences,
        lastWrongAt: quizMistakes.lastWrongAt,
        resolvedAt: quizMistakes.resolvedAt,
      })
      .from(quizMistakes)
      .where(
        and(
          eq(quizMistakes.userId, userId),
          inArray(quizMistakes.nodeId, scopedNodeIds),
        ),
      )
      .all();
    for (const m of mistakes) {
      if (m.resolvedAt) continue;
      const slug = nodeToSlug.get(m.nodeId);
      if (!slug) continue;
      const acc = ensure(slug);
      const w = recencyWeight(m.lastWrongAt, windowDays);
      acc.rawScore += m.occurrences * w * 0.4;
      acc.signals.push({
        kind: "quiz_mistake",
        evidence: `${m.occurrences} wrong attempt${m.occurrences === 1 ? "" : "s"} on ${nodeTitles.get(m.nodeId) ?? slug}`,
        recency: m.lastWrongAt,
      });
    }
  }

  // 4. Mastery progress — low quiz scores on scoped nodes feed
  // a low_mastery signal. Anything < 0.6 is a candidate weakness.
  if (scopedNodeIds.length > 0) {
    const progressRows = db
      .select({
        nodeId: userProgress.nodeId,
        quizScore: userProgress.quizScore,
        completedAt: userProgress.completedAt,
      })
      .from(userProgress)
      .where(
        and(
          eq(userProgress.userId, userId),
          inArray(userProgress.nodeId, scopedNodeIds),
        ),
      )
      .all();
    for (const p of progressRows) {
      if (p.quizScore == null) continue;
      const slug = nodeToSlug.get(p.nodeId);
      if (!slug) continue;
      if (p.quizScore < 0.6) {
        const acc = ensure(slug);
        const w = p.completedAt
          ? recencyWeight(p.completedAt, windowDays)
          : 0.5;
        acc.rawScore += (0.6 - p.quizScore) * w * 1.2;
        acc.signals.push({
          kind: "low_mastery",
          evidence: `quiz score ${Math.round(p.quizScore * 100)}% on ${nodeTitles.get(p.nodeId) ?? slug}`,
          recency: p.completedAt ?? new Date().toISOString(),
        });
      }
    }
  }

  // 5. Flashcard struggles — recent low ratings (0-2 on SM-2 grade).
  // Join flashcards → flashcardReviews → filter by pageSlug in scope.
  const struggleRows = db
    .select({
      pageSlug: flashcards.pageSlug,
      pageTitle: flashcards.pageTitle,
      rating: flashcardReviews.rating,
      reviewedAt: flashcardReviews.reviewedAt,
    })
    .from(flashcardReviews)
    .innerJoin(flashcards, eq(flashcardReviews.cardId, flashcards.id))
    .where(
      and(
        eq(flashcardReviews.userId, userId),
        inArray(flashcards.pageSlug, topicSlugs),
        sql`${flashcardReviews.rating} <= 2`,
      ),
    )
    .orderBy(desc(flashcardReviews.reviewedAt))
    .limit(20)
    .all();
  for (const r of struggleRows) {
    const acc = ensure(r.pageSlug);
    const w = recencyWeight(r.reviewedAt, windowDays);
    acc.rawScore += (3 - r.rating) * w * 0.3;
    acc.signals.push({
      kind: "flashcard_struggle",
      evidence: `${r.pageTitle} flashcard rated ${r.rating}/5`,
      recency: r.reviewedAt,
    });
  }

  // Wiki titles for nicer prompt-ready evidence.
  const titleSet = new Set(accumulators.keys());
  const titleRows = titleSet.size
    ? db
        .select({ slug: wikiPages.slug, title: wikiPages.title })
        .from(wikiPages)
        .where(inArray(wikiPages.slug, [...titleSet]))
        .all()
    : [];
  const slugToTitle = new Map(titleRows.map((r) => [r.slug, r.title]));

  // Strengths: scoped concepts with high mastery (quizScore >= 0.85)
  // that didn't accumulate weakness signals. Return up to 3 so the
  // AI can avoid re-teaching them.
  const strengthCandidates: Array<{ slug: string; score: number }> = [];
  if (scopedNodeIds.length > 0) {
    const allProgress = db
      .select({
        nodeId: userProgress.nodeId,
        quizScore: userProgress.quizScore,
      })
      .from(userProgress)
      .where(
        and(
          eq(userProgress.userId, userId),
          inArray(userProgress.nodeId, scopedNodeIds),
        ),
      )
      .all();
    for (const p of allProgress) {
      if (p.quizScore == null || p.quizScore < 0.85) continue;
      const slug = nodeToSlug.get(p.nodeId);
      if (!slug) continue;
      if (accumulators.has(slug)) continue; // already a weakness
      strengthCandidates.push({ slug, score: p.quizScore });
    }
  }
  strengthCandidates.sort((a, b) => b.score - a.score);
  const strengths = strengthCandidates.slice(0, 3).map((s) => s.slug);

  // Sort weaknesses by rawScore desc, take top N, normalize severity
  // to 0..1 within the returned set so the AI gets a comparable
  // ranking rather than absolute magnitudes.
  const sorted = [...accumulators.entries()]
    .map(([slug, acc]) => ({ slug, ...acc }))
    .sort((a, b) => b.rawScore - a.rawScore)
    .slice(0, maxTopics);
  const maxScore = sorted[0]?.rawScore ?? 1;

  const topics: WeaknessTopic[] = sorted.map((row) => ({
    conceptSlug: row.slug,
    conceptTitle: slugToTitle.get(row.slug) ?? null,
    severity: maxScore > 0 ? row.rawScore / maxScore : 0,
    // Cap signals at 4 per topic so the prompt stays compact.
    signals: row.signals
      .sort((a, b) => (a.recency < b.recency ? 1 : -1))
      .slice(0, 4),
  }));

  return { topics, strengths, level };
}

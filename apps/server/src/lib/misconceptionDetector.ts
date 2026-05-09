// Sprint 29 — Misconception detector.
//
// Heuristic v1: walks the user's recent quiz_mistakes + lesson_slide_events
// and matches against the seeded misconception_catalog by looking for
// concept-slug overlap. When evidence is found, upserts a
// misconception_diagnoses row.
//
// The detector is intentionally cheap + idempotent so it can run on:
//   - submission of a wrong quiz answer (best-effort, fire-and-forget)
//   - a periodic cron tick (every ~15 min)
//   - explicit /me/weak-concepts/refresh from the dashboard
//
// More sophisticated detection (per-question fingerprints, distractor
// pattern matching) is a follow-up; v1 just couples evidence to
// concept slugs by string match.

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  getDb,
  masteryNodes,
  misconceptionCatalog,
  misconceptionDiagnoses,
  quizMistakes,
} from "@axiomic/db";

interface DetectorEvidence {
  kind: "quiz_mistake" | "lesson_slide" | "forum_reply" | "other";
  refId: string;
  snippet: string;
}

export async function runDetectorForUser(userId: string): Promise<number> {
  const db = getDb();

  const catalog = db.select().from(misconceptionCatalog).all();
  if (catalog.length === 0) return 0;

  // Pull recent quiz mistakes (unresolved, recent first).
  const mistakes = db
    .select({
      id: quizMistakes.id,
      questionId: quizMistakes.questionId,
      occurrences: quizMistakes.occurrences,
      lastWrongAt: quizMistakes.lastWrongAt,
      nodeId: quizMistakes.nodeId,
    })
    .from(quizMistakes)
    .where(
      and(eq(quizMistakes.userId, userId), isNull(quizMistakes.resolvedAt)),
    )
    .orderBy(desc(quizMistakes.lastWrongAt))
    .limit(40)
    .all();

  if (mistakes.length === 0) return 0;

  // Resolve each mistake's nodeId → wiki page slugs (mastery_nodes.pageIds).
  // Fetch all nodes in a single query instead of per-id round trips.
  // The detector runs on every quiz-mistake submission + a cron tick;
  // a user with mistakes across 40 distinct nodes was previously
  // making 40 individual SELECTs per detector pass.
  const nodeSlugs = new Map<string, Set<string>>();
  const nodeIds = [...new Set(mistakes.map((m) => m.nodeId))];
  if (nodeIds.length > 0) {
    const nodes = db
      .select({ id: masteryNodes.id, pageIds: masteryNodes.pageIds })
      .from(masteryNodes)
      .where(inArray(masteryNodes.id, nodeIds))
      .all();
    for (const node of nodes) {
      try {
        const slugs = JSON.parse(node.pageIds);
        if (Array.isArray(slugs)) {
          nodeSlugs.set(
            node.id,
            new Set(slugs.filter((s): s is string => typeof s === "string")),
          );
        }
      } catch {
        // ignore — individual rows with malformed pageIds just skip
      }
    }
  }

  let upserts = 0;
  for (const c of catalog) {
    // For this catalog entry, find any mistakes whose node references
    // the same wiki slug as the misconception's concept.
    const relevant = mistakes.filter((m) =>
      nodeSlugs.get(m.nodeId)?.has(c.conceptSlug),
    );
    if (relevant.length === 0) continue;

    const evidence: DetectorEvidence[] = relevant.slice(0, 3).map((m) => ({
      kind: "quiz_mistake",
      refId: m.id,
      snippet: `Got question ${m.questionId.slice(0, 8)} wrong ${m.occurrences}x`,
    }));

    // Confidence grows with evidence count + occurrences.
    const totalOccurrences = relevant.reduce((s, r) => s + r.occurrences, 0);
    const confidence = Math.min(1, 0.4 + 0.15 * relevant.length + 0.05 * Math.min(totalOccurrences, 6));

    const existing = db
      .select()
      .from(misconceptionDiagnoses)
      .where(
        and(
          eq(misconceptionDiagnoses.userId, userId),
          eq(misconceptionDiagnoses.conceptSlug, c.conceptSlug),
          eq(misconceptionDiagnoses.misconceptionKey, c.key),
        ),
      )
      .get();

    const now = new Date().toISOString();
    if (existing) {
      // Don't downgrade dismissed rows back to active.
      if (existing.status === "dismissed") continue;
      db.update(misconceptionDiagnoses)
        .set({
          evidenceJson: JSON.stringify(evidence),
          confidence: Math.max(existing.confidence, confidence),
          lastSeenAt: now,
          // Stay 'coached' if already coached; otherwise active.
          status: existing.status === "resolved" ? "active" : existing.status,
        })
        .where(eq(misconceptionDiagnoses.id, existing.id))
        .run();
    } else {
      db.insert(misconceptionDiagnoses)
        .values({
          id: randomUUID(),
          userId,
          conceptSlug: c.conceptSlug,
          misconceptionKey: c.key,
          label: c.label,
          evidenceJson: JSON.stringify(evidence),
          confidence,
          status: "active",
          firstSeenAt: now,
          lastSeenAt: now,
        })
        .run();
    }
    upserts++;
  }

  return upserts;
}

// Best-effort fire-and-forget call for use after a quiz mistake.
export function fireDetectorForUserAsync(userId: string) {
  // Run on next tick so the caller's response isn't blocked.
  Promise.resolve()
    .then(() => runDetectorForUser(userId))
    .catch(() => {
      // Swallow detector errors — a failed detection should never
      // break the request that triggered it.
    });
}

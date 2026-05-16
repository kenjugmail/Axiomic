// Phase 31B — goal → prerequisite-ordered path planner.
//
// Readiness projects "ready in N days" but not "exactly what, in
// order". Given a target credential (capstone / track / exam),
// resolve its prerequisite mastery nodes, walk the
// masteryNodes.prerequisiteNodeIds DAG to the transitive closure,
// classify each node against the user's progress, and emit a
// topologically-sorted path (prereqs first), skipping mastered
// nodes, with per-step day estimates from readiness velocity.
// Deterministic + cycle-safe. No schema; reuse-only.

import { eq, inArray } from "drizzle-orm";
import {
  capstones,
  capstoneTrackCapstones,
  capstoneTracks,
  exams,
  getDb,
  masteryNodes,
  masteryPaths,
  userProgress,
} from "@axiomic/db";
import { prebuildWeaknessContext } from "./studentWeaknesses";
import { buildReadiness } from "./readiness";

export const MASTERY_THRESHOLD = 0.7; // mirrors knowledgeMri

// Phase 32C — 'skills' targets an explicit set of skill/concept
// slugs (e.g. a role's required skills, or an ad-hoc list). The
// `slug` field carries the comma-joined slug list; everything
// downstream reuses the existing wiki-slug → node resolution.
export type GoalKind = "capstone" | "track" | "exam" | "skills";
export interface GoalRef {
  kind: GoalKind;
  slug: string;
}
export interface GoalStep {
  nodeId: string;
  slug: string;
  title: string;
  status: "in_progress" | "untouched";
  reason: string;
  estimatedDays: number | null;
}
export interface GoalPath {
  goal: { kind: GoalKind; slug: string; title: string | null };
  steps: GoalStep[];
  blockedOn: Array<{ nodeId: string; slug: string; title: string }>;
  estimatedReadyOn: string | null;
  resolvable: boolean;
}

function parseIds(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string" && x.length > 0)
      : [];
  } catch {
    return [];
  }
}

export function buildGoalPath(userId: string, goal: GoalRef): GoalPath {
  const db = getDb();
  let title: string | null = null;
  const seedNodeIds = new Set<string>();
  const seedWikiSlugs = new Set<string>();

  if (goal.kind === "capstone") {
    const cap = db
      .select({
        title: capstones.title,
        pNodes: capstones.prerequisiteNodeIds,
        pWiki: capstones.prerequisiteWikiSlugs,
      })
      .from(capstones)
      .where(eq(capstones.slug, goal.slug))
      .get();
    if (cap) {
      title = cap.title;
      parseIds(cap.pNodes).forEach((n) => seedNodeIds.add(n));
      parseIds(cap.pWiki).forEach((s) => seedWikiSlugs.add(s));
    }
  } else if (goal.kind === "track") {
    const tr = db
      .select({ id: capstoneTracks.id, title: capstoneTracks.title })
      .from(capstoneTracks)
      .where(eq(capstoneTracks.slug, goal.slug))
      .get();
    if (tr) {
      title = tr.title;
      const capIds = db
        .select({ capstoneId: capstoneTrackCapstones.capstoneId })
        .from(capstoneTrackCapstones)
        .where(eq(capstoneTrackCapstones.trackId, tr.id))
        .all()
        .map((r) => r.capstoneId);
      if (capIds.length > 0) {
        for (const cap of db
          .select({
            pNodes: capstones.prerequisiteNodeIds,
            pWiki: capstones.prerequisiteWikiSlugs,
          })
          .from(capstones)
          .where(inArray(capstones.id, capIds))
          .all()) {
          parseIds(cap.pNodes).forEach((n) => seedNodeIds.add(n));
          parseIds(cap.pWiki).forEach((s) => seedWikiSlugs.add(s));
        }
      }
    }
  } else if (goal.kind === "exam") {
    const ex = db
      .select({ title: exams.title, pathSlug: exams.pathSlug })
      .from(exams)
      .where(eq(exams.slug, goal.slug))
      .get();
    if (ex) {
      title = ex.title;
      if (ex.pathSlug) {
        const path = db
          .select({ id: masteryPaths.id })
          .from(masteryPaths)
          .where(eq(masteryPaths.slug, ex.pathSlug))
          .get();
        if (path) {
          db.select({ id: masteryNodes.id })
            .from(masteryNodes)
            .where(eq(masteryNodes.pathId, path.id))
            .all()
            .forEach((n) => seedNodeIds.add(n.id));
        }
      }
    }
  } else {
    // Phase 32C — skills: the slug field is a comma-joined list of
    // target skill/concept slugs; resolve them via the same
    // wiki-slug → node mechanism the other kinds use.
    title = "Target skills";
    for (const s of goal.slug
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)) {
      seedWikiSlugs.add(s);
    }
  }

  // Resolve wiki-slug prereqs → node ids via the shared context.
  const ctx = prebuildWeaknessContext();
  if (seedWikiSlugs.size > 0) {
    for (const [nodeId, slug] of ctx.nodeToSlug) {
      if (seedWikiSlugs.has(slug)) seedNodeIds.add(nodeId);
    }
  }

  if (seedNodeIds.size === 0) {
    return {
      goal: { kind: goal.kind, slug: goal.slug, title },
      steps: [],
      blockedOn: [],
      estimatedReadyOn: null,
      resolvable: false,
    };
  }

  // Bulk-load the (small) node table once.
  const allNodes = db
    .select({
      id: masteryNodes.id,
      slug: masteryNodes.slug,
      title: masteryNodes.title,
      order: masteryNodes.order,
      prereqs: masteryNodes.prerequisiteNodeIds,
    })
    .from(masteryNodes)
    .all();
  const nodeById = new Map(allNodes.map((n) => [n.id, n]));
  const prereqMap = new Map<string, string[]>();
  for (const n of allNodes) {
    prereqMap.set(
      n.id,
      parseIds(n.prereqs).filter((p) => nodeById.has(p)),
    );
  }

  // Transitive closure from the seed set (cycle-safe).
  const closure = new Set<string>();
  const stack = [...seedNodeIds].filter((id) => nodeById.has(id));
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (closure.has(id)) continue;
    closure.add(id);
    for (const p of prereqMap.get(id) ?? []) {
      if (!closure.has(p)) stack.push(p);
    }
  }
  if (closure.size === 0) {
    return {
      goal: { kind: goal.kind, slug: goal.slug, title },
      steps: [],
      blockedOn: [],
      estimatedReadyOn: null,
      resolvable: false,
    };
  }

  // Classify against the user's progress (one query).
  const progress = new Map<string, number | null>();
  for (const row of db
    .select({
      nodeId: userProgress.nodeId,
      quizScore: userProgress.quizScore,
    })
    .from(userProgress)
    .where(eq(userProgress.userId, userId))
    .all()) {
    progress.set(row.nodeId, row.quizScore);
  }
  const statusOf = (id: string): "mastered" | "in_progress" | "untouched" => {
    if (!progress.has(id)) return "untouched";
    const q = progress.get(id);
    return q != null && q >= MASTERY_THRESHOLD ? "mastered" : "in_progress";
  };

  // Kahn topological sort over the closure (prereqs first).
  // Mastered nodes are treated as already satisfied/emitted.
  const emitted = new Set<string>();
  for (const id of closure) if (statusOf(id) === "mastered") emitted.add(id);
  const ordered: string[] = [];
  const remaining = new Set(
    [...closure].filter((id) => !emitted.has(id)),
  );
  let progressed = true;
  while (remaining.size > 0 && progressed) {
    progressed = false;
    const ready = [...remaining]
      .filter((id) =>
        (prereqMap.get(id) ?? []).every(
          (p) => !closure.has(p) || emitted.has(p),
        ),
      )
      .sort((a, b) => {
        const na = nodeById.get(a)!;
        const nb = nodeById.get(b)!;
        return (na.order ?? 0) - (nb.order ?? 0) || na.slug.localeCompare(nb.slug);
      });
    for (const id of ready) {
      ordered.push(id);
      emitted.add(id);
      remaining.delete(id);
      progressed = true;
    }
  }
  // Cycle remainder — never silently drop nodes.
  const cycleRemainder = [...remaining].sort();
  for (const id of cycleRemainder) ordered.push(id);

  const readiness = buildReadiness(userId);
  const v = readiness.velocityPerDay;
  const steps: GoalStep[] = ordered.map((id, i) => {
    const n = nodeById.get(id)!;
    const st = statusOf(id) as "in_progress" | "untouched";
    const isCycle = cycleRemainder.includes(id);
    return {
      nodeId: id,
      slug: n.slug,
      title: n.title,
      status: st,
      reason: isCycle
        ? "prerequisite cycle — order undetermined"
        : st === "in_progress"
          ? "in progress — finish to mastery"
          : "untouched prerequisite",
      estimatedDays: v > 0 ? Math.round((i + 1) / v) : null,
    };
  });

  const blockedOn = steps
    .filter(
      (s) =>
        s.status === "untouched" &&
        (prereqMap.get(s.nodeId) ?? []).some(
          (p) => closure.has(p) && statusOf(p) === "untouched",
        ),
    )
    .map((s) => ({ nodeId: s.nodeId, slug: s.slug, title: s.title }));

  let estimatedReadyOn: string | null = null;
  if (v > 0 && steps.length > 0) {
    const days = Math.ceil(steps.length / v);
    estimatedReadyOn = new Date(Date.now() + days * 86_400_000)
      .toISOString()
      .slice(0, 10);
  }

  return {
    goal: { kind: goal.kind, slug: goal.slug, title },
    steps,
    blockedOn,
    estimatedReadyOn,
    resolvable: true,
  };
}

// Phase 29D — personalized research-frontier feed.
//
// One ranked stream fusing four research surfaces that today live
// in isolation: recommended papers, open research bounties,
// papers needing reproduction, and matched funding. Reuses the
// existing rankers (recommend.rankPapersForUser,
// grantMatch.matchGrantsForUser) verbatim — this module only
// normalizes their scores onto a common scale and layers in
// weakness affinity + deadline urgency + a reproducibility-gap
// bonus so a learner sees, in priority order, the research work
// most worth their time next.

import { and, desc, eq, isNotNull, ne } from "drizzle-orm";
import {
  getDb,
  researchBounties,
  researchPapers,
  reproductions,
} from "@axiomic/db";
import { rankPapersForUser } from "./recommend";
import { matchGrantsForUser, rankByDeadline } from "./grantMatch";
import { buildReadiness } from "./readiness";

// Weights — module-top so they're tunable without touching the
// fusion loop (mirrors recommend.ts / grantMatch.ts convention).
const W_RELEVANCE = 0.4;
const W_WEAKNESS = 0.25;
const W_URGENCY = 0.2;
const W_REPRO_GAP = 0.15;

export type FrontierKind =
  | "paper"
  | "external_paper"
  | "bounty"
  | "needs_reproduction"
  | "grant";

export interface FrontierItem {
  kind: FrontierKind;
  id: string;
  title: string;
  // Internal route or external URL — the client decides nav by kind.
  url: string;
  score: number;
  reason: string;
  breakdown: {
    relevance: number;
    weakness: number;
    urgency: number;
    reproGap: number;
    total: number;
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/[\s-]+/)
      .filter((t) => t.length > 2),
  );
}

// Daily urgency: 1.0 ~ due now, decaying with a 14-day constant;
// 0 when there's no deadline or it's already past.
function urgency(deadlineAt: string | null): number {
  if (!deadlineAt) return 0;
  const ms = Date.parse(deadlineAt);
  if (Number.isNaN(ms)) return 0;
  const days = (ms - Date.now()) / 86_400_000;
  if (days <= 0) return 0;
  return clamp01(Math.exp(-days / 14));
}

// Overlap of the item's tokens with the user's weak-concept
// tokens, in [0,1]. The weak set comes from Phase 28E's readiness
// plan (active misconception diagnoses) — unscoped, so it works
// without a topic bootstrap.
function weaknessAffinity(
  itemTokens: Set<string>,
  weakTokens: Set<string>,
): number {
  if (weakTokens.size === 0 || itemTokens.size === 0) return 0;
  let hits = 0;
  for (const t of itemTokens) if (weakTokens.has(t)) hits++;
  // Saturating: a couple of strong concept hits already signals
  // high relevance; don't require the whole set to intersect.
  return clamp01(hits / 3);
}

function buildReason(b: FrontierItem["breakdown"], kind: FrontierKind): string {
  const parts: string[] = [];
  if (b.weakness >= 0.34) parts.push("targets a concept you're weak on");
  if (b.relevance >= 0.4) parts.push("matches your interests");
  if (b.urgency >= 0.4) parts.push("deadline approaching");
  if (kind === "needs_reproduction") parts.push("needs an independent reproduction");
  if (parts.length === 0) parts.push("surfacing on the research frontier");
  return parts.join(" · ");
}

export async function buildFrontier(
  userId: string | null,
  limit = 20,
): Promise<{ personalized: boolean; items: FrontierItem[] }> {
  const db = getDb();

  // Weak-concept token set (signed-in only).
  let weakTokens = new Set<string>();
  if (userId) {
    try {
      const readiness = buildReadiness(userId);
      const slugs = readiness.plan.map((p) => p.conceptSlug);
      weakTokens = tokenize(slugs.join(" "));
    } catch {
      weakTokens = new Set();
    }
  }

  const items: FrontierItem[] = [];

  // 1 + 2. Papers (recommended) — reuse the ranker as-is.
  try {
    const ranked = await rankPapersForUser(userId, {
      limit,
      excludeOwnPapers: true,
    });
    for (const r of ranked) {
      const relevance = clamp01(r.score);
      const wk = weaknessAffinity(
        new Set(r.paper.tags.map((t) => t.toLowerCase())),
        weakTokens,
      );
      const breakdown = {
        relevance,
        weakness: wk,
        urgency: 0,
        reproGap: 0,
        total: 0,
      };
      breakdown.total =
        W_RELEVANCE * relevance + W_WEAKNESS * wk;
      const p = r.paper;
      const isExternal = p.kind === "external_paper";
      const url =
        p.kind === "external_paper"
          ? p.htmlUrl ?? `/research/${p.slug}`
          : `/research/${p.slug}`;
      items.push({
        kind: isExternal ? "external_paper" : "paper",
        id: p.id,
        title: p.title,
        url,
        score: round(breakdown.total),
        reason: buildReason(breakdown, isExternal ? "external_paper" : "paper"),
        breakdown: {
          relevance: round(relevance),
          weakness: round(wk),
          urgency: 0,
          reproGap: 0,
          total: round(breakdown.total),
        },
      });
    }
  } catch {
    // ranker unavailable → skip the rail, never 500 the feed.
  }

  // 3. Open research bounties.
  try {
    const open = db
      .select({
        id: researchBounties.id,
        slug: researchBounties.slug,
        title: researchBounties.title,
        descriptionMd: researchBounties.descriptionMd,
        deadlineAt: researchBounties.deadlineAt,
      })
      .from(researchBounties)
      .where(
        and(
          eq(researchBounties.status, "open"),
          eq(researchBounties.discoverable, true),
        ),
      )
      .orderBy(desc(researchBounties.createdAt))
      .limit(limit)
      .all();
    for (const b of open) {
      const wk = weaknessAffinity(
        tokenize(`${b.title} ${b.descriptionMd}`),
        weakTokens,
      );
      const urg = urgency(b.deadlineAt);
      // Bounties have no ranker; relevance proxied by weakness.
      const relevance = wk;
      const total =
        W_RELEVANCE * relevance + W_WEAKNESS * wk + W_URGENCY * urg;
      const breakdown = {
        relevance: round(relevance),
        weakness: round(wk),
        urgency: round(urg),
        reproGap: 0,
        total: round(total),
      };
      items.push({
        kind: "bounty",
        id: b.id,
        title: b.title,
        url: `/bounties/${b.slug}`,
        score: round(total),
        reason: buildReason(breakdown, "bounty"),
        breakdown,
      });
    }
  } catch {
    // skip
  }

  // 4. Papers needing an independent reproduction — published
  //    internal papers with no peer-verified reproduction yet.
  try {
    const mintedTargets = new Set(
      db
        .select({ targetId: reproductions.targetId })
        .from(reproductions)
        .where(
          and(
            eq(reproductions.targetKind, "research_paper"),
            isNotNull(reproductions.credentialMintedAt),
          ),
        )
        .all()
        .map((r) => r.targetId),
    );
    const papers = db
      .select({
        id: researchPapers.id,
        slug: researchPapers.slug,
        title: researchPapers.title,
        tags: researchPapers.tags,
        status: researchPapers.status,
      })
      .from(researchPapers)
      .where(ne(researchPapers.status, "draft"))
      .orderBy(desc(researchPapers.createdAt))
      .limit(limit * 3)
      .all();
    for (const p of papers) {
      if (mintedTargets.has(p.id)) continue;
      let tags: string[] = [];
      try {
        const v = JSON.parse(p.tags);
        if (Array.isArray(v)) tags = v.filter((x) => typeof x === "string");
      } catch {
        tags = [];
      }
      const wk = weaknessAffinity(
        new Set(tags.map((t) => t.toLowerCase())),
        weakTokens,
      );
      const reproGap = 1;
      const total =
        W_RELEVANCE * wk + W_WEAKNESS * wk + W_REPRO_GAP * reproGap;
      const breakdown = {
        relevance: round(wk),
        weakness: round(wk),
        urgency: 0,
        reproGap,
        total: round(total),
      };
      items.push({
        kind: "needs_reproduction",
        id: p.id,
        title: p.title,
        url: `/research/${p.slug}`,
        score: round(total),
        reason: buildReason(breakdown, "needs_reproduction"),
        breakdown,
      });
    }
  } catch {
    // skip
  }

  // 5. Matched funding — reuse the grant matcher as-is.
  try {
    const grants = userId
      ? await matchGrantsForUser(userId, { limit })
      : rankByDeadline({ limit });
    for (const g of grants) {
      const relevance = clamp01(g.score);
      const wk = weaknessAffinity(
        tokenize(`${g.grant.title} ${g.grant.topics.join(" ")}`),
        weakTokens,
      );
      const urg = urgency(g.grant.deadlineAt);
      const total =
        W_RELEVANCE * relevance + W_WEAKNESS * wk + W_URGENCY * urg;
      const breakdown = {
        relevance: round(relevance),
        weakness: round(wk),
        urgency: round(urg),
        reproGap: 0,
        total: round(total),
      };
      items.push({
        kind: "grant",
        id: g.grant.id,
        title: g.grant.title,
        url: g.grant.url,
        score: round(total),
        reason: buildReason(breakdown, "grant"),
        breakdown,
      });
    }
  } catch {
    // skip
  }

  // Diversity-aware selection: a "frontier" feed is only useful if
  // it spans surfaces. Sort within each kind, then round-robin
  // across kinds so a flat-scored stream (e.g. many un-reproduced
  // papers) can't crowd out bounties / grants entirely.
  const byKind = new Map<FrontierKind, FrontierItem[]>();
  for (const it of items) {
    const arr = byKind.get(it.kind) ?? [];
    arr.push(it);
    byKind.set(it.kind, arr);
  }
  for (const arr of byKind.values()) arr.sort((a, b) => b.score - a.score);
  const queues = [...byKind.values()];
  const picked: FrontierItem[] = [];
  let idx = 0;
  while (picked.length < limit && queues.some((q) => q.length > 0)) {
    const q = queues[idx % queues.length]!;
    const next = q.shift();
    if (next) picked.push(next);
    idx++;
  }
  // Within the diversified set, present highest-scored first.
  picked.sort((a, b) => b.score - a.score);
  return {
    personalized: Boolean(userId),
    items: picked,
  };
}

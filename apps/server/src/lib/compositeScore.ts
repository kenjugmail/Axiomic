// Phase 31C — the unified, signed "Axiomic Score".
//
// One deterministic 0..1000 number fusing lifetime XP, signed
// credentials, reviewer trust, mastery %, and learning streak —
// each normalized to 0..1, weighted, summed, scaled. Signed via
// the existing signCredential() so any third party can verify it
// through the unchanged /api/v1/keys/verify. No schema; on-demand
// (nothing persisted).

import { getDb } from "@axiomic/db";
import { totalXpForUser } from "./xp";
import { currentStreak } from "./achievements";
import { getReviewerReputations } from "./reviewerTrust";
import { buildKnowledgeMri } from "./knowledgeMri";
import { buildWallet } from "../routes/credentials";
import { signCredential, type SignedCredential } from "./signing";

// Component weights (sum to 1.0) — tunable here, mirrors the
// frontier.ts / reviewerTrust.ts constant convention.
export const W_XP = 0.3;
export const W_CREDS = 0.25;
export const W_REVIEWER = 0.15;
export const W_MASTERY = 0.2;
export const W_STREAK = 0.1;

// Normalization knobs.
export const XP_LOG_SATURATION = 100_000;
export const CRED_SATURATION = 12;
export const REVIEWER_SATURATION = 50;
export const STREAK_SATURATION = 30;
export const SCORE_MAX = 1000;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export interface AxiomicScoreBreakdown {
  xp: { raw: number; normalized: number; weighted: number };
  credentials: {
    raw: number;
    byKind: Record<string, number>;
    normalized: number;
    weighted: number;
  };
  reviewerTrust: { raw: number; normalized: number; weighted: number };
  mastery: {
    mastered: number;
    total: number;
    normalized: number;
    weighted: number;
  };
  streak: { raw: number; normalized: number; weighted: number };
}
export interface AxiomicScore {
  score: number; // integer 0..1000
  breakdown: AxiomicScoreBreakdown;
  issuedAt: string;
}

export async function computeAxiomicScore(
  userId: string,
  username: string,
): Promise<AxiomicScore> {
  const db = getDb();

  const xpRaw = totalXpForUser(userId);
  const xpN = clamp01(
    Math.log10(1 + xpRaw) / Math.log10(1 + XP_LOG_SATURATION),
  );

  const wallet = buildWallet(userId, username);
  const byKind: Record<string, number> = {};
  for (const it of wallet) byKind[it.kind] = (byKind[it.kind] ?? 0) + 1;
  const credRaw = wallet.length;
  const credN = clamp01(1 - Math.exp(-credRaw / CRED_SATURATION));

  const repRaw = getReviewerReputations([userId]).get(userId) ?? 0;
  const revN = clamp01(Math.max(0, repRaw) / REVIEWER_SATURATION);

  const mri = await buildKnowledgeMri(userId);
  const mastered = mri.overall.mastered;
  const total =
    mri.overall.mastered + mri.overall.inProgress + mri.overall.untouched;
  const masN = total > 0 ? mastered / total : 0;

  const streakRaw = currentStreak(db, userId);
  const streakN = clamp01(streakRaw / STREAK_SATURATION);

  const composite01 =
    W_XP * xpN +
    W_CREDS * credN +
    W_REVIEWER * revN +
    W_MASTERY * masN +
    W_STREAK * streakN;
  const score = Math.round(composite01 * SCORE_MAX);

  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  return {
    score,
    breakdown: {
      xp: { raw: xpRaw, normalized: round3(xpN), weighted: round3(W_XP * xpN) },
      credentials: {
        raw: credRaw,
        byKind,
        normalized: round3(credN),
        weighted: round3(W_CREDS * credN),
      },
      reviewerTrust: {
        raw: repRaw,
        normalized: round3(revN),
        weighted: round3(W_REVIEWER * revN),
      },
      mastery: {
        mastered,
        total,
        normalized: round3(masN),
        weighted: round3(W_MASTERY * masN),
      },
      streak: {
        raw: streakRaw,
        normalized: round3(streakN),
        weighted: round3(W_STREAK * streakN),
      },
    },
    issuedAt: new Date().toISOString(),
  };
}

export function signAxiomicScore(
  userId: string,
  username: string,
  s: AxiomicScore,
): SignedCredential {
  return signCredential("composite_score", {
    username,
    userId,
    score: s.score,
    breakdown: s.breakdown,
    issuedAt: s.issuedAt,
  });
}

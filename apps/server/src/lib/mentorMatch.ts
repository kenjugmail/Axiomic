// Phase 30A — mentor auto-matching.
//
// Ranks candidate mentors for a mentee by demonstrated fit:
// a mentor who proved strength (quizScore >= 0.85) exactly on the
// concepts the mentee is currently weak on, weighted by community
// reputation (the Phase 29A signal) and persona/goal alignment.
// Deterministic; no AI. Reuses buildWeaknessProfile +
// prebuildWeaknessContext + getReviewerReputations as-is.

import { and, eq, inArray, ne, isNull, sql } from "drizzle-orm";
import {
  cohortMembers,
  getDb,
  mentorRelationships,
  misconceptionDiagnoses,
  userProgress,
  users,
} from "@axiomic/db";
import {
  buildWeaknessProfile,
  prebuildWeaknessContext,
} from "./studentWeaknesses";
import { getReviewerReputations } from "./reviewerTrust";

// Weights — module-top so they move without touching the loop
// (mirrors frontier.ts / reviewerTrust.ts convention).
const W_TOPIC = 0.5;
const W_DOMAIN_REP = 0.3;
const W_ALIGN = 0.2;
// Reputation that maps to a full domainRep of 1.0 (~ the
// MAX_WEIGHT band the reviewer-trust model already uses).
const REP_NORM = 25;
// "Proven strong" on a concept.
const STRONG = 0.85;
// "Weak" enough to count as a mentee gap when bootstrapping scope.
const WEAK = 0.6;

export interface MentorCandidate {
  username: string;
  displayName: string | null;
  bio: string | null;
  score: number;
  rationale: string;
  breakdown: { topicMatch: number; domainRep: number; align: number };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export async function rankMentorCandidates(
  menteeId: string,
  limit = 8,
): Promise<{ personalized: boolean; candidates: MentorCandidate[] }> {
  const db = getDb();
  const ctx = prebuildWeaknessContext();

  // 1. Bootstrap the mentee's weak-topic scope (buildWeaknessProfile
  //    returns empty unless topicSlugs is non-empty).
  const diagSlugs = db
    .select({ slug: misconceptionDiagnoses.conceptSlug })
    .from(misconceptionDiagnoses)
    .where(
      and(
        eq(misconceptionDiagnoses.userId, menteeId),
        eq(misconceptionDiagnoses.status, "active"),
      ),
    )
    .all()
    .map((r) => r.slug);

  const lowMastery = db
    .select({ nodeId: userProgress.nodeId, quizScore: userProgress.quizScore })
    .from(userProgress)
    .where(eq(userProgress.userId, menteeId))
    .all();
  const lowSlugs: string[] = [];
  for (const row of lowMastery) {
    if (row.quizScore != null && row.quizScore < WEAK) {
      const slug = ctx.nodeToSlug.get(row.nodeId);
      if (slug) lowSlugs.push(slug);
    }
  }

  const topicSlugs = [...new Set([...diagSlugs, ...lowSlugs])];
  if (topicSlugs.length === 0) {
    return { personalized: false, candidates: [] };
  }

  const profile = await buildWeaknessProfile(
    { userId: menteeId, topicSlugs, level: null, maxTopics: 8 },
    ctx,
  );
  if (profile.topics.length === 0) {
    return { personalized: false, candidates: [] };
  }
  const severityBySlug = new Map(
    profile.topics.map((t) => [t.conceptSlug, t.severity]),
  );
  const titleBySlug = new Map(
    profile.topics.map((t) => [t.conceptSlug, t.conceptTitle]),
  );
  const totalSeverity =
    profile.topics.reduce((s, t) => s + t.severity, 0) || 1;

  // 2. Candidate pool: anyone who has offered to mentor (≥1
  //    accepted relationship as mentorId) ∪ cohort mentors/
  //    organizers. Exclude self + deleted + existing live rel.
  const offered = db
    .selectDistinct({ id: mentorRelationships.mentorId })
    .from(mentorRelationships)
    .where(eq(mentorRelationships.status, "accepted"))
    .all()
    .map((r) => r.id);
  const cohortMentors = db
    .selectDistinct({ id: cohortMembers.userId })
    .from(cohortMembers)
    .where(inArray(cohortMembers.role, ["mentor", "organizer"]))
    .all()
    .map((r) => r.id);
  const poolIds = [...new Set([...offered, ...cohortMentors])].filter(
    (id) => id !== menteeId,
  );
  if (poolIds.length === 0) {
    return { personalized: true, candidates: [] };
  }

  // Existing live relationships to this mentee → exclude.
  const liveRels = new Set(
    db
      .select({
        mentorId: mentorRelationships.mentorId,
        status: mentorRelationships.status,
      })
      .from(mentorRelationships)
      .where(eq(mentorRelationships.menteeId, menteeId))
      .all()
      .filter((r) => r.status !== "ended" && r.status !== "declined")
      .map((r) => r.mentorId),
  );

  const candUsers = db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      bio: users.bio,
      onboardingGoal: users.onboardingGoal,
      primaryPersona: users.primaryPersona,
    })
    .from(users)
    .where(and(inArray(users.id, poolIds), isNull(users.deletedAt)))
    .all()
    .filter((u) => !liveRels.has(u.id));
  if (candUsers.length === 0) {
    return { personalized: true, candidates: [] };
  }

  // Mentee's persona/goal for alignment.
  const mentee = db
    .select({
      onboardingGoal: users.onboardingGoal,
      primaryPersona: users.primaryPersona,
    })
    .from(users)
    .where(eq(users.id, menteeId))
    .get();

  // 3. Each candidate's *strong* slugs (one batched query).
  const candIds = candUsers.map((u) => u.id);
  const progressRows = db
    .select({
      userId: userProgress.userId,
      nodeId: userProgress.nodeId,
      quizScore: userProgress.quizScore,
    })
    .from(userProgress)
    .where(inArray(userProgress.userId, candIds))
    .all();
  const strongByUser = new Map<string, Set<string>>();
  for (const r of progressRows) {
    if (r.quizScore != null && r.quizScore >= STRONG) {
      const slug = ctx.nodeToSlug.get(r.nodeId);
      if (!slug) continue;
      let set = strongByUser.get(r.userId);
      if (!set) {
        set = new Set();
        strongByUser.set(r.userId, set);
      }
      set.add(slug);
    }
  }

  const reps = getReviewerReputations(candIds);

  const candidates: MentorCandidate[] = candUsers.map((u) => {
    const strong = strongByUser.get(u.id) ?? new Set();
    let matched = 0;
    let topSlug: string | null = null;
    let topSev = 0;
    for (const [slug, sev] of severityBySlug) {
      if (strong.has(slug)) {
        matched += sev;
        if (sev > topSev) {
          topSev = sev;
          topSlug = slug;
        }
      }
    }
    const topicMatch = clamp01(matched / totalSeverity);
    const domainRep = clamp01((reps.get(u.id) ?? 0) / REP_NORM);
    const personaEq =
      !!mentee?.primaryPersona &&
      mentee.primaryPersona === u.primaryPersona;
    const goalEq =
      !!mentee?.onboardingGoal &&
      mentee.onboardingGoal === u.onboardingGoal;
    const align = (personaEq ? 0.5 : 0) + (goalEq ? 0.5 : 0);
    const score =
      W_TOPIC * topicMatch + W_DOMAIN_REP * domainRep + W_ALIGN * align;

    const parts: string[] = [];
    if (topicMatch >= 0.34 && topSlug) {
      parts.push(
        `strong in ${titleBySlug.get(topSlug) ?? topSlug}, which you're working on`,
      );
    }
    if (domainRep >= 0.34) parts.push("high community reputation");
    if (personaEq && mentee?.primaryPersona) {
      parts.push(`same ${mentee.primaryPersona} track`);
    } else if (goalEq) {
      parts.push("shares your goal");
    }
    if (parts.length === 0) parts.push("available mentor");

    return {
      username: u.username,
      displayName: u.displayName,
      bio: u.bio,
      score: Math.round(score * 1000) / 1000,
      rationale: parts.join(" · "),
      breakdown: {
        topicMatch: Math.round(topicMatch * 1000) / 1000,
        domainRep: Math.round(domainRep * 1000) / 1000,
        align,
      },
    };
  });

  candidates.sort((a, b) => b.score - a.score);
  return { personalized: true, candidates: candidates.slice(0, limit) };
}

// suppress unused import in builds where these aren't referenced
void sql;
void ne;

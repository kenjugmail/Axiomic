// Sprint 26-28 — Capstones router.
//
// A capstone is a thesis-scale, milestone-driven project that becomes
// a public portfolio piece on completion. The flow:
//
//   author publishes a brief + ordered milestones + per-milestone rubric
//        ↓
//   learner enrolls, submits each milestone, gets AI-graded feedback
//        ↓
//   on all-passed: a public artifact page is created at
//   /capstones/c/${username}-${slug} that anyone can read.
//
// Schema lives in packages/db/src/schema.ts (`capstones`,
// `capstone_milestones`, `capstone_enrollments`, `capstone_submissions`).
// The grader is in apps/server/src/lib/capstoneGrader.ts.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  capstoneEnrollments,
  capstoneMilestones,
  capstonePeerReviews,
  capstoneSubmissions,
  capstoneVersions,
  capstones,
  getDb,
  users,
} from "@axiomic/db";
import { requireAuth, getSessionUser } from "../middleware/auth";
import { invalidateSearchIndex } from "../lib/searchIndex";
import { gradeMilestoneSubmission } from "../lib/capstoneGrader";
import {
  toBibtex,
  toRis,
  toPlainText,
  type CitationSource,
} from "../lib/citations";
import { snapshotCapstone } from "../lib/versionSnapshots";
import { buildTranscriptManifest } from "../lib/transcripts";
import { canonicalJson, publicKeyHex, sign } from "../lib/signing";
import { maybeMintTrackCompletions } from "../lib/capstoneTrackCompletion";
import { notifyTrackCompletion } from "../lib/notifications";
import {
  validateLongArcFloor,
  LONG_ARC_MAX_HOURS,
} from "../lib/capstoneFloor";
import type { Env } from "../env";

export const capstonesRouter = new Hono<Env>();

// --- helpers ---------------------------------------------------------

type Tier = "intro" | "undergrad" | "grad";
const TIERS: Tier[] = ["intro", "undergrad", "grad"];

function safeParseStrArray(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.filter((s): s is string => typeof s === "string");
  } catch {
    return [];
  }
}

function safeParseJson<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function pickContent(
  paper: {
    contentIntro: string;
    contentUndergrad: string;
    contentGrad: string;
    canonicalTier: string;
  },
  requested: Tier,
): { tier: Tier; content: string } {
  const map: Record<Tier, string> = {
    intro: paper.contentIntro,
    undergrad: paper.contentUndergrad,
    grad: paper.contentGrad,
  };
  if (map[requested] && map[requested].trim().length > 0) {
    return { tier: requested, content: map[requested] };
  }
  const canonical = (TIERS as string[]).includes(paper.canonicalTier)
    ? (paper.canonicalTier as Tier)
    : "undergrad";
  if (map[canonical].trim().length > 0) {
    return { tier: canonical, content: map[canonical] };
  }
  for (const t of TIERS) {
    if (map[t].trim().length > 0) return { tier: t, content: map[t] };
  }
  return { tier: requested, content: "" };
}

// --- schemas --------------------------------------------------------

const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case");

const tierSchema = z.enum(["intro", "undergrad", "grad"]);

const tagSchema = z.array(z.string().min(1).max(40)).max(8).optional();

const ARTIFACT_KINDS = [
  "github",
  "colab",
  "docker",
  "dataset",
  "writeup",
  "arxiv",
  "other",
] as const;

const rubricCriterionSchema = z.object({
  id: z.string().min(1).max(40),
  weight: z.number().min(0).max(1),
  description: z.string().min(1).max(500),
  aiPrompt: z.string().min(1).max(2000),
});

const rubricSchema = z.object({
  criteria: z.array(rubricCriterionSchema).min(1).max(10),
  passingScore: z.number().min(0).max(1),
  notes: z.string().max(2000).optional(),
});

const accentSchema = z
  .enum(["indigo", "emerald", "rose", "amber", "sky", "violet"])
  .optional();

function normalizeTags(input: string[] | undefined): string[] {
  if (!input) return [];
  const seen = new Set<string>();
  for (const raw of input) {
    const t = raw.trim().toLowerCase().replace(/\s+/g, "-");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t)) continue;
    seen.add(t);
    if (seen.size >= 8) break;
  }
  return [...seen];
}

// S85 — Open-set domain taxonomy. Long_arc capstones span beyond the
// closed lab-discipline enum — firmware, optics, control-theory,
// image-processing, etc. Loosely validated.
const domainTagSchema = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9][a-z0-9\-_/]*$/i, "domain tags use letters, digits, hyphens, slashes");

const scaleTierSchema = z.enum(["skill_drill", "long_arc"]);

const createSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1).max(200),
  summary: z.string().max(500).optional().default(""),
  contentIntro: z.string().max(50000).optional().default(""),
  contentUndergrad: z.string().max(50000).optional().default(""),
  contentGrad: z.string().max(50000).optional().default(""),
  canonicalTier: tierSchema.optional().default("undergrad"),
  estimatedWeeks: z.number().int().min(1).max(52).optional().default(6),
  prerequisiteWikiSlugs: z.array(slugSchema).max(20).optional(),
  prerequisiteNodeIds: z.array(z.string().min(1).max(80)).max(20).optional(),
  tags: tagSchema,
  coverEmoji: z.string().max(8).optional(),
  accentColor: accentSchema,
  status: z.enum(["draft", "published"]).optional().default("draft"),
  // S85 — long_arc tier metadata. All optional at the zod layer; the
  // floor validator runs separately when scaleTier === 'long_arc' to
  // produce structured error lists.
  scaleTier: scaleTierSchema.optional().default("skill_drill"),
  domains: z.array(domainTagSchema).max(12).optional(),
  estimatedHoursMin: z.number().int().min(0).max(LONG_ARC_MAX_HOURS).nullable().optional(),
  estimatedHoursMax: z.number().int().min(0).max(LONG_ARC_MAX_HOURS).nullable().optional(),
  realWorldDeliverableMd: z.string().max(20000).nullable().optional(),
});

const updateSchema = createSchema.partial().extend({
  slug: z.never().optional(),
});

const milestoneCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(20000).optional().default(""),
  rubric: rubricSchema.optional(),
  requiredArtifactKinds: z.array(z.enum(ARTIFACT_KINDS)).max(5).optional(),
  runnableTests: z.string().max(20000).nullable().optional(),
  estimatedDays: z.number().int().min(1).max(60).optional().default(7),
  order: z.number().int().min(0).max(50).optional(),
  // S85 — calendar deadline. ISO date string (YYYY-MM-DD or full
  // datetime). Long_arc capstones surface this in the workspace + on
  // the detail page.
  dueAt: z.string().max(40).nullable().optional(),
  advisorSignoffRequired: z.boolean().optional(),
});

const milestoneUpdateSchema = milestoneCreateSchema.partial();

const submitSchema = z.object({
  artifacts: z
    .array(
      z.object({
        kind: z.enum(ARTIFACT_KINDS),
        url: z.string().url().max(500),
        label: z.string().min(1).max(120),
        description: z.string().max(800).optional(),
      }),
    )
    .max(10),
  writeup: z.string().min(1).max(50000),
  runnableTestResults: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        passed: z.boolean(),
        message: z.string().max(800).optional(),
      }),
    )
    .max(50)
    .optional(),
  labState: z.record(z.unknown()).optional(),
});

// S85 — Run the long_arc complexity floor against a capstone row.
// Reads the persisted capstone + its milestones; returns the
// validator result. Called at publish time when the capstone is
// transitioning to (or already in) the long_arc tier.
function runLongArcFloor(capstoneId: string):
  | { ok: true }
  | { ok: false; errors: string[] } {
  const db = getDb();
  const cap = db
    .select({
      domainsJson: capstones.domainsJson,
      estimatedHoursMin: capstones.estimatedHoursMin,
      estimatedHoursMax: capstones.estimatedHoursMax,
      realWorldDeliverableMd: capstones.realWorldDeliverableMd,
    })
    .from(capstones)
    .where(eq(capstones.id, capstoneId))
    .get();
  if (!cap) return { ok: false, errors: ["capstone not found"] };
  const milestones = db
    .select({ dueAt: capstoneMilestones.dueAt })
    .from(capstoneMilestones)
    .where(eq(capstoneMilestones.capstoneId, capstoneId))
    .all();
  return validateLongArcFloor({
    domains: safeParseStrArray(cap.domainsJson),
    estimatedHoursMin: cap.estimatedHoursMin,
    estimatedHoursMax: cap.estimatedHoursMax,
    realWorldDeliverableMd: cap.realWorldDeliverableMd,
    milestones,
  });
}

// --- routes ---------------------------------------------------------

// GET /capstones — list published capstones with milestone counts.
capstonesRouter.get("/", async (c) => {
  const db = getDb();
  const tag = c.req.query("tag")?.toLowerCase();
  const scaleTierFilter = c.req.query("scaleTier");
  const rows = db
    .select({
      id: capstones.id,
      slug: capstones.slug,
      title: capstones.title,
      summary: capstones.summary,
      estimatedWeeks: capstones.estimatedWeeks,
      coverEmoji: capstones.coverEmoji,
      accentColor: capstones.accentColor,
      tags: capstones.tags,
      authorId: capstones.authorId,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
      scaleTier: capstones.scaleTier,
      domainsJson: capstones.domainsJson,
      estimatedHoursMin: capstones.estimatedHoursMin,
      estimatedHoursMax: capstones.estimatedHoursMax,
      createdAt: capstones.createdAt,
      updatedAt: capstones.updatedAt,
    })
    .from(capstones)
    .innerJoin(users, eq(capstones.authorId, users.id))
    .where(eq(capstones.status, "published"))
    .orderBy(desc(capstones.createdAt))
    .all();

  let filtered = tag
    ? rows.filter((r) => safeParseStrArray(r.tags).includes(tag))
    : rows;
  if (scaleTierFilter === "skill_drill" || scaleTierFilter === "long_arc") {
    filtered = filtered.filter((r) => r.scaleTier === scaleTierFilter);
  }

  // Count milestones per capstone in a single query.
  const milestoneCounts = new Map<string, number>();
  if (filtered.length > 0) {
    const allMs = db
      .select({ capstoneId: capstoneMilestones.capstoneId })
      .from(capstoneMilestones)
      .all();
    for (const m of allMs) {
      milestoneCounts.set(
        m.capstoneId,
        (milestoneCounts.get(m.capstoneId) ?? 0) + 1,
      );
    }
  }

  return c.json({
    capstones: filtered.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      summary: r.summary,
      estimatedWeeks: r.estimatedWeeks,
      coverEmoji: r.coverEmoji,
      accentColor: r.accentColor,
      tags: safeParseStrArray(r.tags),
      authorId: r.authorId,
      authorUsername: r.authorUsername,
      authorDisplayName: r.authorDisplayName,
      milestoneCount: milestoneCounts.get(r.id) ?? 0,
      scaleTier: r.scaleTier,
      domains: safeParseStrArray(r.domainsJson),
      estimatedHoursMin: r.estimatedHoursMin,
      estimatedHoursMax: r.estimatedHoursMax,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  });
});

// GET /capstones/me/drafts — author's drafts.
capstonesRouter.get("/me/drafts", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb();
  const rows = db
    .select({
      id: capstones.id,
      slug: capstones.slug,
      title: capstones.title,
      summary: capstones.summary,
      estimatedWeeks: capstones.estimatedWeeks,
      coverEmoji: capstones.coverEmoji,
      accentColor: capstones.accentColor,
      tags: capstones.tags,
      scaleTier: capstones.scaleTier,
      updatedAt: capstones.updatedAt,
    })
    .from(capstones)
    .where(
      and(
        eq(capstones.authorId, user.id),
        eq(capstones.status, "draft"),
      ),
    )
    .orderBy(desc(capstones.updatedAt))
    .all();
  return c.json({
    capstones: rows.map((r) => ({
      ...r,
      tags: safeParseStrArray(r.tags),
    })),
  });
});

// GET /capstones/me/enrollments — caller's in-flight + completed.
capstonesRouter.get("/me/enrollments", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb();
  const rows = db
    .select({
      id: capstoneEnrollments.id,
      capstoneId: capstoneEnrollments.capstoneId,
      capstoneSlug: capstones.slug,
      capstoneTitle: capstones.title,
      capstoneCoverEmoji: capstones.coverEmoji,
      capstoneAccentColor: capstones.accentColor,
      startedAt: capstoneEnrollments.startedAt,
      completedAt: capstoneEnrollments.completedAt,
      artifactPageSlug: capstoneEnrollments.artifactPageSlug,
    })
    .from(capstoneEnrollments)
    .innerJoin(capstones, eq(capstoneEnrollments.capstoneId, capstones.id))
    .where(eq(capstoneEnrollments.userId, user.id))
    .orderBy(desc(capstoneEnrollments.startedAt))
    .all();

  // Bundle per-enrollment submissions for the dashboard view.
  const result = rows.map((r) => {
    const subs = db
      .select()
      .from(capstoneSubmissions)
      .where(eq(capstoneSubmissions.enrollmentId, r.id))
      .all();
    return {
      ...r,
      submissions: subs.map(toSubmissionDto),
    };
  });

  return c.json({ enrollments: result });
});

// Sprint 37 — Capstone artifact transcripts. The unsigned manifest
// is the canonical record; the signed transcript bundles {manifest,
// signature, publicKey} so anyone can verify the bytes against our
// ed25519 public key. Both endpoints are public.
capstonesRouter.get("/c/:artifactSlug/manifest", async (c) => {
  const artifactSlug = c.req.param("artifactSlug")!;
  const manifest = buildTranscriptManifest(artifactSlug);
  if (!manifest) return c.json({ error: "Artifact not found" }, 404);
  // Return the canonical (sorted-key) JSON so verifiers see the exact
  // bytes the server would have signed.
  return new Response(canonicalJson(manifest), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60",
    },
  });
});

capstonesRouter.get("/c/:artifactSlug/transcript", async (c) => {
  const artifactSlug = c.req.param("artifactSlug")!;
  const manifest = buildTranscriptManifest(artifactSlug);
  if (!manifest) return c.json({ error: "Artifact not found" }, 404);
  const payload = canonicalJson(manifest);
  const signature = sign(payload);
  return c.json({
    manifest,
    signature,
    publicKey: publicKeyHex(),
    algorithm: "ed25519",
    canonicalPayload: payload,
  });
});

// GET /capstones/c/:artifactSlug — public portfolio page.
capstonesRouter.get("/c/:artifactSlug", async (c) => {
  const artifactSlug = c.req.param("artifactSlug")!;
  const db = getDb();

  const enrollment = db
    .select({
      id: capstoneEnrollments.id,
      capstoneId: capstoneEnrollments.capstoneId,
      userId: capstoneEnrollments.userId,
      startedAt: capstoneEnrollments.startedAt,
      completedAt: capstoneEnrollments.completedAt,
      artifactPageSlug: capstoneEnrollments.artifactPageSlug,
      doi: capstoneEnrollments.doi,
    })
    .from(capstoneEnrollments)
    .where(eq(capstoneEnrollments.artifactPageSlug, artifactSlug))
    .get();
  if (!enrollment || !enrollment.completedAt) {
    return c.json({ error: "Artifact not found" }, 404);
  }

  const learner = db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
    })
    .from(users)
    .where(eq(users.id, enrollment.userId))
    .get();
  if (!learner) return c.json({ error: "Artifact not found" }, 404);

  const session = await getSessionUser(c);
  const capstoneDto = await loadCapstoneDto(
    enrollment.capstoneId,
    "undergrad",
    session?.id,
  );
  if (!capstoneDto) return c.json({ error: "Artifact not found" }, 404);

  const subs = db
    .select()
    .from(capstoneSubmissions)
    .where(eq(capstoneSubmissions.enrollmentId, enrollment.id))
    .all();

  // Sprint 39 — bundle peer-review summary (counts + average score)
  // so the artifact header can render the credibility chip without
  // a follow-up request.
  const submissionIds = subs.map((s) => s.id);
  const reviewSummaryRows =
    submissionIds.length > 0
      ? db
          .select({
            submissionId: capstonePeerReviews.submissionId,
            n: sql<number>`COUNT(*)`,
            endorsed: sql<number>`SUM(CASE WHEN ${capstonePeerReviews.status} = 'endorsed' THEN 1 ELSE 0 END)`,
            avgScore: sql<number>`AVG(${capstonePeerReviews.score})`,
          })
          .from(capstonePeerReviews)
          .where(inArray(capstonePeerReviews.submissionId, submissionIds))
          .groupBy(capstonePeerReviews.submissionId)
          .all()
      : [];
  const reviewBySubmission = new Map(
    reviewSummaryRows.map((r) => [r.submissionId, r]),
  );
  const peerReviewSummary = {
    totalReviews: reviewSummaryRows.reduce((s, r) => s + Number(r.n), 0),
    totalEndorsed: reviewSummaryRows.reduce(
      (s, r) => s + Number(r.endorsed),
      0,
    ),
    averageScore:
      reviewSummaryRows.length > 0
        ? reviewSummaryRows.reduce((s, r) => s + Number(r.avgScore), 0) /
          reviewSummaryRows.length
        : null,
  };

  return c.json({
    artifact: {
      capstone: capstoneDto,
      enrollment: {
        id: enrollment.id,
        artifactPageSlug: enrollment.artifactPageSlug!,
        startedAt: enrollment.startedAt,
        completedAt: enrollment.completedAt,
        doi: enrollment.doi,
      },
      learner: {
        id: learner.id,
        username: learner.username,
        displayName: learner.displayName,
      },
      submissions: subs.map((s) => ({
        ...toSubmissionDto(s),
        peerReview: (() => {
          const r = reviewBySubmission.get(s.id);
          if (!r) return { count: 0, endorsed: 0, averageScore: null };
          return {
            count: Number(r.n),
            endorsed: Number(r.endorsed),
            averageScore: Number(r.avgScore),
          };
        })(),
      })),
      peerReviewSummary,
    },
  });
});

// Sprint 39 — Peer review queue. Lists completed enrollments
// ordered by review-deficit (enrollments with the fewest peer
// reviews surface first). Public read so anyone can hop in to
// review.
capstonesRouter.get("/review-queue", async (c) => {
  const db = getDb();
  // Cap at 500 (Phase 18C — bumped from 200). The queue is a
  // per-program admin tool used to surface under-reviewed artifacts;
  // reviewers may want a wider lens across a backlog of completed
  // capstones. The in-memory sort over 3× this candidate set
  // (1,500 rows) is still trivial in SQLite. The bump also keeps
  // freshly-created test fixtures findable against the persistent
  // test DB which accumulates state across runs.
  const limit = Math.min(
    500,
    Math.max(1, parseInt(c.req.query("limit") ?? "20", 10) || 20),
  );

  // Pull completed enrollments + their capstone + author. We compute
  // peer review counts in JS rather than a complex JOIN — the queue
  // is small enough.
  const rows = db
    .select({
      enrollmentId: capstoneEnrollments.id,
      artifactPageSlug: capstoneEnrollments.artifactPageSlug,
      capstoneSlug: capstones.slug,
      capstoneTitle: capstones.title,
      coverEmoji: capstones.coverEmoji,
      learnerId: capstoneEnrollments.userId,
      learnerUsername: users.username,
      learnerDisplayName: users.displayName,
      completedAt: capstoneEnrollments.completedAt,
    })
    .from(capstoneEnrollments)
    .innerJoin(capstones, eq(capstoneEnrollments.capstoneId, capstones.id))
    .innerJoin(users, eq(capstoneEnrollments.userId, users.id))
    .where(
      and(
        sql`${capstoneEnrollments.completedAt} IS NOT NULL`,
        sql`${capstoneEnrollments.artifactPageSlug} IS NOT NULL`,
      ),
    )
    .orderBy(desc(capstoneEnrollments.completedAt))
    .limit(limit * 3) // pull a wider candidate set; rank in JS
    .all();

  if (rows.length === 0) {
    return c.json({ artifacts: [] });
  }

  const enrollmentIds = rows.map((r) => r.enrollmentId);
  // Submissions for these enrollments — to map submissionIds back to
  // enrollments, then count peer reviews per submission and roll up.
  const subRows = db
    .select({
      id: capstoneSubmissions.id,
      enrollmentId: capstoneSubmissions.enrollmentId,
    })
    .from(capstoneSubmissions)
    .where(inArray(capstoneSubmissions.enrollmentId, enrollmentIds))
    .all();

  const submissionToEnrollment = new Map(
    subRows.map((s) => [s.id, s.enrollmentId]),
  );
  const submissionIds = subRows.map((s) => s.id);
  const reviewCountRows =
    submissionIds.length > 0
      ? db
          .select({
            submissionId: capstonePeerReviews.submissionId,
            n: sql<number>`COUNT(*)`,
          })
          .from(capstonePeerReviews)
          .where(inArray(capstonePeerReviews.submissionId, submissionIds))
          .groupBy(capstonePeerReviews.submissionId)
          .all()
      : [];

  const reviewCountByEnrollment = new Map<string, number>();
  for (const r of reviewCountRows) {
    const e = submissionToEnrollment.get(r.submissionId);
    if (!e) continue;
    reviewCountByEnrollment.set(
      e,
      (reviewCountByEnrollment.get(e) ?? 0) + Number(r.n),
    );
  }

  const ranked = rows
    .map((r) => ({
      ...r,
      reviewCount: reviewCountByEnrollment.get(r.enrollmentId) ?? 0,
    }))
    .sort((a, b) => {
      if (a.reviewCount !== b.reviewCount) {
        return a.reviewCount - b.reviewCount;
      }
      return (
        new Date(b.completedAt!).getTime() -
        new Date(a.completedAt!).getTime()
      );
    })
    .slice(0, limit);

  return c.json({
    artifacts: ranked.map((r) => ({
      artifactPageSlug: r.artifactPageSlug!,
      capstoneSlug: r.capstoneSlug,
      capstoneTitle: r.capstoneTitle,
      coverEmoji: r.coverEmoji,
      learnerUsername: r.learnerUsername,
      learnerDisplayName: r.learnerDisplayName,
      completedAt: r.completedAt!,
      peerReviewCount: r.reviewCount,
    })),
  });
});

// GET /capstones/c/:artifactSlug/reviews — public list of peer
// reviews for an artifact, grouped by milestone.
capstonesRouter.get("/c/:artifactSlug/reviews", async (c) => {
  const artifactSlug = c.req.param("artifactSlug")!;
  const db = getDb();

  const enrollment = db
    .select({ id: capstoneEnrollments.id })
    .from(capstoneEnrollments)
    .where(eq(capstoneEnrollments.artifactPageSlug, artifactSlug))
    .get();
  if (!enrollment) return c.json({ error: "Artifact not found" }, 404);

  const subs = db
    .select({
      id: capstoneSubmissions.id,
      milestoneId: capstoneSubmissions.milestoneId,
    })
    .from(capstoneSubmissions)
    .where(eq(capstoneSubmissions.enrollmentId, enrollment.id))
    .all();
  if (subs.length === 0) return c.json({ reviews: [] });

  const submissionIds = subs.map((s) => s.id);
  const submissionToMilestone = new Map(
    subs.map((s) => [s.id, s.milestoneId]),
  );

  const reviewRows = db
    .select({
      id: capstonePeerReviews.id,
      submissionId: capstonePeerReviews.submissionId,
      reviewerId: capstonePeerReviews.reviewerId,
      reviewerUsername: users.username,
      status: capstonePeerReviews.status,
      score: capstonePeerReviews.score,
      feedback: capstonePeerReviews.feedback,
      createdAt: capstonePeerReviews.createdAt,
    })
    .from(capstonePeerReviews)
    .innerJoin(users, eq(capstonePeerReviews.reviewerId, users.id))
    .where(inArray(capstonePeerReviews.submissionId, submissionIds))
    .orderBy(desc(capstonePeerReviews.createdAt))
    .all();

  return c.json({
    reviews: reviewRows.map((r) => ({
      id: r.id,
      submissionId: r.submissionId,
      milestoneId: submissionToMilestone.get(r.submissionId) ?? null,
      reviewerUsername: r.reviewerUsername,
      status: r.status,
      score: r.score,
      feedback: r.feedback,
      createdAt: r.createdAt,
    })),
  });
});

const peerReviewSchema = z.object({
  status: z.enum(["endorsed", "requested_changes"]),
  score: z.number().min(0).max(1),
  feedback: z.string().min(20).max(4000),
});

// POST /capstones/submissions/:submissionId/reviews — submit a peer
// review. Author of the submission cannot review themselves;
// duplicate review by the same reviewer overwrites the prior row.
capstonesRouter.post(
  "/submissions/:submissionId/reviews",
  requireAuth,
  zValidator("json", peerReviewSchema),
  async (c) => {
    const user = c.get("user")!;
    const submissionId = c.req.param("submissionId")!;
    const data = c.req.valid("json");
    const db = getDb();

    const submission = db
      .select({
        id: capstoneSubmissions.id,
        enrollmentId: capstoneSubmissions.enrollmentId,
        status: capstoneSubmissions.status,
      })
      .from(capstoneSubmissions)
      .where(eq(capstoneSubmissions.id, submissionId))
      .get();
    if (!submission) return c.json({ error: "Submission not found" }, 404);

    const enrollment = db
      .select({ userId: capstoneEnrollments.userId })
      .from(capstoneEnrollments)
      .where(eq(capstoneEnrollments.id, submission.enrollmentId))
      .get();
    if (!enrollment) return c.json({ error: "Submission not found" }, 404);
    if (enrollment.userId === user.id) {
      return c.json({ error: "You cannot review your own submission." }, 400);
    }
    if (submission.status !== "passed") {
      return c.json(
        {
          error:
            "Peer review is only available on submissions that have already passed AI grading.",
        },
        400,
      );
    }

    const existing = db
      .select({ id: capstonePeerReviews.id })
      .from(capstonePeerReviews)
      .where(
        and(
          eq(capstonePeerReviews.submissionId, submissionId),
          eq(capstonePeerReviews.reviewerId, user.id),
        ),
      )
      .get();

    if (existing) {
      db.update(capstonePeerReviews)
        .set({
          status: data.status,
          score: data.score,
          feedback: data.feedback,
          createdAt: new Date().toISOString(),
        })
        .where(eq(capstonePeerReviews.id, existing.id))
        .run();
      return c.json({ id: existing.id, updated: true });
    }
    const id = randomUUID();
    db.insert(capstonePeerReviews).values({
      id,
      submissionId,
      reviewerId: user.id,
      status: data.status,
      score: data.score,
      feedback: data.feedback,
    }).run();
    return c.json({ id, updated: false }, 201);
  },
);

// DELETE /capstones/reviews/:id — withdraw your own review.
capstonesRouter.delete("/reviews/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id")!;
  const db = getDb();
  const row = db
    .select({ reviewerId: capstonePeerReviews.reviewerId })
    .from(capstonePeerReviews)
    .where(eq(capstonePeerReviews.id, id))
    .get();
  if (!row) return c.json({ error: "Review not found" }, 404);
  if (row.reviewerId !== user.id) {
    return c.json({ error: "You can only withdraw your own review." }, 403);
  }
  db.delete(capstonePeerReviews)
    .where(eq(capstonePeerReviews.id, id))
    .run();
  return c.json({ ok: true });
});

// GET /capstones/:slug — full brief + milestones (drafts are
// author-only). Bundles `myEnrollment` so the workspace can render
// progress without an extra round-trip.
capstonesRouter.get("/:slug", async (c) => {
  const slug = c.req.param("slug")!;
  const requestedTier = (c.req.query("tier") as Tier) || "undergrad";
  const tier: Tier = (TIERS as string[]).includes(requestedTier)
    ? requestedTier
    : "undergrad";
  const db = getDb();
  const session = await getSessionUser(c);

  const cap = db
    .select()
    .from(capstones)
    .where(eq(capstones.slug, slug))
    .get();
  if (!cap) return c.json({ error: "Capstone not found" }, 404);
  if (cap.status === "draft" && (!session || session.id !== cap.authorId)) {
    return c.json({ error: "Capstone not found" }, 404);
  }

  const dto = await loadCapstoneDto(cap.id, tier, session?.id);
  if (!dto) return c.json({ error: "Capstone not found" }, 404);
  return c.json({ capstone: dto });
});

// Sprint 34 — Citation export. Mirrors /research/:slug/cite. Renders
// the capstone author + summary as a citeable artifact.
capstonesRouter.get("/:slug/cite", async (c) => {
  const slug = c.req.param("slug")!;
  const format = c.req.query("format") ?? "json";
  const db = getDb();
  const row = db
    .select({
      slug: capstones.slug,
      title: capstones.title,
      summary: capstones.summary,
      authorId: capstones.authorId,
      status: capstones.status,
      createdAt: capstones.createdAt,
      doi: capstones.doi,
    })
    .from(capstones)
    .where(eq(capstones.slug, slug))
    .get();
  if (!row) return c.json({ error: "Capstone not found" }, 404);
  if (row.status !== "published") {
    return c.json(
      { error: "Citations are only available for published capstones" },
      404,
    );
  }
  const author = db
    .select({ username: users.username, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, row.authorId))
    .get();
  const primary = author?.displayName || author?.username || "Anonymous";

  const url = `https://axiomic.app/capstones/${row.slug}`;
  const src: CitationSource = {
    kind: "capstone",
    slug: row.slug,
    title: row.title,
    authors: [primary],
    year: new Date(row.createdAt).getUTCFullYear(),
    url,
    doi: row.doi,
    abstract: row.summary,
    publishedAt: row.createdAt,
  };

  if (format === "bibtex" || format === "bib") {
    return new Response(toBibtex(src), {
      headers: {
        "content-type": "application/x-bibtex; charset=utf-8",
        "content-disposition": `inline; filename="${row.slug}.bib"`,
      },
    });
  }
  if (format === "ris") {
    return new Response(toRis(src), {
      headers: {
        "content-type": "application/x-research-info-systems; charset=utf-8",
        "content-disposition": `inline; filename="${row.slug}.ris"`,
      },
    });
  }
  return c.json({
    slug: src.slug,
    title: src.title,
    authors: src.authors,
    year: src.year,
    url: src.url,
    permalink: `/cite/c/${author?.username ?? "anon"}/${row.slug}`,
    bibtex: toBibtex(src),
    ris: toRis(src),
    plain: toPlainText(src),
  });
});

// POST /capstones — create.
capstonesRouter.post(
  "/",
  requireAuth,
  zValidator("json", createSchema),
  async (c) => {
    const user = c.get("user")!;
    const data = c.req.valid("json");
    const db = getDb();

    const collision = db
      .select({ id: capstones.id })
      .from(capstones)
      .where(eq(capstones.slug, data.slug))
      .get();
    if (collision) return c.json({ error: "Slug already in use" }, 409);

    const hasContent =
      (data.contentIntro?.trim().length ?? 0) > 0 ||
      (data.contentUndergrad?.trim().length ?? 0) > 0 ||
      (data.contentGrad?.trim().length ?? 0) > 0;
    if (!hasContent && data.status === "published") {
      return c.json({ error: "Cannot publish a capstone with an empty brief" }, 400);
    }

    const id = randomUUID();
    db.insert(capstones)
      .values({
        id,
        slug: data.slug,
        title: data.title.trim(),
        summary: data.summary?.trim() ?? "",
        contentIntro: data.contentIntro ?? "",
        contentUndergrad: data.contentUndergrad ?? "",
        contentGrad: data.contentGrad ?? "",
        canonicalTier: data.canonicalTier,
        estimatedWeeks: data.estimatedWeeks,
        prerequisiteWikiSlugs: JSON.stringify(data.prerequisiteWikiSlugs ?? []),
        prerequisiteNodeIds: JSON.stringify(data.prerequisiteNodeIds ?? []),
        tags: JSON.stringify(normalizeTags(data.tags)),
        coverEmoji: data.coverEmoji?.slice(0, 8) || "🎓",
        accentColor: data.accentColor ?? "violet",
        status: data.status,
        authorId: user.id,
        scaleTier: data.scaleTier,
        domainsJson: JSON.stringify(data.domains ?? []),
        estimatedHoursMin: data.estimatedHoursMin ?? null,
        estimatedHoursMax: data.estimatedHoursMax ?? null,
        realWorldDeliverableMd: data.realWorldDeliverableMd ?? null,
      })
      .run();

    // S85 — Floor enforcement on publish-as-long_arc. Drafts can be
    // incomplete; the gate fires only when the capstone goes public.
    if (data.scaleTier === "long_arc" && data.status === "published") {
      const floor = runLongArcFloor(id);
      if (!floor.ok) {
        // Roll back the insert; surface structured errors.
        db.delete(capstones).where(eq(capstones.id, id)).run();
        return c.json({ error: "Long-arc floor not met", errors: floor.errors }, 400);
      }
    }

    invalidateSearchIndex();
    if (data.status === "published") {
      snapshotCapstone(id, { editedBy: user.id, editMessage: "Initial publication" });
    }
    return c.json({ capstoneId: id, slug: data.slug }, 201);
  },
);

// PUT /capstones/:slug — update. Author-only.
capstonesRouter.put(
  "/:slug",
  requireAuth,
  zValidator("json", updateSchema),
  async (c) => {
    const slug = c.req.param("slug")!;
    const user = c.get("user")!;
    const data = c.req.valid("json");
    const db = getDb();

    const existing = db
      .select({
        id: capstones.id,
        authorId: capstones.authorId,
        status: capstones.status,
        scaleTier: capstones.scaleTier,
      })
      .from(capstones)
      .where(eq(capstones.slug, slug))
      .get();
    if (!existing) return c.json({ error: "Capstone not found" }, 404);
    if (existing.authorId !== user.id) {
      return c.json({ error: "Only the author can edit this capstone." }, 403);
    }

    const patch: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      lastEditorId: user.id,
    };
    if (data.title != null) patch.title = data.title.trim();
    if (data.summary != null) patch.summary = data.summary.trim();
    if (data.contentIntro != null) patch.contentIntro = data.contentIntro;
    if (data.contentUndergrad != null) patch.contentUndergrad = data.contentUndergrad;
    if (data.contentGrad != null) patch.contentGrad = data.contentGrad;
    if (data.canonicalTier != null) patch.canonicalTier = data.canonicalTier;
    if (data.estimatedWeeks != null) patch.estimatedWeeks = data.estimatedWeeks;
    if (data.prerequisiteWikiSlugs != null) {
      patch.prerequisiteWikiSlugs = JSON.stringify(data.prerequisiteWikiSlugs);
    }
    if (data.prerequisiteNodeIds != null) {
      patch.prerequisiteNodeIds = JSON.stringify(data.prerequisiteNodeIds);
    }
    if (data.tags != null) patch.tags = JSON.stringify(normalizeTags(data.tags));
    if (data.coverEmoji != null) patch.coverEmoji = data.coverEmoji.slice(0, 8) || "🎓";
    if (data.accentColor != null) patch.accentColor = data.accentColor;
    if (data.status != null) patch.status = data.status;
    if (data.scaleTier != null) patch.scaleTier = data.scaleTier;
    if (data.domains != null) patch.domainsJson = JSON.stringify(data.domains);
    if (data.estimatedHoursMin !== undefined) patch.estimatedHoursMin = data.estimatedHoursMin;
    if (data.estimatedHoursMax !== undefined) patch.estimatedHoursMax = data.estimatedHoursMax;
    if (data.realWorldDeliverableMd !== undefined) {
      patch.realWorldDeliverableMd = data.realWorldDeliverableMd;
    }

    db.update(capstones)
      .set(patch)
      .where(eq(capstones.id, existing.id))
      .run();

    invalidateSearchIndex();
    const nowPublished =
      (data.status ?? existing.status) === "published";
    const nowLongArc =
      (data.scaleTier ?? existing.scaleTier) === "long_arc";

    // S85 — Floor enforcement on publish-as-long_arc. Re-runs the
    // validator post-update so authors can't sneak past by editing
    // metadata after creation. On failure we revert the patch so the
    // request is fully rejected.
    if (nowPublished && nowLongArc) {
      const floor = runLongArcFloor(existing.id);
      if (!floor.ok) {
        // Revert: restore the prior status + scaleTier to leave the
        // capstone exactly as it was before this PUT.
        db.update(capstones)
          .set({ status: existing.status, scaleTier: existing.scaleTier })
          .where(eq(capstones.id, existing.id))
          .run();
        return c.json({ error: "Long-arc floor not met", errors: floor.errors }, 400);
      }
    }

    if (nowPublished) {
      snapshotCapstone(existing.id, {
        editedBy: user.id,
        editMessage:
          existing.status !== "published" && data.status === "published"
            ? "Initial publication"
            : null,
      });
    }
    return c.json({ ok: true });
  },
);

// Sprint 35 — Versions list + per-version snapshot endpoints.
capstonesRouter.get("/:slug/versions", async (c) => {
  const slug = c.req.param("slug")!;
  const db = getDb();
  const cap = db
    .select({
      id: capstones.id,
      status: capstones.status,
      currentVersion: capstones.currentVersion,
    })
    .from(capstones)
    .where(eq(capstones.slug, slug))
    .get();
  if (!cap || cap.status !== "published") {
    return c.json({ error: "Capstone not found" }, 404);
  }
  const rows = db
    .select({
      version: capstoneVersions.version,
      title: capstoneVersions.title,
      editedBy: capstoneVersions.editedBy,
      editMessage: capstoneVersions.editMessage,
      createdAt: capstoneVersions.createdAt,
    })
    .from(capstoneVersions)
    .where(eq(capstoneVersions.capstoneId, cap.id))
    .orderBy(asc(capstoneVersions.version))
    .all();
  const editorIds = [
    ...new Set(rows.map((r) => r.editedBy).filter((x): x is string => !!x)),
  ];
  const editors = editorIds.length
    ? db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(inArray(users.id, editorIds))
        .all()
    : [];
  const usernameById = new Map(editors.map((e) => [e.id, e.username]));
  return c.json({
    currentVersion: cap.currentVersion,
    versions: rows.map((r) => ({
      version: r.version,
      title: r.title,
      editorUsername: r.editedBy ? usernameById.get(r.editedBy) ?? null : null,
      editMessage: r.editMessage,
      createdAt: r.createdAt,
    })),
  });
});

capstonesRouter.get("/:slug/versions/:n", async (c) => {
  const slug = c.req.param("slug")!;
  const n = parseInt(c.req.param("n") ?? "0", 10);
  if (!Number.isFinite(n) || n < 1) {
    return c.json({ error: "Invalid version" }, 400);
  }
  const db = getDb();
  const cap = db
    .select({ id: capstones.id, status: capstones.status })
    .from(capstones)
    .where(eq(capstones.slug, slug))
    .get();
  if (!cap || cap.status !== "published") {
    return c.json({ error: "Capstone not found" }, 404);
  }
  const v = db
    .select()
    .from(capstoneVersions)
    .where(
      and(
        eq(capstoneVersions.capstoneId, cap.id),
        eq(capstoneVersions.version, n),
      ),
    )
    .get();
  if (!v) return c.json({ error: "Version not found" }, 404);
  let milestones: any[] = [];
  try {
    const parsed = JSON.parse(v.milestonesJson);
    if (Array.isArray(parsed)) milestones = parsed;
  } catch {}
  const editor = v.editedBy
    ? db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, v.editedBy))
        .get()
    : null;
  return c.json({
    version: v.version,
    title: v.title,
    summary: v.summary,
    contentIntro: v.contentIntro,
    contentUndergrad: v.contentUndergrad,
    contentGrad: v.contentGrad,
    milestones,
    editorUsername: editor?.username ?? null,
    editMessage: v.editMessage,
    createdAt: v.createdAt,
  });
});

// --- milestones ----------------------------------------------------

capstonesRouter.post(
  "/:slug/milestones",
  requireAuth,
  zValidator("json", milestoneCreateSchema),
  async (c) => {
    const slug = c.req.param("slug")!;
    const user = c.get("user")!;
    const data = c.req.valid("json");
    const db = getDb();

    const cap = db
      .select({ id: capstones.id, authorId: capstones.authorId })
      .from(capstones)
      .where(eq(capstones.slug, slug))
      .get();
    if (!cap) return c.json({ error: "Capstone not found" }, 404);
    if (cap.authorId !== user.id) {
      return c.json({ error: "Only the author can edit milestones." }, 403);
    }

    let order = data.order;
    if (order == null) {
      const maxRow = db
        .select({ order: capstoneMilestones.order })
        .from(capstoneMilestones)
        .where(eq(capstoneMilestones.capstoneId, cap.id))
        .orderBy(desc(capstoneMilestones.order))
        .limit(1)
        .get();
      order = (maxRow?.order ?? -1) + 1;
    }

    const id = randomUUID();
    const rubric = data.rubric ?? defaultRubric();
    db.insert(capstoneMilestones)
      .values({
        id,
        capstoneId: cap.id,
        order,
        title: data.title.trim(),
        description: data.description ?? "",
        rubricJson: JSON.stringify(rubric),
        requiredArtifactKinds: JSON.stringify(data.requiredArtifactKinds ?? []),
        runnableTests: data.runnableTests ?? null,
        estimatedDays: data.estimatedDays,
        dueAt: data.dueAt ?? null,
        advisorSignoffRequired: data.advisorSignoffRequired ?? false,
      })
      .run();

    return c.json({ milestoneId: id }, 201);
  },
);

capstonesRouter.put(
  "/:slug/milestones/:id",
  requireAuth,
  zValidator("json", milestoneUpdateSchema),
  async (c) => {
    const slug = c.req.param("slug")!;
    const id = c.req.param("id")!;
    const user = c.get("user")!;
    const data = c.req.valid("json");
    const db = getDb();

    const cap = db
      .select({ id: capstones.id, authorId: capstones.authorId })
      .from(capstones)
      .where(eq(capstones.slug, slug))
      .get();
    if (!cap) return c.json({ error: "Capstone not found" }, 404);
    if (cap.authorId !== user.id) {
      return c.json({ error: "Only the author can edit milestones." }, 403);
    }

    const milestone = db
      .select({ id: capstoneMilestones.id, capstoneId: capstoneMilestones.capstoneId })
      .from(capstoneMilestones)
      .where(eq(capstoneMilestones.id, id))
      .get();
    if (!milestone || milestone.capstoneId !== cap.id) {
      return c.json({ error: "Milestone not found" }, 404);
    }

    const patch: Record<string, unknown> = {};
    if (data.title != null) patch.title = data.title.trim();
    if (data.description != null) patch.description = data.description;
    if (data.rubric != null) patch.rubricJson = JSON.stringify(data.rubric);
    if (data.requiredArtifactKinds != null) {
      patch.requiredArtifactKinds = JSON.stringify(data.requiredArtifactKinds);
    }
    if (data.runnableTests !== undefined) patch.runnableTests = data.runnableTests;
    if (data.estimatedDays != null) patch.estimatedDays = data.estimatedDays;
    if (data.order != null) patch.order = data.order;
    if (data.dueAt !== undefined) patch.dueAt = data.dueAt;
    if (data.advisorSignoffRequired !== undefined) {
      patch.advisorSignoffRequired = data.advisorSignoffRequired;
    }

    if (Object.keys(patch).length === 0) return c.json({ ok: true });

    db.update(capstoneMilestones)
      .set(patch)
      .where(eq(capstoneMilestones.id, id))
      .run();
    return c.json({ ok: true });
  },
);

capstonesRouter.delete("/:slug/milestones/:id", requireAuth, async (c) => {
  const slug = c.req.param("slug")!;
  const id = c.req.param("id")!;
  const user = c.get("user")!;
  const db = getDb();

  const cap = db
    .select({ id: capstones.id, authorId: capstones.authorId })
    .from(capstones)
    .where(eq(capstones.slug, slug))
    .get();
  if (!cap) return c.json({ error: "Capstone not found" }, 404);
  if (cap.authorId !== user.id) {
    return c.json({ error: "Only the author can edit milestones." }, 403);
  }

  const milestone = db
    .select({ id: capstoneMilestones.id, capstoneId: capstoneMilestones.capstoneId })
    .from(capstoneMilestones)
    .where(eq(capstoneMilestones.id, id))
    .get();
  if (!milestone || milestone.capstoneId !== cap.id) {
    return c.json({ error: "Milestone not found" }, 404);
  }

  db.delete(capstoneMilestones).where(eq(capstoneMilestones.id, id)).run();
  return c.json({ ok: true });
});

// --- enrollment + submissions (Sprint 27) --------------------------

// POST /capstones/:slug/enroll — idempotent. Returns the enrollment row.
capstonesRouter.post("/:slug/enroll", requireAuth, async (c) => {
  const slug = c.req.param("slug")!;
  const user = c.get("user")!;
  const db = getDb();

  const cap = db
    .select({
      id: capstones.id,
      authorId: capstones.authorId,
      status: capstones.status,
    })
    .from(capstones)
    .where(eq(capstones.slug, slug))
    .get();
  if (!cap || cap.status !== "published") {
    return c.json({ error: "Capstone not found" }, 404);
  }
  if (cap.authorId === user.id) {
    return c.json({ error: "Authors don't enroll in their own capstone." }, 400);
  }

  const existing = db
    .select()
    .from(capstoneEnrollments)
    .where(
      and(
        eq(capstoneEnrollments.capstoneId, cap.id),
        eq(capstoneEnrollments.userId, user.id),
      ),
    )
    .get();
  if (existing) return c.json({ enrollmentId: existing.id });

  const id = randomUUID();
  db.insert(capstoneEnrollments)
    .values({
      id,
      capstoneId: cap.id,
      userId: user.id,
    })
    .run();
  return c.json({ enrollmentId: id }, 201);
});

// POST /capstones/:slug/milestones/:milestoneId/submit — auth, learner-only.
capstonesRouter.post(
  "/:slug/milestones/:milestoneId/submit",
  requireAuth,
  zValidator("json", submitSchema),
  async (c) => {
    const slug = c.req.param("slug")!;
    const milestoneId = c.req.param("milestoneId")!;
    const user = c.get("user")!;
    const data = c.req.valid("json");
    const db = getDb();

    const cap = db
      .select({ id: capstones.id })
      .from(capstones)
      .where(eq(capstones.slug, slug))
      .get();
    if (!cap) return c.json({ error: "Capstone not found" }, 404);

    const milestone = db
      .select()
      .from(capstoneMilestones)
      .where(eq(capstoneMilestones.id, milestoneId))
      .get();
    if (!milestone || milestone.capstoneId !== cap.id) {
      return c.json({ error: "Milestone not found" }, 404);
    }

    const enrollment = db
      .select()
      .from(capstoneEnrollments)
      .where(
        and(
          eq(capstoneEnrollments.capstoneId, cap.id),
          eq(capstoneEnrollments.userId, user.id),
        ),
      )
      .get();
    if (!enrollment) {
      return c.json({ error: "Enroll before submitting milestones." }, 400);
    }

    // Required-artifact-kinds gate.
    const requiredKinds = safeParseStrArray(milestone.requiredArtifactKinds);
    if (requiredKinds.length > 0) {
      const haveKinds = new Set<string>(data.artifacts.map((a) => a.kind));
      const missing = requiredKinds.filter((k) => !haveKinds.has(k));
      if (missing.length > 0) {
        return c.json(
          { error: `Missing required artifact kinds: ${missing.join(", ")}` },
          400,
        );
      }
    }

    const rubric = safeParseJson(milestone.rubricJson, defaultRubric());
    const grade = await gradeMilestoneSubmission({
      milestoneTitle: milestone.title,
      milestoneDescription: milestone.description,
      rubric,
      writeup: data.writeup,
      artifacts: data.artifacts,
      runnableTestResults: data.runnableTestResults,
      labState: data.labState,
    });

    const status =
      grade.score >= rubric.passingScore ? "passed" : "needs_revision";
    const now = new Date().toISOString();

    const existing = db
      .select({ id: capstoneSubmissions.id })
      .from(capstoneSubmissions)
      .where(
        and(
          eq(capstoneSubmissions.enrollmentId, enrollment.id),
          eq(capstoneSubmissions.milestoneId, milestone.id),
        ),
      )
      .get();

    let submissionId: string;
    if (existing) {
      submissionId = existing.id;
      db.update(capstoneSubmissions)
        .set({
          artifactsJson: JSON.stringify(data.artifacts),
          writeup: data.writeup,
          status,
          aiGradeJson: JSON.stringify(grade),
          runnableTestResultsJson: data.runnableTestResults
            ? JSON.stringify(data.runnableTestResults)
            : null,
          labStateJson: data.labState ? JSON.stringify(data.labState) : null,
          submittedAt: now,
          gradedAt: now,
        })
        .where(eq(capstoneSubmissions.id, existing.id))
        .run();
    } else {
      submissionId = randomUUID();
      db.insert(capstoneSubmissions)
        .values({
          id: submissionId,
          enrollmentId: enrollment.id,
          milestoneId: milestone.id,
          artifactsJson: JSON.stringify(data.artifacts),
          writeup: data.writeup,
          status,
          aiGradeJson: JSON.stringify(grade),
          runnableTestResultsJson: data.runnableTestResults
            ? JSON.stringify(data.runnableTestResults)
            : null,
          labStateJson: data.labState ? JSON.stringify(data.labState) : null,
          submittedAt: now,
          gradedAt: now,
        })
        .run();
    }

    // Did the learner just pass every milestone in this capstone?
    if (status === "passed") {
      await maybeCompleteEnrollment(enrollment.id, cap.id, user);
    }

    const updated = db
      .select()
      .from(capstoneSubmissions)
      .where(eq(capstoneSubmissions.id, submissionId))
      .get();
    return c.json({ submission: updated ? toSubmissionDto(updated) : null }, 201);
  },
);

// --- DTO helpers ---------------------------------------------------

function defaultRubric() {
  return {
    criteria: [
      {
        id: "default",
        weight: 1,
        description: "Submission demonstrates understanding.",
        aiPrompt:
          "Score the submission on whether it demonstrates clear understanding of the milestone topic. " +
          "Reward concrete examples and specific reasoning; penalise vague restatement.",
      },
    ],
    passingScore: 0.6,
    notes: undefined,
  };
}

function toSubmissionDto(row: typeof capstoneSubmissions.$inferSelect) {
  return {
    id: row.id,
    enrollmentId: row.enrollmentId,
    milestoneId: row.milestoneId,
    artifacts: safeParseJson(row.artifactsJson, [] as unknown[]) as Array<{
      kind: string;
      url: string;
      label: string;
      description?: string;
    }>,
    writeup: row.writeup,
    status: row.status as "pending" | "passed" | "needs_revision",
    aiGrade: row.aiGradeJson
      ? safeParseJson(row.aiGradeJson, null) as Record<string, unknown> | null
      : null,
    runnableTestResults: row.runnableTestResultsJson
      ? (safeParseJson(row.runnableTestResultsJson, []) as Array<{
          name: string;
          passed: boolean;
          message?: string;
        }>)
      : null,
    labState: row.labStateJson
      ? safeParseJson<Record<string, unknown>>(row.labStateJson, {})
      : null,
    submittedAt: row.submittedAt,
    gradedAt: row.gradedAt,
  };
}

async function loadCapstoneDto(
  capstoneId: string,
  tier: Tier,
  viewerId: string | undefined,
) {
  const db = getDb();
  const row = db
    .select({
      id: capstones.id,
      slug: capstones.slug,
      title: capstones.title,
      summary: capstones.summary,
      contentIntro: capstones.contentIntro,
      contentUndergrad: capstones.contentUndergrad,
      contentGrad: capstones.contentGrad,
      canonicalTier: capstones.canonicalTier,
      estimatedWeeks: capstones.estimatedWeeks,
      prerequisiteWikiSlugs: capstones.prerequisiteWikiSlugs,
      prerequisiteNodeIds: capstones.prerequisiteNodeIds,
      tags: capstones.tags,
      coverEmoji: capstones.coverEmoji,
      accentColor: capstones.accentColor,
      status: capstones.status,
      currentVersion: capstones.currentVersion,
      doi: capstones.doi,
      authorId: capstones.authorId,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
      scaleTier: capstones.scaleTier,
      domainsJson: capstones.domainsJson,
      estimatedHoursMin: capstones.estimatedHoursMin,
      estimatedHoursMax: capstones.estimatedHoursMax,
      realWorldDeliverableMd: capstones.realWorldDeliverableMd,
      createdAt: capstones.createdAt,
      updatedAt: capstones.updatedAt,
    })
    .from(capstones)
    .innerJoin(users, eq(capstones.authorId, users.id))
    .where(eq(capstones.id, capstoneId))
    .get();
  if (!row) return null;

  const picked = pickContent(row, tier);
  const availableTiers: Tier[] = [];
  if (row.contentIntro.trim().length > 0) availableTiers.push("intro");
  if (row.contentUndergrad.trim().length > 0) availableTiers.push("undergrad");
  if (row.contentGrad.trim().length > 0) availableTiers.push("grad");

  const milestoneRows = db
    .select()
    .from(capstoneMilestones)
    .where(eq(capstoneMilestones.capstoneId, row.id))
    .orderBy(asc(capstoneMilestones.order))
    .all();

  let myEnrollment: ReturnType<typeof buildEnrollmentSummary> | null = null;
  if (viewerId) {
    const e = db
      .select()
      .from(capstoneEnrollments)
      .where(
        and(
          eq(capstoneEnrollments.capstoneId, row.id),
          eq(capstoneEnrollments.userId, viewerId),
        ),
      )
      .get();
    if (e) {
      const subs = db
        .select()
        .from(capstoneSubmissions)
        .where(eq(capstoneSubmissions.enrollmentId, e.id))
        .all();
      myEnrollment = buildEnrollmentSummary(e, subs);
    }
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    brief: picked.content,
    tier: picked.tier,
    requestedTier: tier,
    availableTiers,
    allContent: {
      intro: row.contentIntro,
      undergrad: row.contentUndergrad,
      grad: row.contentGrad,
    },
    canonicalTier: row.canonicalTier as Tier,
    estimatedWeeks: row.estimatedWeeks,
    prerequisiteWikiSlugs: safeParseStrArray(row.prerequisiteWikiSlugs),
    prerequisiteNodeIds: safeParseStrArray(row.prerequisiteNodeIds),
    tags: safeParseStrArray(row.tags),
    coverEmoji: row.coverEmoji,
    accentColor: row.accentColor,
    status: row.status,
    doi: row.doi,
    authorId: row.authorId,
    authorUsername: row.authorUsername,
    authorDisplayName: row.authorDisplayName,
    isAuthor: viewerId === row.authorId,
    milestones: milestoneRows.map((m) => ({
      id: m.id,
      capstoneId: m.capstoneId,
      order: m.order,
      title: m.title,
      description: m.description,
      rubric: safeParseJson(m.rubricJson, defaultRubric()),
      requiredArtifactKinds: safeParseStrArray(m.requiredArtifactKinds),
      runnableTests: m.runnableTests,
      estimatedDays: m.estimatedDays,
      dueAt: m.dueAt,
      advisorSignoffRequired: !!m.advisorSignoffRequired,
      createdAt: m.createdAt,
    })),
    myEnrollment,
    currentVersion: row.currentVersion,
    scaleTier: row.scaleTier,
    domains: safeParseStrArray(row.domainsJson),
    estimatedHoursMin: row.estimatedHoursMin,
    estimatedHoursMax: row.estimatedHoursMax,
    realWorldDeliverableMd: row.realWorldDeliverableMd,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function buildEnrollmentSummary(
  enrollment: typeof capstoneEnrollments.$inferSelect,
  subs: Array<typeof capstoneSubmissions.$inferSelect>,
) {
  const passed: string[] = [];
  const pending: string[] = [];
  const revisions: string[] = [];
  for (const s of subs) {
    if (s.status === "passed") passed.push(s.milestoneId);
    else if (s.status === "needs_revision") revisions.push(s.milestoneId);
    else pending.push(s.milestoneId);
  }
  return {
    id: enrollment.id,
    startedAt: enrollment.startedAt,
    completedAt: enrollment.completedAt,
    artifactPageSlug: enrollment.artifactPageSlug,
    passedMilestoneIds: passed,
    pendingMilestoneIds: pending,
    needsRevisionMilestoneIds: revisions,
  };
}

async function maybeCompleteEnrollment(
  enrollmentId: string,
  capstoneId: string,
  user: { id: string; username: string },
) {
  const db = getDb();
  const milestones = db
    .select({ id: capstoneMilestones.id })
    .from(capstoneMilestones)
    .where(eq(capstoneMilestones.capstoneId, capstoneId))
    .all();
  if (milestones.length === 0) return;
  const milestoneIds = new Set(milestones.map((m) => m.id));

  const subs = db
    .select({
      milestoneId: capstoneSubmissions.milestoneId,
      status: capstoneSubmissions.status,
    })
    .from(capstoneSubmissions)
    .where(eq(capstoneSubmissions.enrollmentId, enrollmentId))
    .all();
  const passed = new Set(
    subs.filter((s) => s.status === "passed").map((s) => s.milestoneId),
  );
  for (const id of milestoneIds) {
    if (!passed.has(id)) return;
  }

  const cap = db
    .select({ slug: capstones.slug })
    .from(capstones)
    .where(eq(capstones.id, capstoneId))
    .get();
  if (!cap) return;
  const artifactSlug = `${user.username}-${cap.slug}`;

  db.update(capstoneEnrollments)
    .set({
      completedAt: new Date().toISOString(),
      artifactPageSlug: artifactSlug,
    })
    .where(eq(capstoneEnrollments.id, enrollmentId))
    .run();

  // Sprint 52 — completing this capstone may have crossed a track's
  // threshold. Mint any newly-eligible track completions and notify
  // the learner.
  try {
    const minted = maybeMintTrackCompletions(user.id);
    for (const m of minted) {
      notifyTrackCompletion(user.id, m.trackId, m.trackSlug, m.artifactPageSlug);
    }
  } catch (err) {
    console.warn("[capstones] track-completion mint failed", err);
  }
}

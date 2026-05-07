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
import { and, asc, desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  capstoneEnrollments,
  capstoneMilestones,
  capstoneSubmissions,
  capstones,
  getDb,
  users,
} from "@axiomic/db";
import { requireAuth, getSessionUser } from "../middleware/auth";
import { invalidateSearchIndex } from "../lib/searchIndex";
import { gradeMilestoneSubmission } from "../lib/capstoneGrader";
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

// --- routes ---------------------------------------------------------

// GET /capstones — list published capstones with milestone counts.
capstonesRouter.get("/", async (c) => {
  const db = getDb();
  const tag = c.req.query("tag")?.toLowerCase();
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
      createdAt: capstones.createdAt,
      updatedAt: capstones.updatedAt,
    })
    .from(capstones)
    .innerJoin(users, eq(capstones.authorId, users.id))
    .where(eq(capstones.status, "published"))
    .orderBy(desc(capstones.createdAt))
    .all();

  const filtered = tag
    ? rows.filter((r) => safeParseStrArray(r.tags).includes(tag))
    : rows;

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

  return c.json({
    artifact: {
      capstone: capstoneDto,
      enrollment: {
        id: enrollment.id,
        artifactPageSlug: enrollment.artifactPageSlug!,
        startedAt: enrollment.startedAt,
        completedAt: enrollment.completedAt,
      },
      learner: {
        id: learner.id,
        username: learner.username,
        displayName: learner.displayName,
      },
      submissions: subs.map(toSubmissionDto),
    },
  });
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
      })
      .run();

    invalidateSearchIndex();
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
      .select({ id: capstones.id, authorId: capstones.authorId })
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

    db.update(capstones)
      .set(patch)
      .where(eq(capstones.id, existing.id))
      .run();

    invalidateSearchIndex();
    return c.json({ ok: true });
  },
);

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
      authorId: capstones.authorId,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
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
      createdAt: m.createdAt,
    })),
    myEnrollment,
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
}

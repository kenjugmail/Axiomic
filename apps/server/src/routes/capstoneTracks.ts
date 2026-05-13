// Sprint 52 — Capstone tracks router.
//
// A track is a curated bundle of capstones (e.g. "ML Engineer" track =
// transformer-from-scratch → fine-tuning → training-stability →
// inference-optimization). Completion is auto-minted by
// `maybeMintTrackCompletions` when the learner finishes the last
// required sub-capstone; the row carries a signed manifest so the
// public artifact at /tracks/c/:slug is independently verifiable.
//
// Authoring is open in v1 (any signed-in user can create a track and
// pick public capstones to include); the admin approval gate (S52c)
// does not extend to tracks because tracks are derived data — they
// don't hold body content the way lessons / news / wiki do.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  capstoneEnrollments,
  capstoneTrackCapstones,
  capstoneTrackCompletions,
  capstoneTracks,
  capstones,
  getDb,
  users,
} from "@axiomic/db";
import { requireAuth, getSessionUser } from "../middleware/auth";
import { maybeMintTrackCompletions } from "../lib/capstoneTrackCompletion";
import type { Env } from "../env";

export const capstoneTracksRouter = new Hono<Env>();

type Tier = "intro" | "undergrad" | "grad";

function pickTier(
  row: {
    contentIntro: string;
    contentUndergrad: string;
    contentGrad: string;
    canonicalTier: string;
  },
  requested: Tier,
): { tier: Tier; content: string } {
  const map: Record<Tier, string> = {
    intro: row.contentIntro,
    undergrad: row.contentUndergrad,
    grad: row.contentGrad,
  };
  if (map[requested] && map[requested].trim().length > 0) {
    return { tier: requested, content: map[requested] };
  }
  const canonical = row.canonicalTier as Tier;
  if (map[canonical] && map[canonical].trim().length > 0) {
    return { tier: canonical, content: map[canonical] };
  }
  // Fallback to whichever has content.
  for (const t of ["undergrad", "grad", "intro"] as Tier[]) {
    if (map[t] && map[t].trim().length > 0) return { tier: t, content: map[t] };
  }
  return { tier: requested, content: "" };
}

function safeParseStrArray(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.filter((s): s is string => typeof s === "string");
  } catch {
    return [];
  }
}

// --- list ------------------------------------------------------------

// GET /tracks — published only.
capstoneTracksRouter.get("/", async (c) => {
  const db = getDb();
  const session = await getSessionUser(c);
  const rows = db
    .select()
    .from(capstoneTracks)
    .where(eq(capstoneTracks.status, "published"))
    .orderBy(desc(capstoneTracks.updatedAt))
    .all();

  if (rows.length === 0) return c.json({ tracks: [] });

  const trackIds = rows.map((t) => t.id);
  const counts = db
    .select({
      trackId: capstoneTrackCapstones.trackId,
      capstoneId: capstoneTrackCapstones.capstoneId,
      optional: capstoneTrackCapstones.optional,
    })
    .from(capstoneTrackCapstones)
    .where(inArray(capstoneTrackCapstones.trackId, trackIds))
    .all();
  const completions = db
    .select({
      trackId: capstoneTrackCompletions.trackId,
      userId: capstoneTrackCompletions.userId,
    })
    .from(capstoneTrackCompletions)
    .where(inArray(capstoneTrackCompletions.trackId, trackIds))
    .all();

  // Phase 16D — per-user progress map keyed by trackId. Counts how
  // many required capstones in each track this user has completed.
  // Lets the client group tracks into "In progress" / "Recommended"
  // / "All" without an extra round-trip.
  const myCompletedByTrack = new Map<string, number>();
  if (session) {
    const myCompletedCapstones = new Set(
      db
        .select({ capstoneId: capstoneEnrollments.capstoneId })
        .from(capstoneEnrollments)
        .where(
          and(
            eq(capstoneEnrollments.userId, session.id),
            sql`${capstoneEnrollments.completedAt} IS NOT NULL`,
          ),
        )
        .all()
        .map((r) => r.capstoneId),
    );
    for (const link of counts) {
      if (link.optional !== 0) continue;
      if (myCompletedCapstones.has(link.capstoneId)) {
        myCompletedByTrack.set(
          link.trackId,
          (myCompletedByTrack.get(link.trackId) ?? 0) + 1,
        );
      }
    }
  }

  const tracks = rows.map((t) => {
    const links = counts.filter((c) => c.trackId === t.id);
    const required = links.filter((l) => l.optional === 0).length;
    const optional = links.filter((l) => l.optional === 1).length;
    const earnedBy = completions.filter((c) => c.trackId === t.id).length;
    const summary = t.summary;
    return {
      id: t.id,
      slug: t.slug,
      title: t.title,
      summary,
      coverEmoji: t.coverEmoji,
      accentColor: t.accentColor,
      tags: safeParseStrArray(t.tags),
      capstoneCount: links.length,
      requiredCount: required,
      optionalCount: optional,
      earnedBy,
      updatedAt: t.updatedAt,
      myCompletedRequired: myCompletedByTrack.get(t.id) ?? 0,
    };
  });

  return c.json({ tracks });
});

// --- detail ----------------------------------------------------------

// GET /tracks/:slug — full track + ordered capstones with the caller's
// per-capstone status when authenticated.
capstoneTracksRouter.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const tierParam = (c.req.query("tier") as Tier | undefined) ?? "undergrad";
  const db = getDb();
  const me = await getSessionUser(c);

  const track = db
    .select()
    .from(capstoneTracks)
    .where(eq(capstoneTracks.slug, slug))
    .get();
  if (!track) return c.json({ error: "Not found" }, 404);
  if (track.status !== "published" && me?.id !== track.authorId && me?.role !== "admin") {
    return c.json({ error: "Not found" }, 404);
  }

  const links = db
    .select()
    .from(capstoneTrackCapstones)
    .where(eq(capstoneTrackCapstones.trackId, track.id))
    .orderBy(asc(capstoneTrackCapstones.order))
    .all();

  const capstoneIds = links.map((l) => l.capstoneId);
  const caps =
    capstoneIds.length === 0
      ? []
      : db
          .select({
            id: capstones.id,
            slug: capstones.slug,
            title: capstones.title,
            summary: capstones.summary,
            coverEmoji: capstones.coverEmoji,
            accentColor: capstones.accentColor,
            estimatedWeeks: capstones.estimatedWeeks,
            status: capstones.status,
          })
          .from(capstones)
          .where(inArray(capstones.id, capstoneIds))
          .all();
  const capById = new Map(caps.map((c) => [c.id, c]));

  let myEnrollments: Map<string, { completedAt: string | null; artifactPageSlug: string | null }> =
    new Map();
  let myCompletion: {
    artifactPageSlug: string;
    completedAt: string;
  } | null = null;
  if (me) {
    const enrollments = db
      .select({
        capstoneId: capstoneEnrollments.capstoneId,
        completedAt: capstoneEnrollments.completedAt,
        artifactPageSlug: capstoneEnrollments.artifactPageSlug,
      })
      .from(capstoneEnrollments)
      .where(
        and(
          eq(capstoneEnrollments.userId, me.id),
          capstoneIds.length > 0
            ? inArray(capstoneEnrollments.capstoneId, capstoneIds)
            : sql`1=0`,
        ),
      )
      .all();
    myEnrollments = new Map(
      enrollments.map((e) => [
        e.capstoneId,
        {
          completedAt: e.completedAt,
          artifactPageSlug: e.artifactPageSlug,
        },
      ]),
    );
    const completion = db
      .select()
      .from(capstoneTrackCompletions)
      .where(
        and(
          eq(capstoneTrackCompletions.trackId, track.id),
          eq(capstoneTrackCompletions.userId, me.id),
        ),
      )
      .get();
    if (completion) {
      myCompletion = {
        artifactPageSlug: completion.artifactPageSlug,
        completedAt: completion.completedAt,
      };
    }
  }

  const totalEstimatedWeeks = links.reduce((sum, l) => {
    const cap = capById.get(l.capstoneId);
    return sum + (cap?.estimatedWeeks ?? 0);
  }, 0);

  const picked = pickTier(track, tierParam);

  return c.json({
    track: {
      id: track.id,
      slug: track.slug,
      title: track.title,
      summary: track.summary,
      coverEmoji: track.coverEmoji,
      accentColor: track.accentColor,
      tags: safeParseStrArray(track.tags),
      status: track.status,
      doi: track.doi,
      authorId: track.authorId,
      canonicalTier: track.canonicalTier,
      content: picked.content,
      tier: picked.tier,
      allContent: {
        intro: track.contentIntro,
        undergrad: track.contentUndergrad,
        grad: track.contentGrad,
      },
      totalEstimatedWeeks,
      createdAt: track.createdAt,
      updatedAt: track.updatedAt,
    },
    capstones: links
      .map((l) => {
        const cap = capById.get(l.capstoneId);
        if (!cap) return null;
        const enr = myEnrollments.get(l.capstoneId);
        const status = enr?.completedAt
          ? "completed"
          : enr
            ? "in_progress"
            : "not_started";
        return {
          slug: cap.slug,
          title: cap.title,
          summary: cap.summary,
          coverEmoji: cap.coverEmoji,
          accentColor: cap.accentColor,
          estimatedWeeks: cap.estimatedWeeks,
          order: l.order,
          optional: l.optional === 1,
          status,
          artifactPageSlug: enr?.artifactPageSlug ?? null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
    myCompletion,
  });
});

// --- create ----------------------------------------------------------

const createTrackSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string().min(2).max(200),
  summary: z.string().max(500).default(""),
  contentIntro: z.string().default(""),
  contentUndergrad: z.string().default(""),
  contentGrad: z.string().default(""),
  canonicalTier: z.enum(["intro", "undergrad", "grad"]).default("undergrad"),
  coverEmoji: z.string().max(8).default("🎯"),
  accentColor: z.string().max(40).default("violet"),
  tags: z.array(z.string()).default([]),
  status: z.enum(["draft", "published"]).default("draft"),
});

capstoneTracksRouter.post(
  "/",
  requireAuth,
  zValidator("json", createTrackSchema),
  async (c) => {
    const me = c.get("user");
    const body = c.req.valid("json");
    const db = getDb();

    const existing = db
      .select({ id: capstoneTracks.id })
      .from(capstoneTracks)
      .where(eq(capstoneTracks.slug, body.slug))
      .get();
    if (existing) {
      return c.json({ error: "Slug already in use" }, 409);
    }

    const id = randomUUID();
    db.insert(capstoneTracks)
      .values({
        id,
        slug: body.slug,
        title: body.title,
        summary: body.summary,
        contentIntro: body.contentIntro,
        contentUndergrad: body.contentUndergrad,
        contentGrad: body.contentGrad,
        canonicalTier: body.canonicalTier,
        coverEmoji: body.coverEmoji,
        accentColor: body.accentColor,
        tags: JSON.stringify(body.tags),
        status: body.status,
        authorId: me.id,
      })
      .run();

    return c.json({ id, slug: body.slug }, 201);
  },
);

// --- update ----------------------------------------------------------

const updateTrackSchema = createTrackSchema.partial();

capstoneTracksRouter.put(
  "/:slug",
  requireAuth,
  zValidator("json", updateTrackSchema),
  async (c) => {
    const me = c.get("user");
    const slug = c.req.param("slug");
    const body = c.req.valid("json");
    const db = getDb();

    const track = db
      .select()
      .from(capstoneTracks)
      .where(eq(capstoneTracks.slug, slug))
      .get();
    if (!track) return c.json({ error: "Not found" }, 404);
    if (track.authorId !== me.id && me.role !== "admin") {
      return c.json({ error: "Forbidden" }, 403);
    }

    const updates: Record<string, unknown> = {
      lastEditorId: me.id,
      updatedAt: new Date().toISOString(),
    };
    if (body.title !== undefined) updates.title = body.title;
    if (body.summary !== undefined) updates.summary = body.summary;
    if (body.contentIntro !== undefined) updates.contentIntro = body.contentIntro;
    if (body.contentUndergrad !== undefined)
      updates.contentUndergrad = body.contentUndergrad;
    if (body.contentGrad !== undefined) updates.contentGrad = body.contentGrad;
    if (body.canonicalTier !== undefined)
      updates.canonicalTier = body.canonicalTier;
    if (body.coverEmoji !== undefined) updates.coverEmoji = body.coverEmoji;
    if (body.accentColor !== undefined) updates.accentColor = body.accentColor;
    if (body.tags !== undefined) updates.tags = JSON.stringify(body.tags);
    if (body.status !== undefined) updates.status = body.status;

    db.update(capstoneTracks)
      .set(updates as typeof capstoneTracks.$inferInsert)
      .where(eq(capstoneTracks.id, track.id))
      .run();

    return c.json({ ok: true });
  },
);

// --- attach / detach / reorder capstones -----------------------------

const attachSchema = z.object({
  capstoneSlug: z.string(),
  order: z.number().int().nonnegative().default(0),
  optional: z.boolean().default(false),
});

capstoneTracksRouter.post(
  "/:slug/capstones",
  requireAuth,
  zValidator("json", attachSchema),
  async (c) => {
    const me = c.get("user");
    const slug = c.req.param("slug");
    const body = c.req.valid("json");
    const db = getDb();

    const track = db
      .select()
      .from(capstoneTracks)
      .where(eq(capstoneTracks.slug, slug))
      .get();
    if (!track) return c.json({ error: "Not found" }, 404);
    if (track.authorId !== me.id && me.role !== "admin") {
      return c.json({ error: "Forbidden" }, 403);
    }

    const cap = db
      .select({ id: capstones.id })
      .from(capstones)
      .where(eq(capstones.slug, body.capstoneSlug))
      .get();
    if (!cap) return c.json({ error: "Capstone not found" }, 404);

    const existing = db
      .select()
      .from(capstoneTrackCapstones)
      .where(
        and(
          eq(capstoneTrackCapstones.trackId, track.id),
          eq(capstoneTrackCapstones.capstoneId, cap.id),
        ),
      )
      .get();
    if (existing) {
      // Update in place.
      db.update(capstoneTrackCapstones)
        .set({ order: body.order, optional: body.optional ? 1 : 0 })
        .where(
          and(
            eq(capstoneTrackCapstones.trackId, track.id),
            eq(capstoneTrackCapstones.capstoneId, cap.id),
          ),
        )
        .run();
      return c.json({ ok: true });
    }

    db.insert(capstoneTrackCapstones)
      .values({
        trackId: track.id,
        capstoneId: cap.id,
        order: body.order,
        optional: body.optional ? 1 : 0,
      })
      .run();
    return c.json({ ok: true }, 201);
  },
);

capstoneTracksRouter.delete(
  "/:slug/capstones/:capstoneSlug",
  requireAuth,
  async (c) => {
    const me = c.get("user");
    const slug = c.req.param("slug");
    const capstoneSlug = c.req.param("capstoneSlug");
    if (!slug || !capstoneSlug) return c.json({ error: "Not found" }, 404);
    const db = getDb();

    const track = db
      .select()
      .from(capstoneTracks)
      .where(eq(capstoneTracks.slug, slug))
      .get();
    if (!track) return c.json({ error: "Not found" }, 404);
    if (track.authorId !== me.id && me.role !== "admin") {
      return c.json({ error: "Forbidden" }, 403);
    }

    const cap = db
      .select({ id: capstones.id })
      .from(capstones)
      .where(eq(capstones.slug, capstoneSlug))
      .get();
    if (!cap) return c.json({ error: "Not found" }, 404);

    db.delete(capstoneTrackCapstones)
      .where(
        and(
          eq(capstoneTrackCapstones.trackId, track.id),
          eq(capstoneTrackCapstones.capstoneId, cap.id),
        ),
      )
      .run();
    return c.json({ ok: true });
  },
);

// --- public artifact page --------------------------------------------

// GET /tracks/c/:artifactSlug — public completion artifact.
capstoneTracksRouter.get("/c/:artifactSlug", async (c) => {
  const artifactSlug = c.req.param("artifactSlug");
  const db = getDb();

  const completion = db
    .select()
    .from(capstoneTrackCompletions)
    .where(eq(capstoneTrackCompletions.artifactPageSlug, artifactSlug))
    .get();
  if (!completion) return c.json({ error: "Not found" }, 404);

  const track = db
    .select()
    .from(capstoneTracks)
    .where(eq(capstoneTracks.id, completion.trackId))
    .get();
  const learner = db
    .select({ username: users.username, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, completion.userId))
    .get();
  if (!track || !learner) return c.json({ error: "Not found" }, 404);

  let manifest: unknown = null;
  let signature: string | null = null;
  try {
    const parsed = JSON.parse(completion.signedTranscriptJson);
    manifest = parsed.manifest;
    signature = parsed.signature ?? null;
  } catch {
    /* manifest may be empty for legacy rows */
  }

  return c.json({
    artifactPageSlug: completion.artifactPageSlug,
    completedAt: completion.completedAt,
    track: {
      slug: track.slug,
      title: track.title,
      summary: track.summary,
      coverEmoji: track.coverEmoji,
      accentColor: track.accentColor,
      doi: track.doi,
    },
    learner: {
      username: learner.username,
      displayName: learner.displayName,
    },
    manifest,
    signature,
  });
});

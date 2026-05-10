// Sprint 79 — Lab protocols router.
//
// Read-only library content + author CRUD. Mirrors the research papers
// route shape (slug + tiered bodies + status + version snapshot) but
// replaces the prose-paper structure with ordered procedure steps and
// safety metadata. Protocol runs (S80) and bookings (S81) layer on
// top of these tables; this sprint stops at "PIs author + interns
// browse".

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  getDb,
  protocolSteps,
  protocolVersions,
  protocols,
  users,
} from "@axiomic/db";
import { getSessionUser, requireAuth } from "../middleware/auth";
import { invalidateSearchIndex } from "../lib/searchIndex";
import { snapshotProtocol } from "../lib/versionSnapshots";
import type { Env } from "../env";

export const protocolsRouter = new Hono<Env>();

// --- shared validation ---------------------------------------------

const DISCIPLINES = [
  "biology",
  "chemistry",
  "mechanical",
  "electrical",
  "materials",
  "cs-lab",
  "physics",
] as const;
type Discipline = (typeof DISCIPLINES)[number];

const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case");

const disciplineSchema = z.enum(DISCIPLINES);

const reagentSchema = z.object({
  name: z.string().min(1).max(120),
  amount: z.string().max(40).optional(),
  unit: z.string().max(20).optional(),
  hazardClass: z.string().max(60).optional(),
});

const stepSchema = z.object({
  title: z.string().min(1).max(200),
  instructionMd: z.string().min(1).max(8000),
  safetyNotesMd: z.string().max(4000).optional().default(""),
  verificationMd: z.string().max(4000).optional().default(""),
  // The renderer reuses masteryNodes.quizData JSON shape; we don't
  // re-validate the inner structure here, just the wrapper.
  inlineQuizJson: z.string().max(8000).nullable().optional(),
  attachmentRefs: z.array(z.string().min(1).max(200)).max(20).optional(),
});

const createSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1).max(200),
  discipline: disciplineSchema,
  category: z.string().max(80).optional().nullable(),
  summary: z.string().max(500).optional().default(""),
  contentIntro: z.string().max(50000).optional().default(""),
  contentUndergrad: z.string().max(50000).optional().default(""),
  contentGrad: z.string().max(50000).optional().default(""),
  biosafetyLevel: z.number().int().min(1).max(4).optional().nullable(),
  hazardsMd: z.string().max(8000).optional().default(""),
  equipmentRequired: z.array(slugSchema).max(40).optional(),
  reagents: z.array(reagentSchema).max(40).optional(),
  estimatedMinutes: z.number().int().min(1).max(10000).optional().nullable(),
  requiredCerts: z.array(slugSchema).max(20).optional(),
  steps: z.array(stepSchema).max(100).optional(),
  status: z.enum(["draft", "published"]).optional().default("draft"),
});

const updateSchema = z
  .object({
    title: z.string().min(1).max(200),
    discipline: disciplineSchema,
    category: z.string().max(80).nullable(),
    summary: z.string().max(500),
    contentIntro: z.string().max(50000),
    contentUndergrad: z.string().max(50000),
    contentGrad: z.string().max(50000),
    biosafetyLevel: z.number().int().min(1).max(4).nullable(),
    hazardsMd: z.string().max(8000),
    equipmentRequired: z.array(slugSchema).max(40),
    reagents: z.array(reagentSchema).max(40),
    estimatedMinutes: z.number().int().min(1).max(10000).nullable(),
    requiredCerts: z.array(slugSchema).max(20),
    status: z.enum(["draft", "published"]),
  })
  .partial();

const replaceStepsSchema = z.object({
  steps: z.array(stepSchema).max(100),
  editMessage: z.string().max(200).optional(),
});

// --- helpers --------------------------------------------------------

function safeParseStrArray(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.filter((s): s is string => typeof s === "string");
  } catch {
    return [];
  }
}

function safeParseReagents(json: string): unknown[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

interface ProtocolRow {
  id: string;
  slug: string;
  title: string;
  discipline: string;
  category: string | null;
  summary: string;
  contentIntro: string;
  contentUndergrad: string;
  contentGrad: string;
  biosafetyLevel: number | null;
  hazardsMd: string;
  equipmentRequiredJson: string;
  reagentsJson: string;
  estimatedMinutes: number | null;
  requiredCertsJson: string;
  version: number;
  status: string;
  authorId: string;
  authorUsername: string | null;
  authorDisplayName: string | null;
  createdAt: string;
  updatedAt: string;
}

function projectProtocol(row: ProtocolRow) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    discipline: row.discipline as Discipline,
    category: row.category,
    summary: row.summary,
    contentIntro: row.contentIntro,
    contentUndergrad: row.contentUndergrad,
    contentGrad: row.contentGrad,
    biosafetyLevel: row.biosafetyLevel,
    hazardsMd: row.hazardsMd,
    equipmentRequired: safeParseStrArray(row.equipmentRequiredJson),
    reagents: safeParseReagents(row.reagentsJson),
    estimatedMinutes: row.estimatedMinutes,
    requiredCerts: safeParseStrArray(row.requiredCertsJson),
    version: row.version,
    status: row.status,
    authorId: row.authorId,
    authorUsername: row.authorUsername,
    authorDisplayName: row.authorDisplayName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const PROTOCOL_LIST_COLS = {
  id: protocols.id,
  slug: protocols.slug,
  title: protocols.title,
  discipline: protocols.discipline,
  category: protocols.category,
  summary: protocols.summary,
  contentIntro: protocols.contentIntro,
  contentUndergrad: protocols.contentUndergrad,
  contentGrad: protocols.contentGrad,
  biosafetyLevel: protocols.biosafetyLevel,
  hazardsMd: protocols.hazardsMd,
  equipmentRequiredJson: protocols.equipmentRequiredJson,
  reagentsJson: protocols.reagentsJson,
  estimatedMinutes: protocols.estimatedMinutes,
  requiredCertsJson: protocols.requiredCertsJson,
  version: protocols.version,
  status: protocols.status,
  authorId: protocols.authorId,
  authorUsername: users.username,
  authorDisplayName: users.displayName,
  createdAt: protocols.createdAt,
  updatedAt: protocols.updatedAt,
} as const;

function fetchSteps(protocolId: string) {
  const db = getDb();
  return db
    .select({
      id: protocolSteps.id,
      ordinal: protocolSteps.ordinal,
      title: protocolSteps.title,
      instructionMd: protocolSteps.instructionMd,
      safetyNotesMd: protocolSteps.safetyNotesMd,
      verificationMd: protocolSteps.verificationMd,
      inlineQuizJson: protocolSteps.inlineQuizJson,
      attachmentRefsJson: protocolSteps.attachmentRefsJson,
    })
    .from(protocolSteps)
    .where(eq(protocolSteps.protocolId, protocolId))
    .orderBy(asc(protocolSteps.ordinal))
    .all()
    .map((s) => ({
      id: s.id,
      ordinal: s.ordinal,
      title: s.title,
      instructionMd: s.instructionMd,
      safetyNotesMd: s.safetyNotesMd,
      verificationMd: s.verificationMd,
      inlineQuizJson: s.inlineQuizJson,
      attachmentRefs: safeParseStrArray(s.attachmentRefsJson),
    }));
}

function insertSteps(
  protocolId: string,
  steps: z.infer<typeof stepSchema>[],
): void {
  if (steps.length === 0) return;
  const db = getDb();
  db.insert(protocolSteps)
    .values(
      steps.map((step, index) => ({
        id: randomUUID(),
        protocolId,
        ordinal: index + 1,
        title: step.title.trim(),
        instructionMd: step.instructionMd,
        safetyNotesMd: step.safetyNotesMd ?? "",
        verificationMd: step.verificationMd ?? "",
        inlineQuizJson: step.inlineQuizJson ?? null,
        attachmentRefsJson: JSON.stringify(step.attachmentRefs ?? []),
      })),
    )
    .run();
}

// --- routes ---------------------------------------------------------

// GET /lab/protocols — list published protocols, optional discipline
// filter. Mirrors GET /research.
protocolsRouter.get("/", async (c) => {
  const db = getDb();
  const discipline = c.req.query("discipline");
  const rows = db
    .select(PROTOCOL_LIST_COLS)
    .from(protocols)
    .innerJoin(users, eq(protocols.authorId, users.id))
    .where(eq(protocols.status, "published"))
    .orderBy(desc(protocols.createdAt))
    .all();
  const filtered = discipline
    ? rows.filter((r) => r.discipline === discipline)
    : rows;
  return c.json({ protocols: filtered.map(projectProtocol) });
});

// GET /lab/protocols/me/drafts — author's own drafts.
protocolsRouter.get("/me/drafts", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb();
  const rows = db
    .select(PROTOCOL_LIST_COLS)
    .from(protocols)
    .innerJoin(users, eq(protocols.authorId, users.id))
    .where(
      and(eq(protocols.authorId, user.id), eq(protocols.status, "draft")),
    )
    .orderBy(desc(protocols.updatedAt))
    .all();
  return c.json({ protocols: rows.map(projectProtocol) });
});

// GET /lab/protocols/by-author/:username — published protocols by user.
protocolsRouter.get("/by-author/:username", async (c) => {
  const username = c.req.param("username")!;
  const db = getDb();
  const author = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .get();
  if (!author) return c.json({ protocols: [] });

  const rows = db
    .select(PROTOCOL_LIST_COLS)
    .from(protocols)
    .innerJoin(users, eq(protocols.authorId, users.id))
    .where(
      and(
        eq(protocols.authorId, author.id),
        eq(protocols.status, "published"),
      ),
    )
    .orderBy(desc(protocols.createdAt))
    .all();
  return c.json({ protocols: rows.map(projectProtocol) });
});

// GET /lab/protocols/:slug — single protocol with ordered steps.
// Drafts are visible only to their author; everyone else sees a 404.
protocolsRouter.get("/:slug", async (c) => {
  const slug = c.req.param("slug")!;
  const db = getDb();
  const row = db
    .select(PROTOCOL_LIST_COLS)
    .from(protocols)
    .innerJoin(users, eq(protocols.authorId, users.id))
    .where(eq(protocols.slug, slug))
    .get();
  if (!row) return c.json({ error: "Protocol not found" }, 404);

  if (row.status !== "published") {
    const viewer = await getSessionUser(c);
    if (!viewer || viewer.id !== row.authorId) {
      return c.json({ error: "Protocol not found" }, 404);
    }
  }

  return c.json({
    protocol: projectProtocol(row),
    steps: fetchSteps(row.id),
  });
});

// GET /lab/protocols/:slug/versions — version history for a published
// protocol (oldest → newest). Drafts are not version-tracked yet.
protocolsRouter.get("/:slug/versions", async (c) => {
  const slug = c.req.param("slug")!;
  const db = getDb();
  const row = db
    .select({ id: protocols.id, status: protocols.status })
    .from(protocols)
    .where(eq(protocols.slug, slug))
    .get();
  if (!row || row.status !== "published") {
    return c.json({ error: "Protocol not found" }, 404);
  }

  const rows = db
    .select({
      version: protocolVersions.version,
      editedBy: protocolVersions.editedBy,
      editMessage: protocolVersions.editMessage,
      createdAt: protocolVersions.createdAt,
    })
    .from(protocolVersions)
    .where(eq(protocolVersions.protocolId, row.id))
    .orderBy(asc(protocolVersions.version))
    .all();
  return c.json({ versions: rows });
});

// POST /lab/protocols — create a new protocol. Defaults to draft.
// Authors can ship `steps` inline so the first publish has procedure.
protocolsRouter.post(
  "/",
  requireAuth,
  zValidator("json", createSchema),
  async (c) => {
    const user = c.get("user")!;
    const data = c.req.valid("json");
    const db = getDb();

    const collision = db
      .select({ id: protocols.id })
      .from(protocols)
      .where(eq(protocols.slug, data.slug))
      .get();
    if (collision) return c.json({ error: "Slug already in use" }, 409);

    const hasSteps = (data.steps?.length ?? 0) > 0;
    if (data.status === "published" && !hasSteps) {
      return c.json(
        { error: "Cannot publish a protocol with no steps." },
        400,
      );
    }

    const id = randomUUID();
    db.insert(protocols)
      .values({
        id,
        slug: data.slug,
        title: data.title.trim(),
        discipline: data.discipline,
        category: data.category ?? null,
        summary: data.summary?.trim() ?? "",
        contentIntro: data.contentIntro ?? "",
        contentUndergrad: data.contentUndergrad ?? "",
        contentGrad: data.contentGrad ?? "",
        biosafetyLevel: data.biosafetyLevel ?? null,
        hazardsMd: data.hazardsMd ?? "",
        equipmentRequiredJson: JSON.stringify(data.equipmentRequired ?? []),
        reagentsJson: JSON.stringify(data.reagents ?? []),
        estimatedMinutes: data.estimatedMinutes ?? null,
        requiredCertsJson: JSON.stringify(data.requiredCerts ?? []),
        status: data.status,
        authorId: user.id,
      })
      .run();

    if (hasSteps) {
      insertSteps(id, data.steps!);
    }

    invalidateSearchIndex();
    if (data.status === "published") {
      snapshotProtocol(id, {
        editedBy: user.id,
        editMessage: "Initial publication",
      });
    }
    return c.json({ protocolId: id, slug: data.slug }, 201);
  },
);

// PUT /lab/protocols/:slug — update fields. Author-only. Snapshots on
// transition-to-published or while-published.
protocolsRouter.put(
  "/:slug",
  requireAuth,
  zValidator("json", updateSchema),
  async (c) => {
    const slug = c.req.param("slug")!;
    const user = c.get("user")!;
    const db = getDb();

    const existing = db
      .select({
        id: protocols.id,
        authorId: protocols.authorId,
        status: protocols.status,
      })
      .from(protocols)
      .where(eq(protocols.slug, slug))
      .get();
    if (!existing) return c.json({ error: "Protocol not found" }, 404);
    if (existing.authorId !== user.id) {
      return c.json(
        { error: "Only the author can edit this protocol." },
        403,
      );
    }

    const data = c.req.valid("json");
    const patch: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (data.title != null) patch.title = data.title.trim();
    if (data.discipline != null) patch.discipline = data.discipline;
    if (data.category !== undefined) patch.category = data.category;
    if (data.summary != null) patch.summary = data.summary.trim();
    if (data.contentIntro != null) patch.contentIntro = data.contentIntro;
    if (data.contentUndergrad != null) {
      patch.contentUndergrad = data.contentUndergrad;
    }
    if (data.contentGrad != null) patch.contentGrad = data.contentGrad;
    if (data.biosafetyLevel !== undefined) {
      patch.biosafetyLevel = data.biosafetyLevel;
    }
    if (data.hazardsMd != null) patch.hazardsMd = data.hazardsMd;
    if (data.equipmentRequired != null) {
      patch.equipmentRequiredJson = JSON.stringify(data.equipmentRequired);
    }
    if (data.reagents != null) {
      patch.reagentsJson = JSON.stringify(data.reagents);
    }
    if (data.estimatedMinutes !== undefined) {
      patch.estimatedMinutes = data.estimatedMinutes;
    }
    if (data.requiredCerts != null) {
      patch.requiredCertsJson = JSON.stringify(data.requiredCerts);
    }
    if (data.status != null) {
      // Refuse to publish a protocol that has no steps yet.
      if (data.status === "published") {
        const stepCount = db
          .select({ id: protocolSteps.id })
          .from(protocolSteps)
          .where(eq(protocolSteps.protocolId, existing.id))
          .all().length;
        if (stepCount === 0) {
          return c.json(
            { error: "Cannot publish a protocol with no steps." },
            400,
          );
        }
      }
      patch.status = data.status;
    }

    db.update(protocols)
      .set(patch)
      .where(eq(protocols.id, existing.id))
      .run();

    invalidateSearchIndex();

    const nowPublished = (data.status ?? existing.status) === "published";
    if (nowPublished) {
      snapshotProtocol(existing.id, {
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

// PUT /lab/protocols/:slug/steps — replace the protocol's full step
// list. Authoring is "edit, then save the whole list" for v1; in-place
// reorder + per-step PATCH can come later.
protocolsRouter.put(
  "/:slug/steps",
  requireAuth,
  zValidator("json", replaceStepsSchema),
  async (c) => {
    const slug = c.req.param("slug")!;
    const user = c.get("user")!;
    const db = getDb();

    const existing = db
      .select({
        id: protocols.id,
        authorId: protocols.authorId,
        status: protocols.status,
      })
      .from(protocols)
      .where(eq(protocols.slug, slug))
      .get();
    if (!existing) return c.json({ error: "Protocol not found" }, 404);
    if (existing.authorId !== user.id) {
      return c.json(
        { error: "Only the author can edit this protocol." },
        403,
      );
    }

    const data = c.req.valid("json");
    db.delete(protocolSteps)
      .where(eq(protocolSteps.protocolId, existing.id))
      .run();
    insertSteps(existing.id, data.steps);
    db.update(protocols)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(protocols.id, existing.id))
      .run();

    invalidateSearchIndex();

    if (existing.status === "published") {
      snapshotProtocol(existing.id, {
        editedBy: user.id,
        editMessage: data.editMessage ?? null,
      });
    }

    return c.json({ ok: true, stepCount: data.steps.length });
  },
);

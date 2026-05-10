// Sprint 79 — Lab equipment manuals.
//
// Each equipment row is a per-instrument manual: title + manufacturer
// + model + manualMd + ordered "common operations" (calibration,
// daily-check, common-fault, post-use). S81 will add booking on top
// of these rows; this sprint is library-only.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  equipment,
  equipmentOperations,
  getDb,
  users,
} from "@axiomic/db";
import { getSessionUser, requireAuth } from "../middleware/auth";
import { invalidateSearchIndex } from "../lib/searchIndex";
import type { Env } from "../env";

export const equipmentRouter = new Hono<Env>();

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
const bookingPolicySchema = z.enum(["open", "reserve", "supervised-only"]);
const operationKindSchema = z.enum([
  "calibration",
  "daily-check",
  "common-fault",
  "post-use",
]);

const operationSchema = z.object({
  title: z.string().min(1).max(200),
  bodyMd: z.string().min(1).max(8000),
  kind: operationKindSchema,
});

const createSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1).max(200),
  discipline: disciplineSchema,
  manufacturer: z.string().max(120).optional().nullable(),
  model: z.string().max(120).optional().nullable(),
  manualMd: z.string().max(50000).optional().default(""),
  locationHint: z.string().max(200).optional().nullable(),
  trainingCertSlug: slugSchema.optional().nullable(),
  hazardsMd: z.string().max(8000).optional().default(""),
  attachmentRefs: z.array(z.string().min(1).max(200)).max(20).optional(),
  bookingPolicy: bookingPolicySchema.optional().default("open"),
  status: z.enum(["active", "retired"]).optional().default("active"),
  operations: z.array(operationSchema).max(40).optional(),
});

const updateSchema = z
  .object({
    title: z.string().min(1).max(200),
    discipline: disciplineSchema,
    manufacturer: z.string().max(120).nullable(),
    model: z.string().max(120).nullable(),
    manualMd: z.string().max(50000),
    locationHint: z.string().max(200).nullable(),
    trainingCertSlug: slugSchema.nullable(),
    hazardsMd: z.string().max(8000),
    attachmentRefs: z.array(z.string().min(1).max(200)).max(20),
    bookingPolicy: bookingPolicySchema,
    status: z.enum(["active", "retired"]),
  })
  .partial();

const replaceOperationsSchema = z.object({
  operations: z.array(operationSchema).max(40),
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

interface EquipmentRow {
  id: string;
  slug: string;
  title: string;
  discipline: string;
  manufacturer: string | null;
  model: string | null;
  manualMd: string;
  locationHint: string | null;
  trainingCertSlug: string | null;
  hazardsMd: string;
  attachmentRefsJson: string;
  bookingPolicy: string;
  status: string;
  authorId: string;
  authorUsername: string | null;
  authorDisplayName: string | null;
  createdAt: string;
}

function projectEquipment(row: EquipmentRow) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    discipline: row.discipline as Discipline,
    manufacturer: row.manufacturer,
    model: row.model,
    manualMd: row.manualMd,
    locationHint: row.locationHint,
    trainingCertSlug: row.trainingCertSlug,
    hazardsMd: row.hazardsMd,
    attachmentRefs: safeParseStrArray(row.attachmentRefsJson),
    bookingPolicy: row.bookingPolicy,
    status: row.status,
    authorId: row.authorId,
    authorUsername: row.authorUsername,
    authorDisplayName: row.authorDisplayName,
    createdAt: row.createdAt,
  };
}

const EQUIPMENT_LIST_COLS = {
  id: equipment.id,
  slug: equipment.slug,
  title: equipment.title,
  discipline: equipment.discipline,
  manufacturer: equipment.manufacturer,
  model: equipment.model,
  manualMd: equipment.manualMd,
  locationHint: equipment.locationHint,
  trainingCertSlug: equipment.trainingCertSlug,
  hazardsMd: equipment.hazardsMd,
  attachmentRefsJson: equipment.attachmentRefsJson,
  bookingPolicy: equipment.bookingPolicy,
  status: equipment.status,
  authorId: equipment.authorId,
  authorUsername: users.username,
  authorDisplayName: users.displayName,
  createdAt: equipment.createdAt,
} as const;

function fetchOperations(equipmentId: string) {
  const db = getDb();
  return db
    .select({
      id: equipmentOperations.id,
      ordinal: equipmentOperations.ordinal,
      title: equipmentOperations.title,
      bodyMd: equipmentOperations.bodyMd,
      kind: equipmentOperations.kind,
    })
    .from(equipmentOperations)
    .where(eq(equipmentOperations.equipmentId, equipmentId))
    .orderBy(asc(equipmentOperations.ordinal))
    .all();
}

function insertOperations(
  equipmentId: string,
  ops: z.infer<typeof operationSchema>[],
): void {
  if (ops.length === 0) return;
  const db = getDb();
  db.insert(equipmentOperations)
    .values(
      ops.map((op, index) => ({
        id: randomUUID(),
        equipmentId,
        ordinal: index + 1,
        title: op.title.trim(),
        bodyMd: op.bodyMd,
        kind: op.kind,
      })),
    )
    .run();
}

// --- routes ---------------------------------------------------------

equipmentRouter.get("/", async (c) => {
  const db = getDb();
  const discipline = c.req.query("discipline");
  const rows = db
    .select(EQUIPMENT_LIST_COLS)
    .from(equipment)
    .innerJoin(users, eq(equipment.authorId, users.id))
    .where(eq(equipment.status, "active"))
    .orderBy(desc(equipment.createdAt))
    .all();
  const filtered = discipline
    ? rows.filter((r) => r.discipline === discipline)
    : rows;
  return c.json({ equipment: filtered.map(projectEquipment) });
});

equipmentRouter.get("/:slug", async (c) => {
  const slug = c.req.param("slug")!;
  const db = getDb();
  const row = db
    .select(EQUIPMENT_LIST_COLS)
    .from(equipment)
    .innerJoin(users, eq(equipment.authorId, users.id))
    .where(eq(equipment.slug, slug))
    .get();
  if (!row) return c.json({ error: "Equipment not found" }, 404);
  if (row.status !== "active") {
    const viewer = await getSessionUser(c);
    if (!viewer || viewer.id !== row.authorId) {
      return c.json({ error: "Equipment not found" }, 404);
    }
  }
  return c.json({
    equipment: projectEquipment(row),
    operations: fetchOperations(row.id),
  });
});

equipmentRouter.post(
  "/",
  requireAuth,
  zValidator("json", createSchema),
  async (c) => {
    const user = c.get("user")!;
    const data = c.req.valid("json");
    const db = getDb();

    const collision = db
      .select({ id: equipment.id })
      .from(equipment)
      .where(eq(equipment.slug, data.slug))
      .get();
    if (collision) return c.json({ error: "Slug already in use" }, 409);

    const id = randomUUID();
    db.insert(equipment)
      .values({
        id,
        slug: data.slug,
        title: data.title.trim(),
        discipline: data.discipline,
        manufacturer: data.manufacturer ?? null,
        model: data.model ?? null,
        manualMd: data.manualMd ?? "",
        locationHint: data.locationHint ?? null,
        trainingCertSlug: data.trainingCertSlug ?? null,
        hazardsMd: data.hazardsMd ?? "",
        attachmentRefsJson: JSON.stringify(data.attachmentRefs ?? []),
        bookingPolicy: data.bookingPolicy,
        status: data.status,
        authorId: user.id,
      })
      .run();

    if (data.operations && data.operations.length > 0) {
      insertOperations(id, data.operations);
    }

    invalidateSearchIndex();
    return c.json({ equipmentId: id, slug: data.slug }, 201);
  },
);

equipmentRouter.put(
  "/:slug",
  requireAuth,
  zValidator("json", updateSchema),
  async (c) => {
    const slug = c.req.param("slug")!;
    const user = c.get("user")!;
    const db = getDb();

    const existing = db
      .select({ id: equipment.id, authorId: equipment.authorId })
      .from(equipment)
      .where(eq(equipment.slug, slug))
      .get();
    if (!existing) return c.json({ error: "Equipment not found" }, 404);
    if (existing.authorId !== user.id) {
      return c.json(
        { error: "Only the author can edit this equipment." },
        403,
      );
    }

    const data = c.req.valid("json");
    const patch: Record<string, unknown> = {};
    if (data.title != null) patch.title = data.title.trim();
    if (data.discipline != null) patch.discipline = data.discipline;
    if (data.manufacturer !== undefined) {
      patch.manufacturer = data.manufacturer;
    }
    if (data.model !== undefined) patch.model = data.model;
    if (data.manualMd != null) patch.manualMd = data.manualMd;
    if (data.locationHint !== undefined) {
      patch.locationHint = data.locationHint;
    }
    if (data.trainingCertSlug !== undefined) {
      patch.trainingCertSlug = data.trainingCertSlug;
    }
    if (data.hazardsMd != null) patch.hazardsMd = data.hazardsMd;
    if (data.attachmentRefs != null) {
      patch.attachmentRefsJson = JSON.stringify(data.attachmentRefs);
    }
    if (data.bookingPolicy != null) patch.bookingPolicy = data.bookingPolicy;
    if (data.status != null) patch.status = data.status;

    db.update(equipment)
      .set(patch)
      .where(eq(equipment.id, existing.id))
      .run();

    invalidateSearchIndex();
    return c.json({ ok: true });
  },
);

equipmentRouter.put(
  "/:slug/operations",
  requireAuth,
  zValidator("json", replaceOperationsSchema),
  async (c) => {
    const slug = c.req.param("slug")!;
    const user = c.get("user")!;
    const db = getDb();

    const existing = db
      .select({ id: equipment.id, authorId: equipment.authorId })
      .from(equipment)
      .where(eq(equipment.slug, slug))
      .get();
    if (!existing) return c.json({ error: "Equipment not found" }, 404);
    if (existing.authorId !== user.id) {
      return c.json(
        { error: "Only the author can edit this equipment." },
        403,
      );
    }

    const data = c.req.valid("json");
    db.delete(equipmentOperations)
      .where(eq(equipmentOperations.equipmentId, existing.id))
      .run();
    insertOperations(existing.id, data.operations);
    invalidateSearchIndex();
    return c.json({ ok: true, operationCount: data.operations.length });
  },
);

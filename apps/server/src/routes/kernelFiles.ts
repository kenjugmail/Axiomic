// Sprint 42 — Kernel files router.
//
// A learner attaches an uploaded file (existing /uploads attachment)
// to a kernel scope so code cells running under that scope can read
// it from a virtual filesystem path. The kernel file row is a thin
// many-to-many between kernels and attachments — bytes still live
// in the `attachments` table.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  attachments,
  getDb,
  kernelFiles,
} from "@axiomic/db";
import { requireAuth } from "../middleware/auth";
import type { Env } from "../env";

export const kernelFilesRouter = new Hono<Env>();

const NAME_RE = /^[A-Za-z0-9._-]+$/;

const attachSchema = z.object({
  kernelKey: z.string().min(1).max(200),
  attachmentId: z.string().min(1).max(120),
  name: z.string().min(1).max(120).regex(NAME_RE).optional(),
});

const querySchema = z.object({
  kernelKey: z.string().min(1).max(200),
});

// GET /api/v1/kernel-files?kernelKey=...
// Returns the caller's attached files for that kernel scope.
kernelFilesRouter.get("/", requireAuth, zValidator("query", querySchema), async (c) => {
  const user = c.get("user")!;
  const { kernelKey } = c.req.valid("query");
  const db = getDb();
  const rows = db
    .select({
      id: kernelFiles.id,
      kernelKey: kernelFiles.kernelKey,
      attachmentId: kernelFiles.attachmentId,
      name: kernelFiles.name,
      createdAt: kernelFiles.createdAt,
      mimeType: attachments.mimeType,
      sizeBytes: attachments.sizeBytes,
      originalName: attachments.originalName,
    })
    .from(kernelFiles)
    .innerJoin(attachments, eq(kernelFiles.attachmentId, attachments.id))
    .where(
      and(
        eq(kernelFiles.ownerId, user.id),
        eq(kernelFiles.kernelKey, kernelKey),
      ),
    )
    .orderBy(desc(kernelFiles.createdAt))
    .all();
  return c.json({
    files: rows.map((r) => ({
      id: r.id,
      kernelKey: r.kernelKey,
      attachmentId: r.attachmentId,
      name: r.name,
      url: `/api/v1/uploads/${r.attachmentId}`,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      originalName: r.originalName,
      createdAt: r.createdAt,
    })),
  });
});

// POST /api/v1/kernel-files — register an attachment as a kernel file
// under the given kernelKey + display name. The attachment must
// belong to the caller (so a learner can't smuggle other people's
// files into their kernel via id-guessing).
kernelFilesRouter.post(
  "/",
  requireAuth,
  zValidator("json", attachSchema),
  async (c) => {
    const user = c.get("user")!;
    const data = c.req.valid("json");
    const db = getDb();

    const attachment = db
      .select({
        id: attachments.id,
        ownerId: attachments.ownerId,
        originalName: attachments.originalName,
      })
      .from(attachments)
      .where(eq(attachments.id, data.attachmentId))
      .get();
    if (!attachment) return c.json({ error: "Attachment not found" }, 404);
    if (attachment.ownerId !== user.id) {
      return c.json(
        { error: "You can only mount your own uploaded files." },
        403,
      );
    }
    const name = data.name ?? attachment.originalName;
    if (!NAME_RE.test(name)) {
      return c.json(
        { error: "name may contain letters, digits, '.', '_', '-' only" },
        400,
      );
    }

    // Re-mounting under the same (kernelKey, name) replaces the prior
    // entry instead of failing on the unique index.
    const existing = db
      .select({ id: kernelFiles.id })
      .from(kernelFiles)
      .where(
        and(
          eq(kernelFiles.ownerId, user.id),
          eq(kernelFiles.kernelKey, data.kernelKey),
          eq(kernelFiles.name, name),
        ),
      )
      .get();
    if (existing) {
      db.update(kernelFiles)
        .set({
          attachmentId: data.attachmentId,
          createdAt: new Date().toISOString(),
        })
        .where(eq(kernelFiles.id, existing.id))
        .run();
      return c.json({ id: existing.id, replaced: true });
    }
    const id = randomUUID();
    db.insert(kernelFiles).values({
      id,
      ownerId: user.id,
      kernelKey: data.kernelKey,
      attachmentId: data.attachmentId,
      name,
    }).run();
    return c.json({ id, replaced: false }, 201);
  },
);

// DELETE /api/v1/kernel-files/:id — unmount a file from a kernel.
// The underlying attachment is NOT deleted (use /uploads to do that).
kernelFilesRouter.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id")!;
  const db = getDb();
  const row = db
    .select({ ownerId: kernelFiles.ownerId })
    .from(kernelFiles)
    .where(eq(kernelFiles.id, id))
    .get();
  if (!row) return c.json({ error: "File not found" }, 404);
  if (row.ownerId !== user.id) {
    return c.json({ error: "You can only unmount your own files." }, 403);
  }
  db.delete(kernelFiles).where(eq(kernelFiles.id, id)).run();
  return c.json({ ok: true });
});

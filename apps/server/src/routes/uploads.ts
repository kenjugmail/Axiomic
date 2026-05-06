import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import { getDb, attachments, users } from "@axiomic/db";
import { requireAuth } from "../middleware/auth";
import type { Env } from "../env";

export const uploadsRouter = new Hono<Env>();

// Storage layout: <repo-root>/uploads/<yyyy>/<mm>/<id>.<ext>. Files are
// served by GET /uploads/:id. In production this would point at object
// storage (S3/R2); local FS is fine for dev + small self-hosts.
function uploadsRoot(): string {
  return path.join(process.cwd(), "uploads");
}

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per file
const TOTAL_USER_BYTES = 200 * 1024 * 1024; // 200 MB per user

const ALLOWED_MIME: Record<string, "image" | "video" | "file"> = {
  "image/png": "image",
  "image/jpeg": "image",
  "image/gif": "image",
  "image/webp": "image",
  "image/svg+xml": "image",
  "video/mp4": "video",
  "video/webm": "video",
  "application/pdf": "file",
};

function extFor(mime: string, originalName: string): string {
  const fromName = path.extname(originalName).toLowerCase().replace(".", "");
  if (fromName) return fromName;
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    case "application/pdf":
      return "pdf";
    default:
      return "bin";
  }
}

uploadsRouter.post("/", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb();

  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return c.json({ error: "Missing file field" }, 400);
  }
  const kind = ALLOWED_MIME[file.type];
  if (!kind) {
    return c.json({ error: `Unsupported type: ${file.type}` }, 400);
  }
  if (file.size > MAX_BYTES) {
    return c.json({ error: "File too large (10 MB cap)" }, 413);
  }

  // Per-user quota — sum bytes used by their existing attachments.
  const used = db
    .select({ s: attachments.sizeBytes })
    .from(attachments)
    .where(eq(attachments.ownerId, user.id))
    .all()
    .reduce((acc, r) => acc + r.s, 0);
  if (used + file.size > TOTAL_USER_BYTES) {
    return c.json({ error: "User storage quota exceeded" }, 413);
  }

  const id = randomUUID();
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const ext = extFor(file.type, file.name);
  const relPath = path.join(yyyy, mm, `${id}.${ext}`);
  const absPath = path.join(uploadsRoot(), relPath);
  await mkdir(path.dirname(absPath), { recursive: true });
  const bytes = new Uint8Array(await file.arrayBuffer());
  await writeFile(absPath, bytes);

  db.insert(attachments)
    .values({
      id,
      ownerId: user.id,
      kind,
      originalName: file.name.slice(0, 200),
      mimeType: file.type,
      sizeBytes: file.size,
      storagePath: relPath,
      createdAt: now.toISOString(),
    })
    .run();

  return c.json({
    id,
    url: `/api/v1/uploads/${id}`,
    kind,
    mimeType: file.type,
    sizeBytes: file.size,
    originalName: file.name,
  });
});

uploadsRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const row = db
    .select({
      mimeType: attachments.mimeType,
      storagePath: attachments.storagePath,
      originalName: attachments.originalName,
    })
    .from(attachments)
    .where(eq(attachments.id, id))
    .get();
  if (!row) return c.json({ error: "Not found" }, 404);

  try {
    const bytes = await readFile(path.join(uploadsRoot(), row.storagePath));
    return new Response(bytes, {
      headers: {
        "Content-Type": row.mimeType,
        // Inline so images/videos render; cache aggressively since IDs
        // are immutable UUIDs.
        "Content-Disposition": `inline; filename="${row.originalName.replace(/"/g, "")}"`,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return c.json({ error: "File missing" }, 404);
  }
});

uploadsRouter.get("/", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb();
  const rows = db
    .select({
      id: attachments.id,
      kind: attachments.kind,
      mimeType: attachments.mimeType,
      originalName: attachments.originalName,
      sizeBytes: attachments.sizeBytes,
      createdAt: attachments.createdAt,
    })
    .from(attachments)
    .where(eq(attachments.ownerId, user.id))
    .all();
  // Map to URLs the client can drop into markdown directly.
  return c.json({
    attachments: rows.map((r) => ({ ...r, url: `/api/v1/uploads/${r.id}` })),
  });
});

// Suppress unused users warning — kept around for future joining.
void users;

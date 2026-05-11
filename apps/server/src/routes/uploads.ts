import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import path from "path";
import { getDb, attachments, users } from "@axiomic/db";
import { requireAuth } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { env } from "../lib/envConfig";
import type { Env } from "../env";

export const uploadsRouter = new Hono<Env>();

// Storage layout: <root>/<yyyy>/<mm>/<id>.<ext>. Files are served by
// GET /uploads/:id. Root defaults to <repo-cwd>/uploads; deploys with
// an ephemeral filesystem can override via UPLOADS_STORAGE_PATH so
// uploads survive restarts. S3/R2 backends are a future swap.
function uploadsRoot(): string {
  return env.UPLOADS_STORAGE_PATH ?? path.join(process.cwd(), "uploads");
}

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per file
const TOTAL_USER_BYTES = 200 * 1024 * 1024; // 200 MB per user

// Note: SVG (image/svg+xml) is intentionally excluded. SVG files can
// embed <script> elements that execute in the platform's origin when
// the file is rendered inline, which is a stored-XSS vector. PNG/
// JPEG/GIF/WebP/MP4/WebM/PDF are all opaque container formats with
// no script-execution path under modern browsers + nosniff headers.
const ALLOWED_MIME: Record<string, "image" | "video" | "file"> = {
  "image/png": "image",
  "image/jpeg": "image",
  "image/gif": "image",
  "image/webp": "image",
  "video/mp4": "video",
  "video/webm": "video",
  "application/pdf": "file",
};

function extFor(mime: string, originalName: string): string {
  // Take the extension from the original name when present, but
  // strip path separators and anything that isn't [a-zA-Z0-9] to
  // keep `..`, slashes, and other surprises out of the storage path.
  const raw = path.extname(originalName).toLowerCase().replace(".", "");
  const fromName = raw.replace(/[^a-z0-9]/g, "").slice(0, 8);
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

// S108 — Magic-byte signatures for the MIMEs we accept. file.type is
// client-supplied and can be spoofed; the actual bytes have to match
// what the declared type promises. Each entry is a list of valid
// prefixes (some formats have multiple magic numbers).
const MAGIC_BYTES: Record<string, number[][]> = {
  "image/png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/gif": [
    [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
    [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
  ],
  // WebP is RIFF...WEBP — we check the RIFF marker and the WEBP tag
  // separately in matchesMagic() because of the 4-byte size in between.
  "image/webp": [[0x52, 0x49, 0x46, 0x46]],
  // MP4 has a 4-byte size header before "ftyp"; the magic-match
  // helper checks bytes 4..8 for "ftyp" when this is the declared
  // type.
  "video/mp4": [[0x66, 0x74, 0x79, 0x70]],
  "video/webm": [[0x1a, 0x45, 0xdf, 0xa3]],
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]],
};

function matchesMagic(declaredMime: string, bytes: Uint8Array): boolean {
  const patterns = MAGIC_BYTES[declaredMime];
  if (!patterns) return false;
  if (declaredMime === "video/mp4") {
    // bytes 4..8 must spell "ftyp"
    if (bytes.length < 8) return false;
    return (
      bytes[4] === 0x66 &&
      bytes[5] === 0x74 &&
      bytes[6] === 0x79 &&
      bytes[7] === 0x70
    );
  }
  if (declaredMime === "image/webp") {
    // bytes 0..4 RIFF, bytes 8..12 WEBP
    if (bytes.length < 12) return false;
    return (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }
  return patterns.some((p) => {
    if (bytes.length < p.length) return false;
    for (let i = 0; i < p.length; i++) {
      if (bytes[i] !== p[i]) return false;
    }
    return true;
  });
}

uploadsRouter.post("/", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb();

  // S108 — Per-user rate-limit. 30 uploads / minute is generous for
  // a power user editing a long article (image-heavy walkthroughs)
  // and tight enough to deter a misbehaving client.
  const rateKey = `uploads:u:${user.id}`;
  if (!checkRateLimit(rateKey, 30, 60_000)) {
    return c.json({ error: "Upload rate limit reached. Slow down." }, 429);
  }

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

  const bytes = new Uint8Array(await file.arrayBuffer());

  // S108 — Magic-byte check. The client's Content-Type can lie
  // (a .zip with Content-Type: image/png passes the MIME allowlist
  // above); the first bytes of the actual payload have to match the
  // declared type or we reject as 415.
  if (!matchesMagic(file.type, bytes)) {
    return c.json(
      {
        error: "File content does not match the declared MIME type.",
        declaredType: file.type,
      },
      415,
    );
  }

  const id = randomUUID();
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const ext = extFor(file.type, file.name);
  const relPath = path.join(yyyy, mm, `${id}.${ext}`);
  const absPath = path.join(uploadsRoot(), relPath);
  await mkdir(path.dirname(absPath), { recursive: true });
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

// Strip characters that have meaning in HTTP headers — quotes, CR/LF
// (header-injection), and any non-ASCII that the header encoding rules
// would mangle. Truncate to a sane length.
function safeHeaderFilename(name: string): string {
  return name
    .replace(/[\r\n"\\]/g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .slice(0, 200);
}

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

  // Defense-in-depth: even though storagePath is always written by us
  // from a known-good template, resolve + verify before reading. If a
  // future code path ever lets user input into storagePath, this stops
  // a path-traversal read of arbitrary filesystem entries.
  const root = uploadsRoot();
  const resolved = path.resolve(root, row.storagePath);
  const rootResolved = path.resolve(root) + path.sep;
  if (!resolved.startsWith(rootResolved)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  try {
    const bytes = await readFile(resolved);
    return new Response(bytes, {
      headers: {
        "Content-Type": row.mimeType,
        // nosniff prevents browsers from second-guessing the
        // Content-Type — closes the stored-XSS path where an attacker
        // uploads e.g. an HTML file with a PNG MIME.
        "X-Content-Type-Options": "nosniff",
        // Inline so images/videos render; cache aggressively since IDs
        // are immutable UUIDs.
        "Content-Disposition": `inline; filename="${safeHeaderFilename(row.originalName)}"`,
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

uploadsRouter.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id")!;
  const db = getDb();

  const row = db
    .select({
      id: attachments.id,
      ownerId: attachments.ownerId,
      storagePath: attachments.storagePath,
    })
    .from(attachments)
    .where(eq(attachments.id, id))
    .get();
  if (!row) return c.json({ error: "Not found" }, 404);
  if (row.ownerId !== user.id) return c.json({ error: "Forbidden" }, 403);

  // Remove the row first; if the FS delete fails (e.g. file already
  // missing) we still want the row gone so the user's quota frees up.
  db.delete(attachments).where(eq(attachments.id, id)).run();
  try {
    await unlink(path.join(uploadsRoot(), row.storagePath));
  } catch {
    // file may already be gone
  }
  return c.json({ ok: true });
});

// Suppress unused users warning — kept around for future joining.
void users;

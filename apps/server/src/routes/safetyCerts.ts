// Sprint 80 — Safety certifications.
//
// Catalog of cert quizzes (BSL-1, BSL-2, chemical hygiene, ...) and
// per-user pass records with optional expiry. Reuses the masteryNodes
// quiz JSON shape so the existing quiz renderer + grader work
// unchanged. Routes:
//
//   GET  /lab/safety-certs                 — catalog
//   GET  /lab/safety-certs/:slug           — preview (no answers)
//   POST /lab/safety-certs/:slug/attempt   — submit answers, persist pass
//   GET  /me/safety-certs                  — caller's pass history
//
// Pass records gate protocol runs (S80 protocolRuns route) — an intern
// can't start a run for BSL-2 work until they hold a non-expired
// BSL-2 row.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  getDb,
  safetyCertifications,
  userSafetyCertifications,
  users,
} from "@axiomic/db";
import { requireAuth } from "../middleware/auth";
import { notify } from "../lib/notifications";
import { gradeQuestion } from "../lib/quizGrading";
import type { Env } from "../env";

export const safetyCertsRouter = new Hono<Env>();

const DISCIPLINES = [
  "biology",
  "chemistry",
  "mechanical",
  "electrical",
  "materials",
  "cs-lab",
  "physics",
] as const;

const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case");

const createSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1).max(200),
  discipline: z.enum(DISCIPLINES),
  description: z.string().max(2000).optional().nullable(),
  // Validated as opaque JSON — the grader walks the same shape used
  // by masteryNodes.quizData.
  quizData: z.array(z.record(z.string(), z.any())).min(1).max(50),
  passingScore: z.number().min(0.1).max(1).optional().default(0.7),
  validityDays: z.number().int().min(1).max(3650).optional().nullable(),
});

const attemptSchema = z.object({
  // questionId → answer string. Same shape used by /mastery/quiz/:id.
  answers: z.record(z.string(), z.string()),
});

function projectCert(row: {
  id: string;
  slug: string;
  title: string;
  discipline: string;
  description: string | null;
  passingScore: number;
  validityDays: number | null;
  authorId: string;
  createdAt: string;
}) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    discipline: row.discipline,
    description: row.description,
    passingScore: row.passingScore,
    validityDays: row.validityDays,
    authorId: row.authorId,
    createdAt: row.createdAt,
  };
}

// GET /lab/safety-certs — catalog.
safetyCertsRouter.get("/", async (c) => {
  const db = getDb();
  const discipline = c.req.query("discipline");
  const rows = db
    .select({
      id: safetyCertifications.id,
      slug: safetyCertifications.slug,
      title: safetyCertifications.title,
      discipline: safetyCertifications.discipline,
      description: safetyCertifications.description,
      passingScore: safetyCertifications.passingScore,
      validityDays: safetyCertifications.validityDays,
      authorId: safetyCertifications.authorId,
      createdAt: safetyCertifications.createdAt,
    })
    .from(safetyCertifications)
    .orderBy(asc(safetyCertifications.discipline), asc(safetyCertifications.title))
    .all();
  const filtered = discipline
    ? rows.filter((r) => r.discipline === discipline)
    : rows;
  return c.json({ certs: filtered.map(projectCert) });
});

// GET /lab/safety-certs/:slug — preview (returns quiz scaffolding
// minus correct-answer fields so a reader can render the quiz UI).
safetyCertsRouter.get("/:slug", async (c) => {
  const slug = c.req.param("slug")!;
  const db = getDb();
  const row = db
    .select()
    .from(safetyCertifications)
    .where(eq(safetyCertifications.slug, slug))
    .get();
  if (!row) return c.json({ error: "Certification not found" }, 404);

  let parsed: unknown[] = [];
  try {
    const arr = JSON.parse(row.quizDataJson);
    if (Array.isArray(arr)) parsed = arr;
  } catch {
    parsed = [];
  }

  // Strip correct-answer fields so the wire payload doesn't leak the key.
  const sanitized = parsed.map((q) => {
    if (!q || typeof q !== "object") return q;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(q)) {
      if (
        k === "correctIndex" ||
        k === "acceptedAnswers" ||
        k === "target" ||
        k === "tests" ||
        k === "blanks"
      ) {
        // Keep `target` for slider UI bounds but drop the answer key.
        // For simplicity, drop them all; the grader runs server-side.
        continue;
      }
      out[k] = v;
    }
    return out;
  });

  return c.json({
    cert: projectCert(row),
    questions: sanitized,
  });
});

// POST /lab/safety-certs/:slug/attempt — submit answers. On pass,
// inserts a userSafetyCertifications row and notifies the user. The
// row carries `expiresAt = passedAt + validityDays` (null when the
// cert never expires).
safetyCertsRouter.post(
  "/:slug/attempt",
  requireAuth,
  zValidator("json", attemptSchema),
  async (c) => {
    const slug = c.req.param("slug")!;
    const user = c.get("user")!;
    const { answers } = c.req.valid("json");
    const db = getDb();

    const cert = db
      .select()
      .from(safetyCertifications)
      .where(eq(safetyCertifications.slug, slug))
      .get();
    if (!cert) return c.json({ error: "Certification not found" }, 404);

    let questions: any[] = [];
    try {
      const arr = JSON.parse(cert.quizDataJson);
      if (Array.isArray(arr)) questions = arr;
    } catch {
      return c.json({ error: "Quiz data corrupt; ask the author to fix it." }, 500);
    }
    if (questions.length === 0) {
      return c.json({ error: "Quiz has no questions." }, 500);
    }

    let correct = 0;
    for (const q of questions) {
      if (gradeQuestion(q, answers[q?.id])) correct++;
    }
    const score = correct / questions.length;
    const passed = score >= cert.passingScore;

    if (!passed) {
      return c.json({
        passed: false,
        score,
        passingScore: cert.passingScore,
        correct,
        total: questions.length,
      });
    }

    // Expire old rows for the same cert + user so the latest pass is
    // canonical. Without this the userCertIdx ORDER BY expiresAt-desc
    // still works, but stale rows clutter the cert history view.
    const passedAt = new Date().toISOString();
    const expiresAt =
      cert.validityDays != null
        ? new Date(Date.now() + cert.validityDays * 24 * 60 * 60 * 1000)
            .toISOString()
        : null;

    const recordId = randomUUID();
    db.insert(userSafetyCertifications)
      .values({
        id: recordId,
        userId: user.id,
        certSlug: cert.slug,
        passedAt,
        expiresAt,
        score,
      })
      .run();

    // Notify the user — actorId=null = system-issued. Subject points
    // back at the cert slug so the bell deep-links the user to the
    // cert detail page.
    await notify({
      recipientId: user.id,
      actorId: null,
      kind: "lab_cert_passed",
      subjectType: "lab_cert",
      subjectId: cert.id,
      contextSlug: cert.slug,
      preview: cert.title,
    });

    return c.json({
      passed: true,
      score,
      correct,
      total: questions.length,
      passedAt,
      expiresAt,
    });
  },
);

// GET /me/safety-certs — caller's pass history. Mounted on the
// safetyCerts router because /me already resolves elsewhere; the
// server index.ts mounts both `/lab/safety-certs` and `/me/safety-
// certs` to this same router (see safetyCertsMeRouter below).
export const safetyCertsMeRouter = new Hono<Env>();
safetyCertsMeRouter.get("/", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb();
  const rows = db
    .select({
      id: userSafetyCertifications.id,
      certSlug: userSafetyCertifications.certSlug,
      passedAt: userSafetyCertifications.passedAt,
      expiresAt: userSafetyCertifications.expiresAt,
      score: userSafetyCertifications.score,
      certTitle: safetyCertifications.title,
      certDiscipline: safetyCertifications.discipline,
    })
    .from(userSafetyCertifications)
    .leftJoin(
      safetyCertifications,
      eq(userSafetyCertifications.certSlug, safetyCertifications.slug),
    )
    .where(eq(userSafetyCertifications.userId, user.id))
    .orderBy(desc(userSafetyCertifications.passedAt))
    .all();
  return c.json({ certs: rows });
});

// POST /lab/safety-certs — author a new cert. Requires auth; we don't
// enforce admin-only here so PIs and lab managers can publish their
// own. Slugs are unique.
safetyCertsRouter.post(
  "/",
  requireAuth,
  zValidator("json", createSchema),
  async (c) => {
    const user = c.get("user")!;
    const data = c.req.valid("json");
    const db = getDb();

    const collision = db
      .select({ id: safetyCertifications.id })
      .from(safetyCertifications)
      .where(eq(safetyCertifications.slug, data.slug))
      .get();
    if (collision) return c.json({ error: "Slug already in use" }, 409);

    // Sanity: every question must have an `id`. Without it the grader
    // can't pair answers to questions.
    for (const [i, q] of data.quizData.entries()) {
      if (!q || typeof q !== "object" || typeof q.id !== "string") {
        return c.json(
          { error: `Question ${i} missing string \`id\`` },
          400,
        );
      }
    }

    const id = randomUUID();
    db.insert(safetyCertifications)
      .values({
        id,
        slug: data.slug,
        title: data.title.trim(),
        discipline: data.discipline,
        description: data.description ?? null,
        quizDataJson: JSON.stringify(data.quizData),
        passingScore: data.passingScore,
        validityDays: data.validityDays ?? null,
        authorId: user.id,
      })
      .run();

    return c.json({ certId: id, slug: data.slug }, 201);
  },
);

// Internal helper: list non-expired cert slugs held by a user. Used
// by the protocol-run start gate to verify required certs.
export function activeCertSlugsForUser(userId: string): Set<string> {
  const db = getDb();
  const now = new Date().toISOString();
  const rows = db
    .select({
      certSlug: userSafetyCertifications.certSlug,
      expiresAt: userSafetyCertifications.expiresAt,
    })
    .from(userSafetyCertifications)
    .where(eq(userSafetyCertifications.userId, userId))
    .all();
  const out = new Set<string>();
  for (const r of rows) {
    if (r.expiresAt === null || r.expiresAt > now) out.add(r.certSlug);
  }
  return out;
}

// Suppress unused-import warning for `users` — kept for symmetry with
// other route files that join users on author.
void users;

// Sprint 82 — Lab assignments + intern playbook + roster + skill MRI.
//
// Wires the protocol/cert library into the existing cohort surface so
// a PI can assign work to interns and the intern dashboard shows
// what's due, what's recommended next, and what's complete.
//
// Routes:
//   POST   /lab-groups/:slug/assign           — PI assigns to interns
//   GET    /lab-groups/:slug/roster           — PI dashboard
//   GET    /me/lab/playbook                   — intern's assigned + recommended
//   GET    /me/lab/skill-mri                  — discipline → skill matrix

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  cohortMembers,
  cohorts,
  equipment,
  getDb,
  labAssignments,
  masteryNodes,
  masteryPaths,
  protocolRuns,
  protocols,
  safetyCertifications,
  userProgress,
  userSafetyCertifications,
  users,
} from "@axiomic/db";
import { requireAuth } from "../middleware/auth";
import { notify } from "../lib/notifications";
import type { Env } from "../env";

export const labGroupsRouter = new Hono<Env>();
export const meLabRouter = new Hono<Env>();

// --- helpers --------------------------------------------------------

function isCohortOrganizer(cohortId: string, userId: string): boolean {
  const db = getDb();
  const row = db
    .select({ role: cohortMembers.role, creatorId: cohorts.creatorId })
    .from(cohortMembers)
    .innerJoin(cohorts, eq(cohorts.id, cohortMembers.cohortId))
    .where(
      and(eq(cohortMembers.cohortId, cohortId), eq(cohortMembers.userId, userId)),
    )
    .get();
  if (!row) return false;
  return row.role === "organizer" || row.creatorId === userId;
}

function isCohortMentorOrOrganizer(
  cohortId: string,
  userId: string,
): boolean {
  const db = getDb();
  const row = db
    .select({ role: cohortMembers.role, creatorId: cohorts.creatorId })
    .from(cohortMembers)
    .innerJoin(cohorts, eq(cohorts.id, cohortMembers.cohortId))
    .where(
      and(eq(cohortMembers.cohortId, cohortId), eq(cohortMembers.userId, userId)),
    )
    .get();
  if (!row) return false;
  return (
    row.role === "organizer" ||
    row.role === "mentor" ||
    row.creatorId === userId
  );
}

// --- schemas --------------------------------------------------------

const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const assignSchema = z
  .object({
    assignedToUserIds: z.array(z.string().min(1).max(120)).min(1).max(200),
    masteryPathSlug: slugSchema.nullable().optional(),
    protocolSlug: slugSchema.nullable().optional(),
    certSlug: slugSchema.nullable().optional(),
    dueAt: z.string().datetime().nullable().optional(),
    notesMd: z.string().max(2000).optional(),
  })
  .refine(
    (d) => {
      const set = [d.masteryPathSlug, d.protocolSlug, d.certSlug].filter(
        Boolean,
      );
      return set.length === 1;
    },
    {
      message:
        "Set exactly one of masteryPathSlug | protocolSlug | certSlug",
    },
  );

// --- POST /lab-groups/:slug/assign ---------------------------------

labGroupsRouter.post(
  "/:slug/assign",
  requireAuth,
  zValidator("json", assignSchema),
  async (c) => {
    const slug = c.req.param("slug")!;
    const me = c.get("user")!;
    const data = c.req.valid("json");
    const db = getDb();

    const cohort = db
      .select({ id: cohorts.id, name: cohorts.name })
      .from(cohorts)
      .where(eq(cohorts.slug, slug))
      .get();
    if (!cohort) return c.json({ error: "Cohort not found" }, 404);
    if (!isCohortMentorOrOrganizer(cohort.id, me.id)) {
      return c.json(
        { error: "Only mentors/organizers can assign work." },
        403,
      );
    }

    // Verify each assignedToUser is actually a cohort member; silently
    // skip non-members (assigner may have stale IDs).
    const memberIds = new Set(
      db
        .select({ userId: cohortMembers.userId })
        .from(cohortMembers)
        .where(eq(cohortMembers.cohortId, cohort.id))
        .all()
        .map((r) => r.userId),
    );
    const targets = data.assignedToUserIds.filter((id) => memberIds.has(id));
    if (targets.length === 0) {
      return c.json(
        { error: "No valid cohort members in assignedToUserIds." },
        400,
      );
    }

    // Validate the assignment target actually exists. Without this a
    // PI's typo silently lands as a pending assignment that 404s when
    // the intern tries to open it.
    if (data.protocolSlug) {
      const exists = db
        .select({ id: protocols.id, status: protocols.status })
        .from(protocols)
        .where(eq(protocols.slug, data.protocolSlug))
        .get();
      if (!exists) {
        return c.json(
          { error: `Unknown protocol slug: ${data.protocolSlug}` },
          400,
        );
      }
      if (exists.status !== "published") {
        return c.json(
          { error: `Protocol ${data.protocolSlug} is not published.` },
          400,
        );
      }
    }
    if (data.certSlug) {
      const exists = db
        .select({ id: safetyCertifications.id })
        .from(safetyCertifications)
        .where(eq(safetyCertifications.slug, data.certSlug))
        .get();
      if (!exists) {
        return c.json(
          { error: `Unknown cert slug: ${data.certSlug}` },
          400,
        );
      }
    }
    if (data.masteryPathSlug) {
      const exists = db
        .select({ id: masteryPaths.id })
        .from(masteryPaths)
        .where(eq(masteryPaths.slug, data.masteryPathSlug))
        .get();
      if (!exists) {
        return c.json(
          { error: `Unknown mastery path slug: ${data.masteryPathSlug}` },
          400,
        );
      }
    }

    // Phase K — single bulk INSERT instead of one INSERT per target.
    // Chunk at 100 to stay under SQLite's variable-count limit
    // (~999 vars / 9 cols ≈ 110 rows max — round down for headroom).
    const rows = targets.map((userId) => ({
      id: randomUUID(),
      cohortId: cohort.id,
      assignedToUserId: userId,
      assignedById: me.id,
      masteryPathSlug: data.masteryPathSlug ?? null,
      protocolSlug: data.protocolSlug ?? null,
      certSlug: data.certSlug ?? null,
      dueAt: data.dueAt ?? null,
      notesMd: data.notesMd ?? null,
    }));
    const CHUNK = 100;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      if (chunk.length > 0) db.insert(labAssignments).values(chunk).run();
    }
    const inserted = rows.map((r) => r.id);

    return c.json(
      { ok: true, cohortId: cohort.id, assignmentIds: inserted },
      201,
    );
  },
);

// --- GET /lab-groups/:slug/roster ----------------------------------

labGroupsRouter.get("/:slug/roster", requireAuth, async (c) => {
  const slug = c.req.param("slug")!;
  const me = c.get("user")!;
  const db = getDb();

  const cohort = db
    .select({
      id: cohorts.id,
      name: cohorts.name,
      discipline: cohorts.discipline,
    })
    .from(cohorts)
    .where(eq(cohorts.slug, slug))
    .get();
  if (!cohort) return c.json({ error: "Cohort not found" }, 404);
  if (!isCohortMentorOrOrganizer(cohort.id, me.id)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const memberRows = db
    .select({
      userId: cohortMembers.userId,
      role: cohortMembers.role,
      joinedAt: cohortMembers.joinedAt,
      username: users.username,
      displayName: users.displayName,
    })
    .from(cohortMembers)
    .innerJoin(users, eq(users.id, cohortMembers.userId))
    .where(eq(cohortMembers.cohortId, cohort.id))
    .orderBy(asc(cohortMembers.joinedAt))
    .all();

  const memberIds = memberRows.map((m) => m.userId);

  // For each intern (role=member), aggregate counts:
  //   assignmentsPending / assignmentsCompleted (status counts)
  //   protocolRunsSignedOff (lifetime)
  //   activeCertCount (non-expired)
  const assignmentsByUser = new Map<
    string,
    { pending: number; completed: number; overdue: number }
  >();
  if (memberIds.length > 0) {
    const rows = db
      .select({
        userId: labAssignments.assignedToUserId,
        status: labAssignments.status,
        dueAt: labAssignments.dueAt,
      })
      .from(labAssignments)
      .where(
        and(
          eq(labAssignments.cohortId, cohort.id),
          inArray(labAssignments.assignedToUserId, memberIds),
        ),
      )
      .all();
    const nowIso = new Date().toISOString();
    for (const r of rows) {
      const slot = assignmentsByUser.get(r.userId) ?? {
        pending: 0,
        completed: 0,
        overdue: 0,
      };
      if (r.status === "completed") slot.completed++;
      else if (
        r.status === "overdue" ||
        (r.dueAt !== null && r.dueAt < nowIso && r.status !== "completed")
      )
        slot.overdue++;
      else slot.pending++;
      assignmentsByUser.set(r.userId, slot);
    }
  }

  const runsByUser = new Map<string, number>();
  if (memberIds.length > 0) {
    const rows = db
      .select({
        userId: protocolRuns.userId,
        status: protocolRuns.status,
      })
      .from(protocolRuns)
      .where(inArray(protocolRuns.userId, memberIds))
      .all();
    for (const r of rows) {
      if (r.status === "signed_off") {
        runsByUser.set(r.userId, (runsByUser.get(r.userId) ?? 0) + 1);
      }
    }
  }

  const certsByUser = new Map<string, number>();
  if (memberIds.length > 0) {
    const rows = db
      .select({
        userId: userSafetyCertifications.userId,
        expiresAt: userSafetyCertifications.expiresAt,
      })
      .from(userSafetyCertifications)
      .where(inArray(userSafetyCertifications.userId, memberIds))
      .all();
    const nowIso = new Date().toISOString();
    for (const r of rows) {
      if (r.expiresAt === null || r.expiresAt > nowIso) {
        certsByUser.set(r.userId, (certsByUser.get(r.userId) ?? 0) + 1);
      }
    }
  }

  // Pending sign-off queue (runs awaiting that the caller can review).
  const awaitingRows = db
    .select({
      id: protocolRuns.id,
      userId: protocolRuns.userId,
      protocolSlug: protocols.slug,
      protocolTitle: protocols.title,
      startedAt: protocolRuns.startedAt,
    })
    .from(protocolRuns)
    .innerJoin(protocols, eq(protocols.id, protocolRuns.protocolId))
    .where(
      and(
        eq(protocolRuns.status, "awaiting_signoff"),
        inArray(protocolRuns.userId, memberIds),
      ),
    )
    .orderBy(asc(protocolRuns.startedAt))
    .all();

  return c.json({
    cohort: {
      id: cohort.id,
      slug,
      name: cohort.name,
      discipline: cohort.discipline,
    },
    members: memberRows.map((m) => ({
      userId: m.userId,
      username: m.username,
      displayName: m.displayName,
      role: m.role,
      joinedAt: m.joinedAt,
      assignments: assignmentsByUser.get(m.userId) ?? {
        pending: 0,
        completed: 0,
        overdue: 0,
      },
      signedOffRunCount: runsByUser.get(m.userId) ?? 0,
      activeCertCount: certsByUser.get(m.userId) ?? 0,
    })),
    awaitingSignoffQueue: awaitingRows,
  });
});

// --- GET /me/lab/playbook ------------------------------------------
//
// Returns the caller's open assignments + a prereq-aware list of the
// next 3 protocols the intern can attempt (they hold all required
// certs and haven't run them yet).

meLabRouter.get("/playbook", requireAuth, async (c) => {
  const me = c.get("user")!;
  const db = getDb();
  // Default to 3 recommended next-actions (UI surface area). Tests
  // and richer dashboards can request more via ?limit=. The hard cap
  // sits well above realistic UI use so test fixtures spanning the
  // whole protocol catalog don't get truncated.
  const limit = Math.max(
    1,
    Math.min(2000, parseInt(c.req.query("limit") ?? "3", 10) || 3),
  );

  const assignmentsRows = db
    .select({
      id: labAssignments.id,
      cohortId: labAssignments.cohortId,
      cohortSlug: cohorts.slug,
      cohortName: cohorts.name,
      masteryPathSlug: labAssignments.masteryPathSlug,
      protocolSlug: labAssignments.protocolSlug,
      certSlug: labAssignments.certSlug,
      dueAt: labAssignments.dueAt,
      status: labAssignments.status,
      notesMd: labAssignments.notesMd,
      createdAt: labAssignments.createdAt,
      assignedById: labAssignments.assignedById,
      assignedByUsername: users.username,
    })
    .from(labAssignments)
    .innerJoin(cohorts, eq(cohorts.id, labAssignments.cohortId))
    .innerJoin(users, eq(users.id, labAssignments.assignedById))
    .where(eq(labAssignments.assignedToUserId, me.id))
    .orderBy(asc(labAssignments.dueAt), desc(labAssignments.createdAt))
    .all();

  // Resolve human-readable titles for each assignment target.
  const protocolSlugs = new Set<string>();
  const certSlugs = new Set<string>();
  const pathSlugs = new Set<string>();
  for (const a of assignmentsRows) {
    if (a.protocolSlug) protocolSlugs.add(a.protocolSlug);
    if (a.certSlug) certSlugs.add(a.certSlug);
    if (a.masteryPathSlug) pathSlugs.add(a.masteryPathSlug);
  }
  const protocolTitles = new Map<string, string>();
  if (protocolSlugs.size > 0) {
    db.select({ slug: protocols.slug, title: protocols.title })
      .from(protocols)
      .where(inArray(protocols.slug, [...protocolSlugs]))
      .all()
      .forEach((r) => protocolTitles.set(r.slug, r.title));
  }
  const certTitles = new Map<string, string>();
  if (certSlugs.size > 0) {
    db.select({
      slug: safetyCertifications.slug,
      title: safetyCertifications.title,
    })
      .from(safetyCertifications)
      .where(inArray(safetyCertifications.slug, [...certSlugs]))
      .all()
      .forEach((r) => certTitles.set(r.slug, r.title));
  }
  const pathTitles = new Map<string, string>();
  if (pathSlugs.size > 0) {
    db.select({ slug: masteryPaths.slug, title: masteryPaths.title })
      .from(masteryPaths)
      .where(inArray(masteryPaths.slug, [...pathSlugs]))
      .all()
      .forEach((r) => pathTitles.set(r.slug, r.title));
  }

  // Recommended next: pick up to 3 published protocols where the user
  // (a) doesn't already have a signed-off run AND (b) holds every
  // required cert + non-expired.
  const heldCerts = new Set<string>();
  const nowIso = new Date().toISOString();
  db.select({
    certSlug: userSafetyCertifications.certSlug,
    expiresAt: userSafetyCertifications.expiresAt,
  })
    .from(userSafetyCertifications)
    .where(eq(userSafetyCertifications.userId, me.id))
    .all()
    .forEach((r) => {
      if (r.expiresAt === null || r.expiresAt > nowIso) {
        heldCerts.add(r.certSlug);
      }
    });

  const completedProtocolIds = new Set<string>();
  db.select({
    protocolId: protocolRuns.protocolId,
    status: protocolRuns.status,
  })
    .from(protocolRuns)
    .where(eq(protocolRuns.userId, me.id))
    .all()
    .forEach((r) => {
      if (r.status === "signed_off") completedProtocolIds.add(r.protocolId);
    });

  const allPublished = db
    .select({
      id: protocols.id,
      slug: protocols.slug,
      title: protocols.title,
      discipline: protocols.discipline,
      requiredCertsJson: protocols.requiredCertsJson,
    })
    .from(protocols)
    .where(eq(protocols.status, "published"))
    .all();

  const recommended = [];
  for (const p of allPublished) {
    if (completedProtocolIds.has(p.id)) continue;
    let required: string[] = [];
    try {
      const arr = JSON.parse(p.requiredCertsJson);
      if (Array.isArray(arr))
        required = arr.filter((s): s is string => typeof s === "string");
    } catch {}
    const missing = required.filter((s) => !heldCerts.has(s));
    if (missing.length === 0) {
      recommended.push({
        slug: p.slug,
        title: p.title,
        discipline: p.discipline,
      });
    }
    if (recommended.length >= limit) break;
  }

  return c.json({
    assignments: assignmentsRows.map((a) => ({
      id: a.id,
      cohortSlug: a.cohortSlug,
      cohortName: a.cohortName,
      kind: a.protocolSlug
        ? "protocol"
        : a.certSlug
          ? "cert"
          : a.masteryPathSlug
            ? "path"
            : "unknown",
      targetSlug:
        a.protocolSlug ?? a.certSlug ?? a.masteryPathSlug ?? null,
      targetTitle: a.protocolSlug
        ? protocolTitles.get(a.protocolSlug) ?? a.protocolSlug
        : a.certSlug
          ? certTitles.get(a.certSlug) ?? a.certSlug
          : a.masteryPathSlug
            ? pathTitles.get(a.masteryPathSlug) ?? a.masteryPathSlug
            : "",
      dueAt: a.dueAt,
      status: a.status,
      notesMd: a.notesMd,
      createdAt: a.createdAt,
      assignedByUsername: a.assignedByUsername,
    })),
    recommended,
  });
});

// --- GET /me/lab/skill-mri -----------------------------------------
//
// Mirrors the existing knowledge MRI shape: discipline → list of
// protocols and equipment with the caller's progress signal. Used
// by the MyLab dashboard + the "Lab" tab on the main MRI page.

meLabRouter.get("/skill-mri", requireAuth, async (c) => {
  const me = c.get("user")!;
  const db = getDb();

  const allProtocols = db
    .select({
      id: protocols.id,
      slug: protocols.slug,
      title: protocols.title,
      discipline: protocols.discipline,
    })
    .from(protocols)
    .where(eq(protocols.status, "published"))
    .all();

  const myRuns = db
    .select({
      protocolId: protocolRuns.protocolId,
      status: protocolRuns.status,
      signedOffAt: protocolRuns.signedOffAt,
      startedAt: protocolRuns.startedAt,
    })
    .from(protocolRuns)
    .where(eq(protocolRuns.userId, me.id))
    .all();
  const lastSignedOffByProto = new Map<string, string>();
  const inFlightProtoIds = new Set<string>();
  for (const r of myRuns) {
    if (r.status === "signed_off" && r.signedOffAt) {
      const cur = lastSignedOffByProto.get(r.protocolId);
      if (!cur || cur < r.signedOffAt) {
        lastSignedOffByProto.set(r.protocolId, r.signedOffAt);
      }
    } else if (
      r.status === "in_progress" ||
      r.status === "awaiting_signoff" ||
      r.status === "rejected"
    ) {
      inFlightProtoIds.add(r.protocolId);
    }
  }

  const allEquipment = db
    .select({
      id: equipment.id,
      slug: equipment.slug,
      title: equipment.title,
      discipline: equipment.discipline,
      trainingCertSlug: equipment.trainingCertSlug,
    })
    .from(equipment)
    .where(eq(equipment.status, "active"))
    .all();

  const heldCerts = new Set<string>();
  const nowIso = new Date().toISOString();
  db.select({
    certSlug: userSafetyCertifications.certSlug,
    expiresAt: userSafetyCertifications.expiresAt,
  })
    .from(userSafetyCertifications)
    .where(eq(userSafetyCertifications.userId, me.id))
    .all()
    .forEach((r) => {
      if (r.expiresAt === null || r.expiresAt > nowIso) {
        heldCerts.add(r.certSlug);
      }
    });

  const byDiscipline = new Map<
    string,
    {
      discipline: string;
      protocols: Array<{
        slug: string;
        title: string;
        status: "not_started" | "in_flight" | "signed_off";
        lastSignedOffAt: string | null;
      }>;
      equipment: Array<{
        slug: string;
        title: string;
        certified: boolean;
        trainingCertSlug: string | null;
      }>;
    }
  >();

  function ensureBucket(d: string) {
    let b = byDiscipline.get(d);
    if (!b) {
      b = { discipline: d, protocols: [], equipment: [] };
      byDiscipline.set(d, b);
    }
    return b;
  }

  for (const p of allProtocols) {
    const b = ensureBucket(p.discipline);
    const lastSigned = lastSignedOffByProto.get(p.id);
    b.protocols.push({
      slug: p.slug,
      title: p.title,
      status: lastSigned
        ? "signed_off"
        : inFlightProtoIds.has(p.id)
          ? "in_flight"
          : "not_started",
      lastSignedOffAt: lastSigned ?? null,
    });
  }
  for (const e of allEquipment) {
    const b = ensureBucket(e.discipline);
    const certified =
      e.trainingCertSlug === null ||
      e.trainingCertSlug === undefined ||
      heldCerts.has(e.trainingCertSlug);
    b.equipment.push({
      slug: e.slug,
      title: e.title,
      certified,
      trainingCertSlug: e.trainingCertSlug,
    });
  }

  // Mark assignment completion side-effect: any protocol assignment
  // whose targetSlug now has a signed-off run flips to 'completed'
  // (best-effort, no-op when nothing changed).
  const internAssignments = db
    .select({
      id: labAssignments.id,
      protocolSlug: labAssignments.protocolSlug,
      certSlug: labAssignments.certSlug,
      status: labAssignments.status,
    })
    .from(labAssignments)
    .where(eq(labAssignments.assignedToUserId, me.id))
    .all();
  const signedOffProtocolSlugs = new Set<string>();
  const protocolByIdToSlug = new Map<string, string>();
  allProtocols.forEach((p) => protocolByIdToSlug.set(p.id, p.slug));
  for (const protoId of lastSignedOffByProto.keys()) {
    const slug = protocolByIdToSlug.get(protoId);
    if (slug) signedOffProtocolSlugs.add(slug);
  }
  for (const a of internAssignments) {
    if (a.status === "completed") continue;
    if (a.protocolSlug && signedOffProtocolSlugs.has(a.protocolSlug)) {
      db.update(labAssignments)
        .set({ status: "completed" })
        .where(eq(labAssignments.id, a.id))
        .run();
    } else if (a.certSlug && heldCerts.has(a.certSlug)) {
      db.update(labAssignments)
        .set({ status: "completed" })
        .where(eq(labAssignments.id, a.id))
        .run();
    }
  }

  // Touch the unused `userProgress`, `notify`, etc. so unused-import
  // warnings don't bite. (notify is reserved for future "you've
  // completed a path" bell — left as a hook.)
  void userProgress;
  void notify;

  return c.json({
    disciplines: [...byDiscipline.values()].sort((a, b) =>
      a.discipline.localeCompare(b.discipline),
    ),
  });
});

// --- GET /me/lab/assignments ---------------------------------------
//
// Convenience: just the assignments without recommended-next-action,
// used when the caller wants a flat list (e.g. the LessonPage's
// "you have an assignment to do this" banner).

meLabRouter.get("/assignments", requireAuth, async (c) => {
  const me = c.get("user")!;
  const db = getDb();
  const rows = db
    .select({
      id: labAssignments.id,
      cohortSlug: cohorts.slug,
      cohortName: cohorts.name,
      protocolSlug: labAssignments.protocolSlug,
      certSlug: labAssignments.certSlug,
      masteryPathSlug: labAssignments.masteryPathSlug,
      dueAt: labAssignments.dueAt,
      status: labAssignments.status,
    })
    .from(labAssignments)
    .innerJoin(cohorts, eq(cohorts.id, labAssignments.cohortId))
    .where(eq(labAssignments.assignedToUserId, me.id))
    .all();
  return c.json({ assignments: rows });
});

// Suppress lint on imports kept for symmetry / future use.
void masteryNodes;

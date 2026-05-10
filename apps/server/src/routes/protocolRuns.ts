// Sprint 80 — Protocol runs.
//
// An intern starts a run against a published protocol's pinned
// version, ticks each step with optional observation + attachment
// refs, requests sign-off when done, and a mentor/organizer in their
// cohort approves or rejects. The version pin means later edits to
// the protocol don't rewrite history of what the intern actually
// followed.
//
// Routes:
//   POST   /lab/protocols/:slug/runs            — start (cert-gated)
//   GET    /me/lab/runs                         — my pending + completed
//   GET    /lab/runs/awaiting-signoff           — queue for mentors
//   GET    /lab/runs/:id                        — run detail (intern + cohort mentors)
//   PUT    /lab/runs/:id/steps/:ordinal         — mark step done / undone
//   POST   /lab/runs/:id/request-signoff        — fan out to mentors
//   POST   /lab/runs/:id/sign-off               — mentor approves
//   POST   /lab/runs/:id/reject                 — mentor rejects → in_progress

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  cohortMembers,
  getDb,
  protocolRuns,
  protocolSteps,
  protocols,
  users,
} from "@axiomic/db";
import { requireAuth } from "../middleware/auth";
import { notify } from "../lib/notifications";
import { activeCertSlugsForUser } from "./safetyCerts";
import type { Env } from "../env";

export const protocolRunsRouter = new Hono<Env>();
export const protocolRunsMeRouter = new Hono<Env>();

// Step state shape stored as JSON on protocolRuns.stepStateJson.
interface StepStateEntry {
  done: boolean;
  doneAt?: string;
  observation?: string;
  attachmentRefs?: string[];
}
type StepState = Record<string, StepStateEntry>; // key = ordinal as string

function parseStepState(json: string): StepState {
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as StepState;
  } catch {
    return {};
  }
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

// Find the cohorts a user belongs to. Mentors/organizers in those
// cohorts gate sign-offs; the request-signoff fan-out targets their
// userIds.
function userCohortIds(userId: string): string[] {
  const db = getDb();
  const rows = db
    .select({ cohortId: cohortMembers.cohortId })
    .from(cohortMembers)
    .where(eq(cohortMembers.userId, userId))
    .all();
  return rows.map((r) => r.cohortId);
}

// Mentors+organizers across the intern's cohorts. Returns userIds
// excluding the intern themselves (a self-sign-off is meaningless).
function mentorsForIntern(internId: string): string[] {
  const db = getDb();
  const cohorts = userCohortIds(internId);
  if (cohorts.length === 0) return [];
  const rows = db
    .select({ userId: cohortMembers.userId, role: cohortMembers.role })
    .from(cohortMembers)
    .where(inArray(cohortMembers.cohortId, cohorts))
    .all();
  const out = new Set<string>();
  for (const r of rows) {
    if (r.userId === internId) continue;
    if (r.role === "mentor" || r.role === "organizer") out.add(r.userId);
  }
  return [...out];
}

// True when `mentorId` is a mentor/organizer in any cohort the intern
// belongs to. Gates POST /lab/runs/:id/sign-off + reject.
function mentorCanSignOff(mentorId: string, internId: string): boolean {
  if (mentorId === internId) return false;
  const db = getDb();
  const internCohorts = userCohortIds(internId);
  if (internCohorts.length === 0) return false;
  const row = db
    .select({ id: cohortMembers.id })
    .from(cohortMembers)
    .where(
      and(
        eq(cohortMembers.userId, mentorId),
        inArray(cohortMembers.cohortId, internCohorts),
        inArray(cohortMembers.role, ["mentor", "organizer"]),
      ),
    )
    .get();
  return !!row;
}

interface ProtocolRunRow {
  id: string;
  protocolId: string;
  protocolVersion: number;
  userId: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  signedOffAt: string | null;
  signedOffById: string | null;
  stepStateJson: string;
  notesMd: string;
  signOffNotesMd: string | null;
  protocolSlug: string;
  protocolTitle: string;
  protocolDiscipline: string;
  internUsername: string;
  internDisplayName: string | null;
}

function projectRun(row: ProtocolRunRow) {
  return {
    id: row.id,
    protocolId: row.protocolId,
    protocolSlug: row.protocolSlug,
    protocolTitle: row.protocolTitle,
    protocolDiscipline: row.protocolDiscipline,
    protocolVersion: row.protocolVersion,
    userId: row.userId,
    internUsername: row.internUsername,
    internDisplayName: row.internDisplayName,
    status: row.status,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    signedOffAt: row.signedOffAt,
    signedOffById: row.signedOffById,
    stepState: parseStepState(row.stepStateJson),
    notesMd: row.notesMd,
    signOffNotesMd: row.signOffNotesMd,
  };
}

const RUN_LIST_COLS = {
  id: protocolRuns.id,
  protocolId: protocolRuns.protocolId,
  protocolVersion: protocolRuns.protocolVersion,
  userId: protocolRuns.userId,
  status: protocolRuns.status,
  startedAt: protocolRuns.startedAt,
  completedAt: protocolRuns.completedAt,
  signedOffAt: protocolRuns.signedOffAt,
  signedOffById: protocolRuns.signedOffById,
  stepStateJson: protocolRuns.stepStateJson,
  notesMd: protocolRuns.notesMd,
  signOffNotesMd: protocolRuns.signOffNotesMd,
  protocolSlug: protocols.slug,
  protocolTitle: protocols.title,
  protocolDiscipline: protocols.discipline,
  internUsername: users.username,
  internDisplayName: users.displayName,
} as const;

// POST /lab/runs/start — start a run for a protocol slug. Cert-gated:
// returns 412 with `missingCerts` when the intern lacks any required
// cert. Body: { protocolSlug }.
const startRunSchema = z.object({
  protocolSlug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

protocolRunsRouter.post(
  "/start",
  requireAuth,
  zValidator("json", startRunSchema),
  async (c) => {
    const { protocolSlug } = c.req.valid("json");
    const user = c.get("user")!;
    const db = getDb();

    const protocol = db
      .select({
        id: protocols.id,
        status: protocols.status,
        version: protocols.version,
        requiredCertsJson: protocols.requiredCertsJson,
      })
      .from(protocols)
      .where(eq(protocols.slug, protocolSlug))
      .get();
    if (!protocol) return c.json({ error: "Protocol not found" }, 404);
    if (protocol.status !== "published") {
      return c.json({ error: "Protocol is not published" }, 400);
    }

    const required = safeParseStrArray(protocol.requiredCertsJson);
    if (required.length > 0) {
      const held = activeCertSlugsForUser(user.id);
      const missing = required.filter((s) => !held.has(s));
      if (missing.length > 0) {
        return c.json(
          {
            error: "Missing required safety certifications",
            missingCerts: missing,
          },
          412,
        );
      }
    }

    const id = randomUUID();
    db.insert(protocolRuns)
      .values({
        id,
        protocolId: protocol.id,
        protocolVersion: protocol.version,
        userId: user.id,
        status: "in_progress",
      })
      .run();

    return c.json({ runId: id, protocolVersion: protocol.version }, 201);
  },
);

// GET /lab/runs/awaiting-signoff — runs in cohorts where the caller
// is mentor/organizer, status='awaiting_signoff'.
protocolRunsRouter.get("/awaiting-signoff", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb();

  const myCohorts = userCohortIds(user.id);
  if (myCohorts.length === 0) return c.json({ runs: [] });

  const myMentorRoles = db
    .select({ cohortId: cohortMembers.cohortId, role: cohortMembers.role })
    .from(cohortMembers)
    .where(
      and(
        eq(cohortMembers.userId, user.id),
        inArray(cohortMembers.cohortId, myCohorts),
        inArray(cohortMembers.role, ["mentor", "organizer"]),
      ),
    )
    .all();
  if (myMentorRoles.length === 0) return c.json({ runs: [] });
  const mentorCohortIds = myMentorRoles.map((r) => r.cohortId);

  // Interns in those cohorts.
  const interns = db
    .select({ userId: cohortMembers.userId })
    .from(cohortMembers)
    .where(inArray(cohortMembers.cohortId, mentorCohortIds))
    .all();
  const internIds = [...new Set(interns.map((r) => r.userId))].filter(
    (id) => id !== user.id,
  );
  if (internIds.length === 0) return c.json({ runs: [] });

  const rows = db
    .select(RUN_LIST_COLS)
    .from(protocolRuns)
    .innerJoin(protocols, eq(protocolRuns.protocolId, protocols.id))
    .innerJoin(users, eq(protocolRuns.userId, users.id))
    .where(
      and(
        eq(protocolRuns.status, "awaiting_signoff"),
        inArray(protocolRuns.userId, internIds),
      ),
    )
    .orderBy(asc(protocolRuns.startedAt))
    .all();

  return c.json({ runs: rows.map(projectRun) });
});

// GET /lab/runs/:id — run detail. Visible to the intern + cohort
// mentors+organizers.
protocolRunsRouter.get("/:id", requireAuth, async (c) => {
  const id = c.req.param("id")!;
  const user = c.get("user")!;
  const db = getDb();

  const row = db
    .select(RUN_LIST_COLS)
    .from(protocolRuns)
    .innerJoin(protocols, eq(protocolRuns.protocolId, protocols.id))
    .innerJoin(users, eq(protocolRuns.userId, users.id))
    .where(eq(protocolRuns.id, id))
    .get();
  if (!row) return c.json({ error: "Run not found" }, 404);

  if (row.userId !== user.id && !mentorCanSignOff(user.id, row.userId)) {
    return c.json({ error: "Run not found" }, 404);
  }

  // Fetch steps for the pinned protocol so the runner UI can render
  // the procedure. v1 reads from the live `protocolSteps` table; v2
  // could resolve via `protocolVersions.snapshotJson` if the protocol
  // has been edited since the run started.
  const steps = db
    .select({
      id: protocolSteps.id,
      ordinal: protocolSteps.ordinal,
      title: protocolSteps.title,
      instructionMd: protocolSteps.instructionMd,
      safetyNotesMd: protocolSteps.safetyNotesMd,
      verificationMd: protocolSteps.verificationMd,
    })
    .from(protocolSteps)
    .where(eq(protocolSteps.protocolId, row.protocolId))
    .orderBy(asc(protocolSteps.ordinal))
    .all();

  return c.json({
    run: projectRun(row),
    steps,
    canSignOff: row.userId !== user.id,
  });
});

const stepUpdateSchema = z.object({
  done: z.boolean(),
  observation: z.string().max(2000).optional(),
  attachmentRefs: z.array(z.string().min(1).max(200)).max(20).optional(),
});

// PUT /lab/runs/:id/steps/:ordinal — set a step's done/observation
// state. Owner-only.
protocolRunsRouter.put(
  "/:id/steps/:ordinal",
  requireAuth,
  zValidator("json", stepUpdateSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const ordinalStr = c.req.param("ordinal")!;
    const ordinal = parseInt(ordinalStr, 10);
    if (!Number.isFinite(ordinal) || ordinal < 1) {
      return c.json({ error: "Bad ordinal" }, 400);
    }
    const user = c.get("user")!;
    const db = getDb();

    const run = db
      .select({
        id: protocolRuns.id,
        userId: protocolRuns.userId,
        status: protocolRuns.status,
        stepStateJson: protocolRuns.stepStateJson,
        protocolId: protocolRuns.protocolId,
      })
      .from(protocolRuns)
      .where(eq(protocolRuns.id, id))
      .get();
    if (!run) return c.json({ error: "Run not found" }, 404);
    if (run.userId !== user.id) return c.json({ error: "Forbidden" }, 403);
    if (run.status === "signed_off") {
      return c.json({ error: "Run already signed off" }, 400);
    }

    // Verify the ordinal exists on the underlying protocol.
    const stepExists = db
      .select({ id: protocolSteps.id })
      .from(protocolSteps)
      .where(
        and(
          eq(protocolSteps.protocolId, run.protocolId),
          eq(protocolSteps.ordinal, ordinal),
        ),
      )
      .get();
    if (!stepExists) return c.json({ error: "Step not found" }, 404);

    const data = c.req.valid("json");
    const state = parseStepState(run.stepStateJson);
    const key = String(ordinal);
    if (data.done) {
      state[key] = {
        done: true,
        doneAt: new Date().toISOString(),
        observation: data.observation ?? "",
        attachmentRefs: data.attachmentRefs ?? [],
      };
    } else {
      delete state[key];
    }

    // If the user re-opens a step on a run that was awaiting signoff,
    // bump it back to in_progress so they can edit further.
    const nextStatus =
      run.status === "awaiting_signoff" && !data.done
        ? "in_progress"
        : run.status;

    db.update(protocolRuns)
      .set({
        stepStateJson: JSON.stringify(state),
        status: nextStatus,
      })
      .where(eq(protocolRuns.id, id))
      .run();

    return c.json({ ok: true, status: nextStatus });
  },
);

// POST /lab/runs/:id/request-signoff — owner only; fans out to cohort
// mentors+organizers and flips status to awaiting_signoff. Refuses
// if no steps are marked done — a "request review on nothing" run
// would just spam the queue.
protocolRunsRouter.post(
  "/:id/request-signoff",
  requireAuth,
  async (c) => {
    const id = c.req.param("id")!;
    const user = c.get("user")!;
    const db = getDb();

    const run = db
      .select({
        id: protocolRuns.id,
        userId: protocolRuns.userId,
        status: protocolRuns.status,
        stepStateJson: protocolRuns.stepStateJson,
        protocolId: protocolRuns.protocolId,
      })
      .from(protocolRuns)
      .where(eq(protocolRuns.id, id))
      .get();
    if (!run) return c.json({ error: "Run not found" }, 404);
    if (run.userId !== user.id) return c.json({ error: "Forbidden" }, 403);

    const protocol = db
      .select({ slug: protocols.slug, title: protocols.title })
      .from(protocols)
      .where(eq(protocols.id, run.protocolId))
      .get();
    if (!protocol) return c.json({ error: "Protocol vanished" }, 404);

    const totalSteps = db
      .select({ id: protocolSteps.id })
      .from(protocolSteps)
      .where(eq(protocolSteps.protocolId, run.protocolId))
      .all().length;
    const state = parseStepState(run.stepStateJson);
    const doneCount = Object.values(state).filter((s) => s.done).length;
    if (doneCount === 0) {
      return c.json({ error: "Mark at least one step done first" }, 400);
    }

    db.update(protocolRuns)
      .set({
        status: "awaiting_signoff",
        completedAt:
          doneCount >= totalSteps
            ? new Date().toISOString()
            : null,
      })
      .where(eq(protocolRuns.id, id))
      .run();

    const recipients = mentorsForIntern(user.id);
    for (const recipientId of recipients) {
      await notify({
        recipientId,
        actorId: user.id,
        kind: "lab_signoff_requested",
        subjectType: "lab_protocol_run",
        subjectId: run.id,
        contextSlug: protocol.slug,
        preview: protocol.title,
      });
    }

    return c.json({
      ok: true,
      mentorsNotified: recipients.length,
      doneSteps: doneCount,
      totalSteps,
    });
  },
);

const signOffSchema = z.object({
  notesMd: z.string().max(4000).optional(),
});

// POST /lab/runs/:id/sign-off — mentor approves.
protocolRunsRouter.post(
  "/:id/sign-off",
  requireAuth,
  zValidator("json", signOffSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const mentor = c.get("user")!;
    const db = getDb();

    const run = db
      .select({
        id: protocolRuns.id,
        userId: protocolRuns.userId,
        status: protocolRuns.status,
        protocolId: protocolRuns.protocolId,
      })
      .from(protocolRuns)
      .where(eq(protocolRuns.id, id))
      .get();
    if (!run) return c.json({ error: "Run not found" }, 404);
    if (!mentorCanSignOff(mentor.id, run.userId)) {
      return c.json(
        { error: "Only cohort mentors/organizers can sign off." },
        403,
      );
    }
    if (run.status !== "awaiting_signoff") {
      return c.json(
        { error: "Run is not awaiting sign-off." },
        400,
      );
    }

    const protocol = db
      .select({ slug: protocols.slug, title: protocols.title })
      .from(protocols)
      .where(eq(protocols.id, run.protocolId))
      .get();
    if (!protocol) return c.json({ error: "Protocol vanished" }, 404);

    const data = c.req.valid("json");
    const now = new Date().toISOString();
    db.update(protocolRuns)
      .set({
        status: "signed_off",
        signedOffAt: now,
        signedOffById: mentor.id,
        signOffNotesMd: data.notesMd ?? null,
        completedAt: now,
      })
      .where(eq(protocolRuns.id, id))
      .run();

    await notify({
      recipientId: run.userId,
      actorId: mentor.id,
      kind: "lab_signoff_approved",
      subjectType: "lab_protocol_run",
      subjectId: run.id,
      contextSlug: protocol.slug,
      preview: protocol.title,
    });

    return c.json({ ok: true });
  },
);

// POST /lab/runs/:id/reject — mentor sends back. Run goes back to
// in_progress so the intern can address the notes.
protocolRunsRouter.post(
  "/:id/reject",
  requireAuth,
  zValidator("json", signOffSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const mentor = c.get("user")!;
    const db = getDb();

    const run = db
      .select({
        id: protocolRuns.id,
        userId: protocolRuns.userId,
        status: protocolRuns.status,
        protocolId: protocolRuns.protocolId,
      })
      .from(protocolRuns)
      .where(eq(protocolRuns.id, id))
      .get();
    if (!run) return c.json({ error: "Run not found" }, 404);
    if (!mentorCanSignOff(mentor.id, run.userId)) {
      return c.json(
        { error: "Only cohort mentors/organizers can reject." },
        403,
      );
    }
    if (run.status !== "awaiting_signoff") {
      return c.json({ error: "Run is not awaiting sign-off." }, 400);
    }

    const protocol = db
      .select({ slug: protocols.slug, title: protocols.title })
      .from(protocols)
      .where(eq(protocols.id, run.protocolId))
      .get();
    if (!protocol) return c.json({ error: "Protocol vanished" }, 404);

    const data = c.req.valid("json");
    db.update(protocolRuns)
      .set({
        status: "in_progress",
        completedAt: null,
        signOffNotesMd: data.notesMd ?? null,
      })
      .where(eq(protocolRuns.id, id))
      .run();

    await notify({
      recipientId: run.userId,
      actorId: mentor.id,
      kind: "lab_signoff_rejected",
      subjectType: "lab_protocol_run",
      subjectId: run.id,
      contextSlug: protocol.slug,
      preview: data.notesMd
        ? data.notesMd.slice(0, 140)
        : protocol.title,
    });

    return c.json({ ok: true });
  },
);

// GET /me/lab/runs — caller's runs (active + completed). Mounted on
// the /me router (see server index.ts).
protocolRunsMeRouter.get("/", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb();
  const status = c.req.query("status");

  const baseWhere = eq(protocolRuns.userId, user.id);
  const where = status
    ? and(baseWhere, eq(protocolRuns.status, status))
    : baseWhere;

  const rows = db
    .select(RUN_LIST_COLS)
    .from(protocolRuns)
    .innerJoin(protocols, eq(protocolRuns.protocolId, protocols.id))
    .innerJoin(users, eq(protocolRuns.userId, users.id))
    .where(where)
    .orderBy(desc(protocolRuns.startedAt))
    .all();

  return c.json({ runs: rows.map(projectRun) });
});

// Suppress unused warning for `ne` — kept for symmetry.
void ne;

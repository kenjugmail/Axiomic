// S85 — complexity-floor validator for year-scale capstones.
//
// Skill-drill capstones (the existing 4-10 week ones) bypass this
// entirely. Long-arc capstones must clear an authoring-time floor
// before they can be created or published: ≥3 domains, hour range
// in [200, 2000], a non-trivial real-world deliverable description,
// and at least one milestone with a calendar due date.
//
// The numbers are deliberately conservative — easy to author past,
// hard to violate by accident. The point is that "if you can vibe-
// code it, it doesn't qualify" — multi-domain integration + calendar
// time pressure + a documented tangible deliverable are the load-
// bearing requirements.

export const LONG_ARC_MIN_DOMAINS = 3;
export const LONG_ARC_MIN_HOURS = 200;
export const LONG_ARC_MAX_HOURS = 2000;
export const LONG_ARC_MIN_DELIVERABLE_CHARS = 200;

export type ScaleTier = "skill_drill" | "long_arc";

export interface LongArcFloorInput {
  domains: string[];
  estimatedHoursMin: number | null | undefined;
  estimatedHoursMax: number | null | undefined;
  realWorldDeliverableMd: string | null | undefined;
  milestones: Array<{ dueAt: string | null | undefined }>;
}

export type LongArcFloorResult =
  | { ok: true }
  | { ok: false; errors: string[] };

export function validateLongArcFloor(
  input: LongArcFloorInput,
): LongArcFloorResult {
  const errors: string[] = [];

  if (input.domains.length < LONG_ARC_MIN_DOMAINS) {
    errors.push(
      `long_arc capstones require at least ${LONG_ARC_MIN_DOMAINS} domains (got ${input.domains.length})`,
    );
  }

  const min = input.estimatedHoursMin;
  const max = input.estimatedHoursMax;
  if (min == null || max == null) {
    errors.push("long_arc capstones require estimatedHoursMin and estimatedHoursMax");
  } else {
    if (min < LONG_ARC_MIN_HOURS) {
      errors.push(`estimatedHoursMin must be ≥${LONG_ARC_MIN_HOURS} (got ${min})`);
    }
    if (max > LONG_ARC_MAX_HOURS) {
      errors.push(`estimatedHoursMax must be ≤${LONG_ARC_MAX_HOURS} (got ${max})`);
    }
    if (min > max) {
      errors.push(`estimatedHoursMin (${min}) must not exceed estimatedHoursMax (${max})`);
    }
  }

  const deliverable = (input.realWorldDeliverableMd ?? "").trim();
  if (deliverable.length < LONG_ARC_MIN_DELIVERABLE_CHARS) {
    errors.push(
      `realWorldDeliverableMd must describe the tangible end-state (≥${LONG_ARC_MIN_DELIVERABLE_CHARS} chars; got ${deliverable.length})`,
    );
  }

  const hasDate = input.milestones.some((m) => {
    const v = m.dueAt;
    return typeof v === "string" && v.trim().length > 0;
  });
  if (!hasDate) {
    errors.push("at least one milestone must have a dueAt date");
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

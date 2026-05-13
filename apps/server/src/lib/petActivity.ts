// Phase 14D — pet-engagement telemetry.
//
// Wraps recordActivity for pet-mutation kinds. Centralizing keeps
// the route handlers terse and guarantees a single place to widen
// the contract (e.g. add a ref slug payload column later).
//
// Best-effort: recordActivity already swallows + logs errors so a
// telemetry failure never breaks the user's mutation.

import { recordActivity, type ActivityKind } from "./achievements";
import type { Db } from "@axiomic/db";

export type PetActivityKind =
  | "pet_equip"
  | "pet_unequip"
  | "pet_buy_cosmetic"
  | "pet_buy_skin"
  | "pet_skin_equip"
  | "pet_skin_unequip"
  | "pet_rename"
  | "pet_hatch_another"
  | "pet_activate";

// Records a pet-engagement event. The optional ref slug is logged
// for debugging but not persisted — the activity_events.kind column
// is the only signal the heatmap reads.
export function recordPetActivity(
  userId: string,
  kind: PetActivityKind,
  _ref?: string,
  db?: Db,
): void {
  recordActivity(userId, kind satisfies ActivityKind, db);
}

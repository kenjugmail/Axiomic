#!/usr/bin/env bun
// Capture a lesson-quality snapshot for trend tracking on the
// /admin/lesson-quality dashboard. Thin wrapper around
// captureQualitySnapshot() (which holds the DB + drizzle logic, so this
// script needs no workspace-package imports of its own).
//
// Usage: bun run snapshot:quality

import { captureQualitySnapshot } from "../apps/server/src/lib/qualitySnapshot";

const r = captureQualitySnapshot();
if (r.count === 0) {
  console.log(
    "No lesson nodes with content found — nothing to snapshot. (Did you run `bun run db:seed`?)",
  );
} else {
  console.log(
    `Snapshot ${r.runAt}: recorded ${r.count} lessons (avg composite ${r.avg}) into lesson_quality_snapshots.`,
  );
}

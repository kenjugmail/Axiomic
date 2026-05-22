// Daily lesson-quality snapshot for trend tracking. Scores every lesson
// node from the DB and records one timestamped batch into
// lesson_quality_snapshots; the /admin/lesson-quality dashboard reads the
// latest batch for per-lesson deltas and the history endpoint reads the
// batch series for a corpus trend. A repeated run is harmless — it simply
// appends another batch, and deltas always compare to the most recent.

import { captureQualitySnapshot } from "../lib/qualitySnapshot";
import type { JobDefinition } from "../lib/jobs";

export const captureQualitySnapshotJob: JobDefinition = {
  name: "capture_quality_snapshot",
  intervalMs: 24 * 60 * 60_000, // daily
  async run() {
    const r = captureQualitySnapshot();
    return {
      itemsProcessed: r.count,
      message: `snapshot ${r.runAt}: ${r.count} lessons, avg composite ${r.avg}`,
    };
  },
};

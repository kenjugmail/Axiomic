// Phase 33B — hourly signed tree head for the credential
// transparency log. Idempotent: signTreeHead() is a no-op when
// the chain hasn't grown since the last signed head, so a missed
// or repeated run is harmless.

import { signTreeHead } from "../lib/transparency";
import type { JobDefinition } from "../lib/jobs";

export const signTreeHeadJob: JobDefinition = {
  name: "sign_tree_head",
  intervalMs: 60 * 60_000, // hourly
  async run() {
    const r = signTreeHead();
    return {
      itemsProcessed: r.signed ? 1 : 0,
      message: r.signed
        ? `signed tree head at size ${r.treeSize}`
        : `no new leaves (size ${r.treeSize})`,
    };
  },
};

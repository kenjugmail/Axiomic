// Sprint 69 — /admin/jobs endpoint tests. Anonymous traffic is
// blocked at the requireAdmin middleware; we test the auth gate
// here. Full job-list payload is exercised via the lib/jobs.test.ts
// + manual smoke at /admin/jobs.

import { describe, test, expect } from "bun:test";
import { app } from "../index";

describe("/admin/jobs (Sprint 69)", () => {
  test("anonymous GET is rejected with 401/403", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/v1/admin/jobs"),
    );
    expect([401, 403]).toContain(res.status);
  });

  test("anonymous POST run is rejected with 401/403", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/v1/admin/jobs/ingest_arxiv/run", {
        method: "POST",
      }),
    );
    expect([401, 403]).toContain(res.status);
  });
});

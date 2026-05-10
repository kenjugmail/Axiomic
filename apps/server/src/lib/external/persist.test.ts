// Sprint 69 — External-paper persistence tests.
//
// Validates upsert behavior + content-hash short-circuit. Uses a real
// DB (the test harness mounts a temp sqlite per run).

import { describe, test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { externalPapers, getDb } from "@axiomic/db";
import { persistExternalPapers } from "./persist";
import type { NormalizedExternalPaper } from "./normalize";

function makePaper(overrides: Partial<NormalizedExternalPaper> = {}): NormalizedExternalPaper {
  return {
    source: "arxiv",
    sourceId: `test-${Math.random().toString(36).slice(2, 10)}`,
    doi: null,
    title: "Test paper",
    abstract: "Body.",
    authors: [{ name: "Alice" }],
    venue: "arXiv",
    publishedAt: "2025-01-01",
    pdfUrl: null,
    htmlUrl: null,
    topics: ["cs.LG"],
    citationCount: 0,
    rawJson: {},
    ...overrides,
  };
}

describe("persistExternalPapers (Sprint 69)", () => {
  test("first call inserts; second call with same content skips", () => {
    const paper = makePaper();
    const r1 = persistExternalPapers([paper]);
    expect(r1.inserted).toBe(1);
    expect(r1.skipped).toBe(0);
    const r2 = persistExternalPapers([paper]);
    expect(r2.inserted).toBe(0);
    expect(r2.skipped).toBe(1);
  });

  test("title change triggers update path with fresh fetchedAt", () => {
    const paper = makePaper();
    persistExternalPapers([paper]);
    const updated = { ...paper, title: paper.title + " v2" };
    const r = persistExternalPapers([updated]);
    expect(r.updated).toBe(1);
    expect(r.inserted).toBe(0);
    expect(r.skipped).toBe(0);

    const row = getDb()
      .select({ title: externalPapers.title })
      .from(externalPapers)
      .where(eq(externalPapers.sourceId, paper.sourceId))
      .get();
    expect(row?.title).toContain("v2");
  });

  test("citation-count drift alone does not trigger an update", () => {
    const paper = makePaper();
    persistExternalPapers([paper]);
    const drifted = { ...paper, citationCount: 500 };
    const r = persistExternalPapers([drifted]);
    // contentHash ignores citationCount, so this is a skip.
    expect(r.skipped).toBe(1);
    expect(r.updated).toBe(0);
  });

  test("multiple papers in one batch upsert independently", () => {
    const p1 = makePaper();
    const p2 = makePaper({ source: "openalex", sourceId: "W" + Math.random() });
    const r = persistExternalPapers([p1, p2]);
    expect(r.inserted).toBe(2);
  });
});

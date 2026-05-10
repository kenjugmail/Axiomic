// Sprint 69 — Normalize + content-hash unit tests.

import { describe, test, expect } from "bun:test";
import {
  externalPaperContentHash,
  NormalizedExternalPaperSchema,
  type NormalizedExternalPaper,
} from "./normalize";

const sample: NormalizedExternalPaper = {
  source: "arxiv",
  sourceId: "2501.12345",
  doi: null,
  title: "Sample paper",
  abstract: "An abstract.",
  authors: [{ name: "Alice" }, { name: "Bob" }],
  venue: "arXiv",
  publishedAt: "2025-01-01",
  pdfUrl: null,
  htmlUrl: "https://arxiv.org/abs/2501.12345",
  topics: ["cs.LG"],
  citationCount: 0,
  rawJson: {},
};

describe("normalize external paper (Sprint 69)", () => {
  test("schema validates a well-formed paper", () => {
    expect(() => NormalizedExternalPaperSchema.parse(sample)).not.toThrow();
  });

  test("schema rejects unknown source", () => {
    expect(() =>
      NormalizedExternalPaperSchema.parse({ ...sample, source: "scopus" }),
    ).toThrow();
  });

  test("schema rejects empty sourceId or title", () => {
    expect(() =>
      NormalizedExternalPaperSchema.parse({ ...sample, sourceId: "" }),
    ).toThrow();
    expect(() =>
      NormalizedExternalPaperSchema.parse({ ...sample, title: "" }),
    ).toThrow();
  });

  test("contentHash is deterministic for identical inputs", () => {
    expect(externalPaperContentHash(sample)).toBe(
      externalPaperContentHash(sample),
    );
  });

  test("contentHash changes when title changes", () => {
    const altered = { ...sample, title: "Sample paper v2" };
    expect(externalPaperContentHash(altered)).not.toBe(
      externalPaperContentHash(sample),
    );
  });

  test("contentHash IGNORES citation count drift", () => {
    const drifted = { ...sample, citationCount: 100 };
    expect(externalPaperContentHash(drifted)).toBe(
      externalPaperContentHash(sample),
    );
  });

  test("contentHash changes when authors change", () => {
    const newAuthors = { ...sample, authors: [{ name: "Carol" }] };
    expect(externalPaperContentHash(newAuthors)).not.toBe(
      externalPaperContentHash(sample),
    );
  });

  test("contentHash changes when topics change", () => {
    const newTopics = { ...sample, topics: ["cs.CL"] };
    expect(externalPaperContentHash(newTopics)).not.toBe(
      externalPaperContentHash(sample),
    );
  });

  test("contentHash is stable to topic ordering", () => {
    const a = { ...sample, topics: ["a", "b", "c"] };
    const b = { ...sample, topics: ["c", "b", "a"] };
    expect(externalPaperContentHash(a)).toBe(externalPaperContentHash(b));
  });
});

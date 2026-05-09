// Sprint 71 — normalizeGrant + content-hash unit tests.

import { describe, test, expect } from "bun:test";
import {
  grantContentHash,
  NormalizedGrantSchema,
  type NormalizedGrant,
} from "./normalizeGrant";

const sample: NormalizedGrant = {
  source: "nih",
  sourceId: "5R01CA123456-03",
  agency: "NIH (NCI)",
  title: "Sample grant",
  summary: "Short summary.",
  fullDescription: "Long description body.",
  mechanism: "R01",
  amountCeiling: 250_000,
  postedAt: "2025-01-01",
  deadlineAt: "2026-12-31",
  url: "https://example.com",
  topics: ["cancer", "immunology"],
  rawJson: {},
};

describe("normalizeGrant (Sprint 71)", () => {
  test("schema validates a well-formed grant", () => {
    expect(() => NormalizedGrantSchema.parse(sample)).not.toThrow();
  });

  test("schema rejects unknown source", () => {
    expect(() =>
      NormalizedGrantSchema.parse({ ...sample, source: "darpa" }),
    ).toThrow();
  });

  test("schema rejects empty title or sourceId", () => {
    expect(() =>
      NormalizedGrantSchema.parse({ ...sample, title: "" }),
    ).toThrow();
    expect(() =>
      NormalizedGrantSchema.parse({ ...sample, sourceId: "" }),
    ).toThrow();
  });

  test("schema accepts negative amountCeiling rejection (must be >= 0)", () => {
    expect(() =>
      NormalizedGrantSchema.parse({ ...sample, amountCeiling: -1 }),
    ).toThrow();
  });

  test("contentHash is deterministic + stable to identical inputs", () => {
    expect(grantContentHash(sample)).toBe(grantContentHash(sample));
  });

  test("contentHash IGNORES amountCeiling drift", () => {
    const drift = { ...sample, amountCeiling: 10_000 };
    expect(grantContentHash(drift)).toBe(grantContentHash(sample));
  });

  test("contentHash IGNORES deadline drift (just the schedule moved)", () => {
    const drift = { ...sample, deadlineAt: "2026-06-30" };
    expect(grantContentHash(drift)).toBe(grantContentHash(sample));
  });

  test("contentHash CHANGES when title changes", () => {
    const altered = { ...sample, title: sample.title + " v2" };
    expect(grantContentHash(altered)).not.toBe(grantContentHash(sample));
  });

  test("contentHash is stable to topic ordering", () => {
    const a = { ...sample, topics: ["a", "b", "c"] };
    const b = { ...sample, topics: ["c", "b", "a"] };
    expect(grantContentHash(a)).toBe(grantContentHash(b));
  });
});

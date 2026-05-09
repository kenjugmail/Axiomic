// Sprint 72 — extractPaperRefs unit tests.

import { describe, test, expect } from "bun:test";
import { extractPaperRefs } from "./extractPaperRefs";

describe("extractPaperRefs (Sprint 72)", () => {
  test("extracts a bare DOI", () => {
    const refs = extractPaperRefs("Read 10.1038/s41586-022-04866-z!");
    expect(refs).toEqual([{ source: "doi", sourceId: "10.1038/s41586-022-04866-z" }]);
  });

  test("extracts a doi: prefixed DOI", () => {
    const refs = extractPaperRefs("doi:10.1234/foo");
    expect(refs).toEqual([{ source: "doi", sourceId: "10.1234/foo" }]);
  });

  test("extracts a https://doi.org URL", () => {
    const refs = extractPaperRefs(
      "see https://doi.org/10.1234/bar.123 for details",
    );
    expect(refs).toEqual([{ source: "doi", sourceId: "10.1234/bar.123" }]);
  });

  test("extracts an arXiv id with arxiv: prefix", () => {
    const refs = extractPaperRefs("arXiv:2501.12345");
    expect(refs.find((r) => r.source === "arxiv")?.sourceId).toBe("2501.12345");
  });

  test("extracts an arxiv URL with version suffix", () => {
    const refs = extractPaperRefs(
      "https://arxiv.org/abs/2401.99999v3 is great",
    );
    expect(refs.find((r) => r.source === "arxiv")?.sourceId).toBe("2401.99999");
  });

  test("dedups when both arxiv: prefix and bare id appear", () => {
    const refs = extractPaperRefs("arxiv:2501.00001 and bare 2501.00001");
    expect(refs.filter((r) => r.source === "arxiv").length).toBe(1);
  });

  test("returns empty list for plain text without refs", () => {
    expect(extractPaperRefs("Hello world!")).toEqual([]);
    expect(extractPaperRefs("")).toEqual([]);
  });

  test("extracts multiple DOIs in one post", () => {
    const refs = extractPaperRefs(
      "compare 10.1000/foo with 10.2000/bar today",
    );
    const dois = refs.filter((r) => r.source === "doi").map((r) => r.sourceId);
    expect(dois).toContain("10.1000/foo");
    expect(dois).toContain("10.2000/bar");
  });

  test("does not match malformed arxiv ids", () => {
    const refs = extractPaperRefs("not an id: 99.999");
    expect(refs.filter((r) => r.source === "arxiv")).toEqual([]);
  });

  test("regex statefulness does not leak across calls", () => {
    extractPaperRefs("arxiv:2501.11111");
    const refs = extractPaperRefs("arxiv:2501.22222");
    expect(refs.find((r) => r.source === "arxiv")?.sourceId).toBe("2501.22222");
  });
});

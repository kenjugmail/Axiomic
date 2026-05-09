// Sprint 69 — PubMed ingestor tests.

import { describe, test, expect } from "bun:test";
import { fetchPubmedPapers } from "./pubmedClient";
import { _resetHostBucketsForTests } from "./httpClient";

describe("pubmedClient (Sprint 69)", () => {
  test("two-step esearch + esummary normalizes correctly", async () => {
    _resetHostBucketsForTests();
    const search = {
      esearchresult: {
        idlist: ["12345", "67890"],
        count: "2",
      },
    };
    const summary = {
      result: {
        uids: ["12345", "67890"],
        "12345": {
          uid: "12345",
          title: "First study",
          fulljournalname: "Nature",
          pubdate: "2025 Jan",
          authors: [
            { name: "A. Smith", authtype: "Author" },
            { name: "B. Jones", authtype: "Author" },
            { name: "Big Group", authtype: "CollectiveName" },
          ],
          articleids: [
            { idtype: "pubmed", value: "12345" },
            { idtype: "doi", value: "10.1038/foo" },
          ],
          pubtype: ["Review"],
        },
        "67890": {
          uid: "67890",
          title: "Second study",
          source: "JAMA",
          authors: [{ name: "C. Liu", authtype: "Author" }],
        },
      },
    };

    const fetchImpl = async (
      input: string | URL | Request,
    ): Promise<Response> => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("esearch.fcgi")) {
        return new Response(JSON.stringify(search), { status: 200 });
      }
      if (url.includes("esummary.fcgi")) {
        return new Response(JSON.stringify(summary), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    };

    const papers = await fetchPubmedPapers(
      { term: "covid", retmax: 10 },
      { fetchImpl },
    );
    expect(papers.length).toBe(2);

    const first = papers.find((p) => p.sourceId === "12345");
    expect(first).toBeDefined();
    expect(first!.source).toBe("pubmed");
    expect(first!.title).toBe("First study");
    expect(first!.venue).toBe("Nature");
    expect(first!.doi).toBe("10.1038/foo");
    // Collective-name authors are filtered out.
    expect(first!.authors.length).toBe(2);
    expect(first!.authors.map((a) => a.name)).toEqual(["A. Smith", "B. Jones"]);
    expect(first!.htmlUrl).toContain("pubmed.ncbi.nlm.nih.gov/12345");
  });

  test("returns empty list when esearch yields no IDs", async () => {
    _resetHostBucketsForTests();
    const fetchImpl = async (): Promise<Response> =>
      new Response(JSON.stringify({ esearchresult: { idlist: [], count: "0" } }), {
        status: 200,
      });
    const papers = await fetchPubmedPapers(
      { term: "nothing-matches" },
      { fetchImpl },
    );
    expect(papers).toEqual([]);
  });

  test("non-2xx esearch throws", async () => {
    _resetHostBucketsForTests();
    const fetchImpl = async (): Promise<Response> =>
      new Response("bad", { status: 500 });
    await expect(
      fetchPubmedPapers({ term: "x" }, { fetchImpl }),
    ).rejects.toThrow();
  });
});

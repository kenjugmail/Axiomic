// Sprint 69 — OpenAlex ingestor parsing tests.

import { describe, test, expect } from "bun:test";
import { fetchOpenAlexWorks } from "./openAlexClient";
import { _resetHostBucketsForTests } from "./httpClient";

const FIXTURE = {
  meta: { next_cursor: "abc" },
  results: [
    {
      id: "https://openalex.org/W2741809807",
      doi: "https://doi.org/10.7717/peerj.4375",
      title: "The state of OA: a large-scale analysis",
      abstract_inverted_index: {
        We: [0, 6],
        analyze: [1],
        open: [2],
        access: [3],
        broadly: [4, 5],
        again: [7],
      },
      authorships: [
        {
          author: {
            id: "https://openalex.org/A2208157607",
            display_name: "Heather Piwowar",
            orcid: "https://orcid.org/0000-0003-1613-5981",
          },
        },
        {
          author: { display_name: "Anonymous" },
        },
      ],
      host_venue: { display_name: "PeerJ" },
      publication_date: "2018-02-13",
      open_access: { oa_url: "https://example.com/open.pdf" },
      concepts: [
        { display_name: "Open access", level: 2 },
        { display_name: "Library science", level: 1 },
        { display_name: "Computer science", level: 0 },
      ],
      cited_by_count: 1234,
    },
  ],
};

function mockFetch(
  body: object,
  status = 200,
): (input: string | URL | Request) => Promise<Response> {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

describe("openAlexClient (Sprint 69)", () => {
  test("normalizes a work response", async () => {
    _resetHostBucketsForTests();
    const { papers, nextCursor } = await fetchOpenAlexWorks(
      { filter: "from_publication_date:2018-01-01" },
      { fetchImpl: mockFetch(FIXTURE) },
    );
    expect(papers.length).toBe(1);
    expect(nextCursor).toBe("abc");
    const p = papers[0];
    expect(p.source).toBe("openalex");
    expect(p.sourceId).toBe("W2741809807");
    expect(p.doi).toBe("10.7717/peerj.4375");
    expect(p.title).toContain("OA");
    expect(p.abstract.length).toBeGreaterThan(0);
    expect(p.authors.length).toBe(2);
    expect(p.authors[0].orcid).toBe("0000-0003-1613-5981");
    expect(p.authors[0].openAlexAuthorId).toBe("A2208157607");
    expect(p.venue).toBe("PeerJ");
    expect(p.publishedAt).toBe("2018-02-13");
    expect(p.pdfUrl).toContain("open.pdf");
    expect(p.topics).toContain("Open access");
    expect(p.citationCount).toBe(1234);
  });

  test("reconstructs abstract from inverted index in word order", async () => {
    _resetHostBucketsForTests();
    const { papers } = await fetchOpenAlexWorks(
      {},
      { fetchImpl: mockFetch(FIXTURE) },
    );
    const expected = "We analyze open access broadly broadly We again";
    expect(papers[0].abstract).toBe(expected);
  });

  test("level-3+ concepts are filtered out (we keep up to level 2)", async () => {
    _resetHostBucketsForTests();
    const data = {
      meta: { next_cursor: null },
      results: [
        {
          id: "https://openalex.org/W1",
          title: "T",
          concepts: [
            { display_name: "Top", level: 0 },
            { display_name: "Mid", level: 2 },
            { display_name: "Niche", level: 4 },
          ],
        },
      ],
    };
    const { papers } = await fetchOpenAlexWorks(
      {},
      { fetchImpl: mockFetch(data) },
    );
    expect(papers[0].topics).toContain("Top");
    expect(papers[0].topics).toContain("Mid");
    expect(papers[0].topics).not.toContain("Niche");
  });

  test("handles missing optional fields gracefully", async () => {
    _resetHostBucketsForTests();
    const data = {
      results: [{ id: "https://openalex.org/W2", title: "Bare" }],
      meta: { next_cursor: null },
    };
    const { papers } = await fetchOpenAlexWorks(
      {},
      { fetchImpl: mockFetch(data) },
    );
    expect(papers[0].sourceId).toBe("W2");
    expect(papers[0].abstract).toBe("");
    expect(papers[0].authors).toEqual([]);
    expect(papers[0].topics).toEqual([]);
    expect(papers[0].citationCount).toBe(0);
  });
});

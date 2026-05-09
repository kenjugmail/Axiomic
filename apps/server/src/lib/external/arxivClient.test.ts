// Sprint 69 — arXiv ingestor parsing tests.
//
// Mocks fetch with a minimal Atom feed. Tests focus on the parser
// (every field round-trips) plus error pathways (non-2xx, malformed
// XML).

import { describe, test, expect } from "bun:test";
import { fetchArxivPapers } from "./arxivClient";
import { _resetHostBucketsForTests } from "./httpClient";

const FIXTURE_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2501.12345v1</id>
    <updated>2025-01-15T00:00:00Z</updated>
    <published>2025-01-15T00:00:00Z</published>
    <title>Attention Is All You Need (Again)</title>
    <summary>We revisit attention mechanisms.</summary>
    <author><name>Alice Smith</name></author>
    <author><name>Bob Jones</name></author>
    <link href="http://arxiv.org/pdf/2501.12345v1" type="application/pdf"/>
    <category term="cs.LG"/>
    <category term="cs.CL"/>
    <arxiv:doi>10.1234/example</arxiv:doi>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2501.99999v3</id>
    <published>2025-01-20T00:00:00Z</published>
    <title>Another Paper</title>
    <summary>Short.</summary>
    <author><name>Charlie</name></author>
    <category term="stat.ML"/>
  </entry>
</feed>`;

function mockFetch(
  body: string,
  status = 200,
): (input: string | URL | Request) => Promise<Response> {
  return async () =>
    new Response(body, {
      status,
      headers: { "Content-Type": "application/atom+xml" },
    });
}

describe("arxivClient (Sprint 69)", () => {
  test("parses a multi-entry Atom feed into NormalizedExternalPaper[]", async () => {
    _resetHostBucketsForTests();
    const papers = await fetchArxivPapers(
      { searchQuery: "cat:cs.LG" },
      { fetchImpl: mockFetch(FIXTURE_ATOM) },
    );
    expect(papers.length).toBe(2);

    const first = papers[0];
    expect(first.source).toBe("arxiv");
    expect(first.sourceId).toBe("2501.12345"); // version stripped
    expect(first.title).toContain("Attention");
    expect(first.abstract).toContain("attention");
    expect(first.authors.length).toBe(2);
    expect(first.authors[0].name).toBe("Alice Smith");
    expect(first.pdfUrl).toContain("pdf");
    expect(first.topics).toContain("cs.LG");
    expect(first.topics).toContain("cs.CL");
    expect(first.doi).toBe("10.1234/example");
    expect(first.publishedAt).toBe("2025-01-15T00:00:00Z");
  });

  test("strips version suffix from arxiv id", async () => {
    _resetHostBucketsForTests();
    const papers = await fetchArxivPapers(
      { searchQuery: "test" },
      { fetchImpl: mockFetch(FIXTURE_ATOM) },
    );
    expect(papers[1].sourceId).toBe("2501.99999"); // v3 stripped
  });

  test("entries without an id are skipped", async () => {
    _resetHostBucketsForTests();
    const broken = `<?xml version="1.0"?>
<feed>
  <entry><title>No id</title><summary>x</summary></entry>
  <entry><id>http://arxiv.org/abs/2501.5</id><title>OK</title><summary>x</summary></entry>
</feed>`;
    const papers = await fetchArxivPapers(
      { searchQuery: "test" },
      { fetchImpl: mockFetch(broken) },
    );
    expect(papers.length).toBe(1);
    expect(papers[0].sourceId).toBe("2501.5");
  });

  test("non-2xx response throws", async () => {
    _resetHostBucketsForTests();
    await expect(
      fetchArxivPapers(
        { searchQuery: "test" },
        {
          fetchImpl: mockFetch("server error", 400),
        },
      ),
    ).rejects.toThrow();
  });

  test("XML entity decoding works for &amp; in titles", async () => {
    _resetHostBucketsForTests();
    const xml = `<?xml version="1.0"?>
<feed>
  <entry>
    <id>http://arxiv.org/abs/2501.1</id>
    <title>Foo &amp; Bar</title>
    <summary>Hi.</summary>
    <author><name>X</name></author>
  </entry>
</feed>`;
    const papers = await fetchArxivPapers(
      { searchQuery: "test" },
      { fetchImpl: mockFetch(xml) },
    );
    expect(papers[0].title).toBe("Foo & Bar");
  });
});

// Sprint 71 — Grant ingestor parser tests with mocked fetch.

import { describe, test, expect } from "bun:test";
import { fetchNihGrants } from "./nihReporterClient";
import { fetchNsfGrants } from "./nsfAwardSearchClient";
import {
  fetchCdcGrants,
  fetchGrantsGovOpportunities,
} from "./grantsGovClient";
import { _resetHostBucketsForTests } from "./httpClient";

function jsonMock(
  body: object,
  status = 200,
): (input: string | URL | Request) => Promise<Response> {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

describe("nihReporterClient (Sprint 71)", () => {
  test("normalizes RePORTER project rows to NormalizedGrant[]", async () => {
    _resetHostBucketsForTests();
    const fixture = {
      results: [
        {
          appl_id: 99887766,
          project_num: "5R01CA123456-03",
          project_title: "Tumor microenvironment study",
          abstract_text: "We investigate the tumor microenvironment.",
          fiscal_year: 2025,
          project_start_date: "2025-01-01",
          project_end_date: "2026-12-31",
          award_amount: 350000,
          activity: "R01",
          pref_terms: "Tumor; Microenvironment; Cancer",
          organization: { org_name: "Harvard" },
        },
      ],
    };
    const grants = await fetchNihGrants(
      { criteria: { fiscal_years: [2025] } },
      { fetchImpl: jsonMock(fixture) },
    );
    expect(grants.length).toBe(1);
    const g = grants[0];
    expect(g.source).toBe("nih");
    expect(g.sourceId).toBe("5R01CA123456-03");
    expect(g.agency).toContain("NIH");
    expect(g.agency).toContain("Harvard");
    expect(g.title).toContain("Tumor");
    expect(g.mechanism).toBe("R01");
    expect(g.amountCeiling).toBe(350000);
    expect(g.deadlineAt).toBe("2026-12-31");
    expect(g.topics).toContain("Tumor");
    expect(g.topics).toContain("Microenvironment");
  });

  test("derives mechanism from project_num when activity field missing", async () => {
    _resetHostBucketsForTests();
    const fixture = {
      results: [
        {
          project_num: "1K99CA999999-01",
          project_title: "Postdoc K99 award",
          abstract_text: "x",
        },
      ],
    };
    const grants = await fetchNihGrants(
      {},
      { fetchImpl: jsonMock(fixture) },
    );
    expect(grants[0].mechanism).toBe("K99");
  });

  test("rows without title or sourceId are skipped", async () => {
    _resetHostBucketsForTests();
    const fixture = {
      results: [
        { project_num: "x", abstract_text: "x" },
        { project_title: "Has title", abstract_text: "x" },
      ],
    };
    const grants = await fetchNihGrants(
      {},
      { fetchImpl: jsonMock(fixture) },
    );
    expect(grants.length).toBe(0);
  });
});

describe("nsfAwardSearchClient (Sprint 71)", () => {
  test("normalizes NSF awards", async () => {
    _resetHostBucketsForTests();
    const fixture = {
      response: {
        award: [
          {
            id: "2400000",
            title: "Foundations of trustworthy AI",
            abstractText: "We study trust.",
            agency: "NSF",
            awardeeName: "MIT",
            fundsObligatedAmt: "1500000",
            startDate: "01/01/2025",
            expDate: "12/31/2027",
            fundProgramName: "AI Institute",
            cfdaNumber: "47.070",
            pdPIName: "Doe, J",
          },
        ],
      },
    };
    const grants = await fetchNsfGrants(
      {},
      { fetchImpl: jsonMock(fixture) },
    );
    expect(grants.length).toBe(1);
    const g = grants[0];
    expect(g.source).toBe("nsf");
    expect(g.sourceId).toBe("2400000");
    expect(g.title).toContain("trustworthy");
    expect(g.amountCeiling).toBe(1500000);
    expect(g.url).toContain("AWD_ID=2400000");
    expect(g.mechanism).toBe("AI Institute");
  });

  test("parses string amountCeiling with $ + commas", async () => {
    _resetHostBucketsForTests();
    const fixture = {
      response: {
        award: [
          {
            id: "1",
            title: "T",
            fundsObligatedAmt: "$1,234,500",
          },
        ],
      },
    };
    const grants = await fetchNsfGrants(
      {},
      { fetchImpl: jsonMock(fixture) },
    );
    expect(grants[0].amountCeiling).toBe(1234500);
  });
});

describe("grantsGovClient (Sprint 71)", () => {
  test("normalizes opportunity rows", async () => {
    _resetHostBucketsForTests();
    const fixture = {
      data: {
        oppHits: [
          {
            id: 350000,
            number: "PA-25-001",
            title: "Public health workforce funding",
            agencyName: "Centers for Disease Control",
            agencyCode: "CDC",
            openDate: "01/15/2025",
            closeDate: "06/15/2025",
            oppStatus: "posted",
            docType: "Grant",
            cfdaList: "93.116, 93.262",
          },
        ],
      },
    };
    const grants = await fetchGrantsGovOpportunities(
      { agencies: ["CDC"] },
      { fetchImpl: jsonMock(fixture) },
    );
    expect(grants.length).toBe(1);
    const g = grants[0];
    expect(g.source).toBe("grants_gov");
    expect(g.sourceId).toBe("PA-25-001");
    expect(g.agency).toContain("Disease Control");
    expect(g.postedAt).toBe("2025-01-15");
    expect(g.deadlineAt).toBe("2025-06-15");
    expect(g.topics).toContain("93.116");
    expect(g.url).toContain("/search-results-detail/350000");
  });

  test("CDC convenience wrapper preselects the CDC agency filter", async () => {
    _resetHostBucketsForTests();
    let capturedBody: string | null = null;
    const fetchImpl = async (
      _input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      capturedBody =
        typeof init?.body === "string" ? init.body : null;
      return new Response(JSON.stringify({ data: { oppHits: [] } }), {
        status: 200,
      });
    };
    await fetchCdcGrants({}, { fetchImpl });
    expect(capturedBody).not.toBeNull();
    const parsed = JSON.parse(capturedBody!);
    expect(parsed.agencies).toEqual(["CDC"]);
  });

  test("propagates server-side error code", async () => {
    _resetHostBucketsForTests();
    const fixture = { errorcode: 1, msg: "bad query" };
    await expect(
      fetchGrantsGovOpportunities(
        {},
        { fetchImpl: jsonMock(fixture) },
      ),
    ).rejects.toThrow("grants.gov error");
  });
});

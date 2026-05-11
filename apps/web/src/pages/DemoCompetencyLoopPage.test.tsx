import { describe, expect, test } from "vitest";
import { StaticRouter } from "react-router-dom/server";
import { renderToStaticMarkup } from "react-dom/server";
import { DemoCompetencyLoopPage } from "./DemoCompetencyLoopPage";

function renderPage(): { text: string; hrefs: string[] } {
  const html = renderToStaticMarkup(
    <StaticRouter location="/demo/competency-loop">
      <DemoCompetencyLoopPage />
    </StaticRouter>,
  );
  const host = document.createElement("div");
  host.innerHTML = html;
  const text = host.textContent ?? "";
  const hrefs = Array.from(host.querySelectorAll("a"))
    .map((a) => a.getAttribute("href"))
    .filter((href): href is string => Boolean(href));
  return { text, hrefs };
}

describe("DemoCompetencyLoopPage", () => {
  test("renders the diagnose/assess/remediate/build/verify story and CTA links", () => {
    const { text, hrefs } = renderPage();
    expect(text).toContain("Competency loop demo");
    expect(text).toContain("Diagnose");
    expect(text).toContain("Assess");
    expect(text).toContain("Remediate");
    expect(text).toContain("Build");
    expect(text).toContain("Verify");
    expect(hrefs).toContain("/exams");
    expect(hrefs).toContain("/tracks");
    // Verify CTA goes to the pre-populated demo artifact slug.
    expect(
      hrefs.some((h) => h.startsWith("/verify?artifact=demo-student-6-clip-style-retriever")),
    ).toBe(true);
    // Institution CTA.
    expect(hrefs).toContain("/classes/discover");
  });
});

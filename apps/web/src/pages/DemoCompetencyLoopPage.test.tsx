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
  test("renders checklist headings and proof-route links", () => {
    const { text, hrefs } = renderPage();
    expect(text).toContain("Competency loop demo");
    expect(text).toContain("Run a timed competency check");
    expect(text).toContain("Verify transcript signatures");
    expect(text).toContain("Build portfolio proof");
    expect(hrefs).toContain("/exams");
    expect(hrefs).toContain("/tracks");
    expect(hrefs).toContain("/verify");
  });
});

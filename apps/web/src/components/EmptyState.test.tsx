// S109 — EmptyState component tests.

import { describe, expect, test } from "vitest";
import { StaticRouter } from "react-router-dom/server";
import { renderToStaticMarkup } from "react-dom/server";
import { EmptyState } from "./EmptyState";

function render(node: React.ReactNode): string {
  return renderToStaticMarkup(<StaticRouter location="/">{node}</StaticRouter>);
}

describe("EmptyState", () => {
  test("renders the title", () => {
    const html = render(<EmptyState title="No papers yet" />);
    expect(html).toContain("No papers yet");
  });

  test("renders an optional description", () => {
    const html = render(
      <EmptyState title="No reports" description="Reports show up here." />,
    );
    expect(html).toContain("Reports show up here.");
  });

  test("renders a link CTA when `to` is provided", () => {
    const html = render(
      <EmptyState title="Empty" cta={{ to: "/research", label: "Browse research" }} />,
    );
    expect(html).toMatch(/href=["']\/research["']/);
    expect(html).toContain("Browse research");
  });

  test("renders a button CTA when `onClick` is provided", () => {
    const html = render(
      <EmptyState
        title="Empty"
        cta={{ onClick: () => undefined, label: "Try again" }}
      />,
    );
    // Button, not anchor.
    expect(html).toContain("<button");
    expect(html).not.toMatch(/<a [^>]*href="\/[^"]*"[^>]*>Try again<\/a>/);
    expect(html).toContain("Try again");
  });

  test("has role='status' so assistive tech announces it", () => {
    const html = render(<EmptyState title="No items" />);
    expect(html).toMatch(/role=["']status["']/);
  });
});

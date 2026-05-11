// S109 — Markdown XSS regression suite.
//
// The MarkdownRenderer accepts an `untrusted` flag that enables a
// rehype-sanitize pass over user-authored content (forum posts,
// comments, AI replies, …). These tests render hostile payloads
// through that path and assert the dangerous bits are stripped.
//
// Render strategy: renderToStaticMarkup + StaticRouter mirrors the
// existing DemoCompetencyLoopPage.test.tsx pattern. A static render
// doesn't fire lazy hooks for math/highlight, which is fine — we're
// asserting on the sanitizer, not on KaTeX.

import { describe, expect, test } from "vitest";
import { StaticRouter } from "react-router-dom/server";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownRenderer } from "./MarkdownRenderer";

function renderUntrusted(content: string): string {
  return renderToStaticMarkup(
    <StaticRouter location="/">
      <MarkdownRenderer content={content} untrusted allowViz={false} />
    </StaticRouter>,
  );
}

describe("MarkdownRenderer XSS protection (untrusted mode)", () => {
  test("strips raw <script> tags from HTML-in-markdown", () => {
    const html = renderUntrusted("hello <script>window.pwned=true</script> world");
    // The opening <script> tag must not survive into the DOM. The
    // sanitizer is allowed to leave the inner text as inert content —
    // it can't execute without the opening tag.
    expect(html).not.toContain("<script");
    expect(html).not.toContain("</script");
  });

  test("strips javascript: hrefs from markdown links", () => {
    const html = renderUntrusted("[click me](javascript:alert(1))");
    // The link text may survive but the dangerous href must not.
    expect(html.toLowerCase()).not.toContain("javascript:alert");
    expect(html).not.toMatch(/href=["']?javascript:/i);
  });

  test("strips on* event-handler attributes from inline HTML", () => {
    const html = renderUntrusted('<img src="x" onerror="alert(1)" />');
    expect(html.toLowerCase()).not.toContain("onerror");
    expect(html).not.toContain("alert(1)");
  });

  test("strips data:text/html hrefs", () => {
    const html = renderUntrusted("[boom](data:text/html,<script>alert(1)</script>)");
    expect(html).not.toMatch(/href=["']?data:text\/html/i);
    expect(html).not.toContain("<script");
  });

  test("strips <iframe> tags", () => {
    const html = renderUntrusted('<iframe src="https://evil.example"></iframe>');
    expect(html).not.toContain("<iframe");
  });

  test("strips inline <style> tags", () => {
    // <style> can be used for CSS-based exfil + click-jacking; not
    // a panic-grade vector, but we don't render arbitrary CSS.
    const html = renderUntrusted("<style>* { display: none }</style>visible");
    expect(html).not.toContain("<style");
  });

  test("preserves safe markdown features", () => {
    // Sanity check: the sanitizer doesn't murder ordinary markdown.
    const html = renderUntrusted("# Title\n\n**bold** and [link](https://example.com)");
    expect(html).toContain("<h1");
    expect(html).toContain("<strong");
    expect(html).toMatch(/href=["']?https:\/\/example\.com/);
  });
});

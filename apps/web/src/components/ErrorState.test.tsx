// S109 — ErrorState component tests.

import { describe, expect, test } from "vitest";
import { StaticRouter } from "react-router-dom/server";
import { renderToStaticMarkup } from "react-dom/server";
import { ErrorState } from "./ErrorState";

function render(node: React.ReactNode): string {
  return renderToStaticMarkup(<StaticRouter location="/">{node}</StaticRouter>);
}

describe("ErrorState", () => {
  test("status 401 renders the sign-in branch", () => {
    const html = render(<ErrorState error={null} status={401} />);
    expect(html).toContain("Sign in to continue");
    expect(html).toMatch(/href=["']\/login["']/);
  });

  test("status 403 renders the forbidden branch", () => {
    const html = render(<ErrorState error={null} status={403} />);
    // renderToStaticMarkup HTML-encodes the apostrophe; match either form.
    expect(html).toMatch(/don(?:'|&#x27;)t have access/);
  });

  test("generic error renders the message and retry button when onRetry is set", () => {
    const html = render(
      <ErrorState error="Boom" status={500} onRetry={() => undefined} />,
    );
    expect(html).toContain("Something went wrong");
    expect(html).toContain("Boom");
    expect(html).toContain("Try again");
  });

  test("retry button is omitted when no onRetry is provided", () => {
    const html = render(<ErrorState error="Boom" status={500} />);
    expect(html).not.toContain("Try again");
  });

  test("all branches carry role='alert' for assistive tech", () => {
    expect(render(<ErrorState error={null} status={401} />)).toMatch(
      /role=["']alert["']/,
    );
    expect(render(<ErrorState error={null} status={403} />)).toMatch(
      /role=["']alert["']/,
    );
    expect(render(<ErrorState error="x" status={500} />)).toMatch(
      /role=["']alert["']/,
    );
  });
});

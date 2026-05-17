// Phase 17B — Modal smoke test. We can't drive focus behavior under
// SSR (useEffect doesn't run), but we can at least confirm the
// dialog mounts with the expected a11y attributes and panel
// structure so a future change that drops them is caught.

import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Modal } from "./Modal";

function render(node: React.ReactNode): string {
  return renderToStaticMarkup(<>{node}</>);
}

describe("Modal (Phase 17B)", () => {
  test("renders nothing when closed", () => {
    const html = render(
      <Modal open={false} onClose={() => {}}>
        body
      </Modal>,
    );
    expect(html).toBe("");
  });

  test("renders a dialog role with aria-modal when open", () => {
    const html = render(
      <Modal open={true} onClose={() => {}} title="A title">
        body
      </Modal>,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("A title");
  });

  test("dialog panel is focusable (tabIndex=-1) so we can land focus on it", () => {
    const html = render(
      <Modal open={true} onClose={() => {}}>
        body
      </Modal>,
    );
    // The panel div carries tabIndex=-1 so the focus-trap effect can
    // focus it as a fallback when the body has no focusable children.
    expect(html).toMatch(/tabindex="-?1"/i);
  });
});

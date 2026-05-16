// Phase 37 — ConfirmContainer smoke. Logic (resolve/cancel/
// supersede) is covered by stores/confirm.test.ts; a11y (dialog
// role, focus trap) is covered by Modal.test.tsx since the
// container renders through Modal. Under renderToStaticMarkup the
// zustand binding only sees the server snapshot, so we assert the
// idle invariant: nothing renders when no request is pending.

import { describe, expect, test, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfirmContainer } from "./ConfirmContainer";
import { useConfirmStore } from "../../stores/confirm";

describe("ConfirmContainer (Phase 37)", () => {
  beforeEach(() => useConfirmStore.setState({ current: null }));

  test("renders nothing when no request is pending", () => {
    expect(renderToStaticMarkup(<ConfirmContainer />)).toBe("");
  });
});

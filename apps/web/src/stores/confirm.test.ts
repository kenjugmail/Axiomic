// Phase 37 — promise-based confirm store. Resolves true on
// accept, false on cancel; a second request supersedes (resolves
// the first false) so we never strand an awaiting caller.

import { describe, test, expect, beforeEach } from "vitest";
import { confirm, useConfirmStore } from "./confirm";

describe("confirm store (Phase 37)", () => {
  beforeEach(() => {
    useConfirmStore.setState({ current: null });
  });

  test("resolves true when accepted", async () => {
    const p = confirm({ title: "Delete?", destructive: true });
    const cur = useConfirmStore.getState().current;
    expect(cur).not.toBeNull();
    expect(cur!.title).toBe("Delete?");
    expect(cur!.destructive).toBe(true);
    useConfirmStore.getState().resolve(cur!.id, true);
    expect(await p).toBe(true);
    expect(useConfirmStore.getState().current).toBeNull();
  });

  test("resolves false when cancelled", async () => {
    const p = confirm({ title: "Sure?" });
    const id = useConfirmStore.getState().current!.id;
    useConfirmStore.getState().resolve(id, false);
    expect(await p).toBe(false);
    expect(useConfirmStore.getState().current).toBeNull();
  });

  test("a second request supersedes the first (first resolves false)", async () => {
    const p1 = confirm({ title: "First" });
    const p2 = confirm({ title: "Second" });
    expect(await p1).toBe(false); // auto-cancelled
    expect(useConfirmStore.getState().current!.title).toBe("Second");
    const id = useConfirmStore.getState().current!.id;
    useConfirmStore.getState().resolve(id, true);
    expect(await p2).toBe(true);
  });

  test("stale resolve id is ignored", async () => {
    const p = confirm({ title: "X" });
    useConfirmStore.getState().resolve("not-the-id", true);
    expect(useConfirmStore.getState().current).not.toBeNull();
    const id = useConfirmStore.getState().current!.id;
    useConfirmStore.getState().resolve(id, false);
    expect(await p).toBe(false);
  });
});

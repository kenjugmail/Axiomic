// Sprint 41 — JS kernel tests.
//
// Cover: stdout capture, async/await support, return value rendered
// as text display, error capture, kernel-key scoping for shared
// globals, shadowed platform globals.

import { describe, test, expect } from "vitest";
import { resetJsKernel, runJs } from "./jsKernel";

describe("Sprint 41 — JS kernel", () => {
  test("captures console.log into stdout", async () => {
    resetJsKernel("t1");
    const r = await runJs("t1", `console.log("hello"); console.log(1, 2);`);
    expect(r.stdout).toContain("hello");
    expect(r.stdout).toContain("1 2");
    expect(r.error).toBeUndefined();
  });

  test("supports top-level await", async () => {
    resetJsKernel("t2");
    const r = await runJs(
      "t2",
      `const v = await Promise.resolve(42); console.log(v);`,
    );
    expect(r.stdout.trim()).toBe("42");
  });

  test("surfaces an explicit return value as a text display", async () => {
    resetJsKernel("t3");
    const r = await runJs("t3", `return { answer: 42 };`);
    expect(r.displays.length).toBe(1);
    expect(r.displays[0].kind).toBe("text");
    expect(r.displays[0].data).toContain("42");
  });

  test("uncaught throws populate `error`", async () => {
    resetJsKernel("t4");
    const r = await runJs("t4", `throw new Error("nope");`);
    expect(r.error).toBeDefined();
    expect(r.error).toContain("nope");
  });

  test("globals on globalThis persist between cells in the same kernel key", async () => {
    resetJsKernel("t5");
    await runJs("t5", `globalThis.x = 7;`);
    const r = await runJs("t5", `console.log(globalThis.x);`);
    expect(r.stdout.trim()).toBe("7");
  });

  test("globals do NOT leak across kernel keys", async () => {
    resetJsKernel("t6a");
    resetJsKernel("t6b");
    await runJs("t6a", `globalThis.secret = 'a-only';`);
    const r = await runJs("t6b", `console.log(globalThis.secret ?? 'missing');`);
    expect(r.stdout.trim()).toBe("missing");
  });

  test("platform globals are shadowed inside the cell", async () => {
    resetJsKernel("t7");
    const r = await runJs(
      "t7",
      `console.log(typeof window, typeof fetch, typeof localStorage);`,
    );
    expect(r.stdout.trim()).toBe("undefined undefined undefined");
  });
});

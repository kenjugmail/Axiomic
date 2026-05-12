// Phase J — parseLimit helper unit tests.

import { describe, test, expect } from "bun:test";
import { parseLimit } from "./listLimit";

describe("parseLimit", () => {
  test("returns default when raw is undefined", () => {
    expect(parseLimit(undefined, 50, 200)).toBe(50);
  });

  test("returns parsed value when within bounds", () => {
    expect(parseLimit("25", 50, 200)).toBe(25);
  });

  test("clamps to max when raw exceeds it", () => {
    expect(parseLimit("99999", 50, 200)).toBe(200);
  });

  test("returns default for NaN", () => {
    expect(parseLimit("not-a-number", 50, 200)).toBe(50);
  });

  test("returns default for zero", () => {
    expect(parseLimit("0", 50, 200)).toBe(50);
  });

  test("returns default for negative", () => {
    expect(parseLimit("-5", 50, 200)).toBe(50);
  });

  test("returns default for empty string", () => {
    expect(parseLimit("", 50, 200)).toBe(50);
  });

  test("max equal to default still works", () => {
    expect(parseLimit("100", 50, 50)).toBe(50);
  });
});

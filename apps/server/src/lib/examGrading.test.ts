// Digital-SAT-parity grader tests.

import { describe, test, expect } from "bun:test";
import { gradeGridIn, gradeMultiSelect } from "./examGrading";

describe("gradeGridIn", () => {
  const accepted = ["0.75", "3/4"];

  test("exact decimal matches", () => {
    expect(gradeGridIn("0.75", accepted, 0).isCorrect).toBe(true);
  });
  test("exact fraction matches", () => {
    expect(gradeGridIn("3/4", accepted, 0).isCorrect).toBe(true);
  });
  test("decimal with leading dot matches via numeric path", () => {
    expect(gradeGridIn(".75", accepted, 0).isCorrect).toBe(true);
  });
  test("whitespace-padded fraction matches", () => {
    expect(gradeGridIn("  3/4  ", accepted, 0).isCorrect).toBe(true);
  });
  test("wrong decimal without tolerance rejects", () => {
    expect(gradeGridIn("0.7", accepted, 0).isCorrect).toBe(false);
  });
  test("near-miss within tolerance accepts", () => {
    expect(gradeGridIn("0.749", accepted, 0.01).isCorrect).toBe(true);
  });
  test("strips leading currency / sign and trailing period", () => {
    expect(gradeGridIn("$.75.", accepted, 0).isCorrect).toBe(true);
    expect(gradeGridIn("+0.75", accepted, 0).isCorrect).toBe(true);
  });
  test("strips trailing percent", () => {
    expect(gradeGridIn("75%", ["75"], 0).isCorrect).toBe(true);
  });
  test("empty learner answer rejects", () => {
    expect(gradeGridIn("", accepted, 0).isCorrect).toBe(false);
    expect(gradeGridIn("   ", accepted, 0).isCorrect).toBe(false);
  });
  test("null/missing accepted-answers rejects safely", () => {
    expect(gradeGridIn("3/4", null, 0).isCorrect).toBe(false);
    expect(gradeGridIn("3/4", [], 0).isCorrect).toBe(false);
  });
  test("non-numeric learner answer rejects", () => {
    expect(gradeGridIn("three quarters", accepted, 0).isCorrect).toBe(false);
  });
  test("division by zero in accepted is rejected, doesn't crash", () => {
    expect(gradeGridIn("0", ["1/0"], 0).isCorrect).toBe(false);
  });
});

describe("gradeMultiSelect", () => {
  test("exact set match accepts regardless of order", () => {
    expect(gradeMultiSelect([1, 3], [3, 1]).isCorrect).toBe(true);
  });
  test("missing one option rejects", () => {
    expect(gradeMultiSelect([1], [1, 3]).isCorrect).toBe(false);
  });
  test("extra option rejects", () => {
    expect(gradeMultiSelect([1, 2, 3], [1, 3]).isCorrect).toBe(false);
  });
  test("duplicate picks are deduped", () => {
    expect(gradeMultiSelect([1, 3, 3], [1, 3]).isCorrect).toBe(true);
  });
  test("empty selection rejects", () => {
    expect(gradeMultiSelect([], [1, 3]).isCorrect).toBe(false);
  });
  test("null inputs reject safely", () => {
    expect(gradeMultiSelect(null, [1, 3]).isCorrect).toBe(false);
    expect(gradeMultiSelect([1, 3], null).isCorrect).toBe(false);
  });
});

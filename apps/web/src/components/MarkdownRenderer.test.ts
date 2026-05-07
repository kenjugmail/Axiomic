import { describe, test, expect } from "vitest";
import { CONCEPT_LINK_RE } from "./MarkdownRenderer";

// Sprint 17 — `[[slug]]` and `[[slug|display]]` syntax. The regex sits
// at the heart of the renderer's text-injection traversal; a small
// table of cases pins down what is and isn't a valid concept link.

function matchAll(input: string): Array<{ slug: string; display?: string }> {
  CONCEPT_LINK_RE.lastIndex = 0;
  const out: Array<{ slug: string; display?: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = CONCEPT_LINK_RE.exec(input)) !== null) {
    out.push({ slug: m[1], display: m[2] });
  }
  return out;
}

describe("CONCEPT_LINK_RE", () => {
  test("plain slug match", () => {
    expect(matchAll("see [[attention]] for details")).toEqual([
      { slug: "attention", display: undefined },
    ]);
  });

  test("kebab-case slug with digits", () => {
    expect(matchAll("[[bpe-tokenization]] and [[gpt-2]] are both fine")).toEqual([
      { slug: "bpe-tokenization", display: undefined },
      { slug: "gpt-2", display: undefined },
    ]);
  });

  test("piped display text overrides slug", () => {
    expect(matchAll("we use [[softmax|the softmax function]] here")).toEqual([
      { slug: "softmax", display: "the softmax function" },
    ]);
  });

  test("uppercase or invalid characters are rejected", () => {
    expect(matchAll("[[Attention]] won't match")).toEqual([]);
    expect(matchAll("[[has space]] is invalid")).toEqual([]);
    expect(matchAll("[[has_underscore]] is invalid")).toEqual([]);
  });

  test("multiple matches in one string", () => {
    const r = matchAll(
      "compare [[attention]] vs [[self-attention|self-attention layer]]",
    );
    expect(r).toHaveLength(2);
    expect(r[0].slug).toBe("attention");
    expect(r[1].slug).toBe("self-attention");
    expect(r[1].display).toBe("self-attention layer");
  });

  test("ignores incomplete brackets", () => {
    expect(matchAll("[[unclosed")).toEqual([]);
    expect(matchAll("unopened]]")).toEqual([]);
  });
});

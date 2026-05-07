import { describe, test, expect } from "vitest";
import {
  CONCEPT_LINK_RE,
  findCodeDirective,
  findInlineDirective,
} from "./MarkdownRenderer";

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

describe("findCodeDirective (Sprint 22 — :::code[python] block)", () => {
  test("extracts the language + body of a basic block", () => {
    const src = `Some prose.\n\n:::code[python]\nimport numpy as np\nprint(np.linspace(0, 1, 5))\n:::\n\nMore prose.`;
    const m = findCodeDirective(src, 0);
    expect(m).not.toBeNull();
    expect(m!.lang).toBe("python");
    expect(m!.code).toBe("import numpy as np\nprint(np.linspace(0, 1, 5))");
  });

  test("returns null when the block is unclosed", () => {
    const src = `:::code[python]\nx = 1\n`;
    expect(findCodeDirective(src, 0)).toBeNull();
  });

  test("supports multiple sequential blocks via cursor advance", () => {
    const src = `:::code[python]\nx = 1\n:::\n\nbetween\n\n:::code[python]\ny = 2\n:::`;
    const a = findCodeDirective(src, 0);
    expect(a).not.toBeNull();
    expect(a!.code).toBe("x = 1");
    const b = findCodeDirective(src, a!.end);
    expect(b).not.toBeNull();
    expect(b!.code).toBe("y = 2");
  });

  test("only matches `:::code` (not arbitrary fenced code blocks)", () => {
    const src = `\`\`\`python\nx = 1\n\`\`\``;
    expect(findCodeDirective(src, 0)).toBeNull();
  });
});

describe("findInlineDirective (viz / video)", () => {
  test("matches :::viz[name]", () => {
    const m = findInlineDirective("Embed: :::viz[attention-heatmap] here", 0);
    expect(m).not.toBeNull();
    expect(m!.kind).toBe("viz");
    expect(m!.inner).toBe("attention-heatmap");
  });

  test("matches :::video[id=abc-123]", () => {
    const m = findInlineDirective(":::video[id=abc-123]", 0);
    expect(m).not.toBeNull();
    expect(m!.kind).toBe("video");
    expect(m!.inner).toBe("id=abc-123");
  });
});

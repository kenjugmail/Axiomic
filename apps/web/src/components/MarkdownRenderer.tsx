import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { Link } from "react-router-dom";
import { useRef } from "react";
import { VizEmbed } from "./VizEmbed";
import { ConceptLink } from "./cross/ConceptLink";
import { CodeCell, type CodeCellHandle } from "./code/CodeCell";
import { CodeCellsToolbar } from "./code/CodeCellsToolbar";
import "katex/dist/katex.min.css";

interface MarkdownRendererProps {
  content: string;
  className?: string;
  // When true, sanitize HTML (used for user-authored content like forum
  // posts, comments, AI replies). Wiki pages run as trusted by default.
  untrusted?: boolean;
  // When true, parse `:::viz[name]:::` directives and render the named
  // visualization inline. Defaults to true; comment threads pass false
  // so users can't surprise readers by embedding interactive widgets in
  // a high-volume, low-friction surface.
  allowViz?: boolean;
  // Sprint 22 — Jupyter-style runnable code cells via the
  // `:::code[python]\n...\n:::` directive. Defaults off; surfaces opt
  // in by passing a non-null `codeKernelKey` (typically
  // `paper:${slug}` or `lesson:${nodeId}` so cells in the same
  // document share Python state).
  codeKernelKey?: string | null;
  // Sprint 23 — author / viewer usernames for the code-cell trust
  // banner. When set + author !== viewer, a one-time notice appears
  // before the first run on the page.
  codeAuthorUsername?: string | null;
  codeViewerUsername?: string | null;
  // Sprint 24 — reading polish opt-ins.
  // numberFigures: prepend "Figure N" captions above viz + code blocks.
  // linkCitations: wrap `[1]` `[2]` etc. in body text with anchors to
  //   #ref-N (the consumer is responsible for adding id="ref-N" to the
  //   matching reference-list items).
  numberFigures?: boolean;
  linkCitations?: boolean;
}

const SAFE_PROTOCOLS = ["http:", "https:", "mailto:"];

// Match @username (3-32 word chars), preceded by a non-word boundary so we
// don't pick up `email@example.com`. Keeps the regex aligned with the
// server-side extractor in apps/server/src/lib/notifications.ts.
const MENTION_RE = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{3,32})(?=$|[^A-Za-z0-9_])/g;

// Sprint 17 — `[[concept-slug]]` and `[[concept-slug|display text]]`
// references. Slug rule mirrors the wiki-page constraint (lowercase
// kebab-case starting with a letter or digit). Optional pipe-delimited
// display text overrides what's shown in the link body. Exported so
// tests can verify the parser independently.
export const CONCEPT_LINK_RE =
  /\[\[([a-z0-9][a-z0-9-]{0,80})(?:\|([^\]\n]{1,80}))?\]\]/g;

// Sprint 24 — citation `[N]` markers in body text. Lookbehind avoids
// matching the `[N]` that's part of a `[N](url)` markdown link (those
// already render as anchors via react-markdown). We only wrap bare
// `[N]` tokens.
export const CITATION_RE = /(?<![[!])\[(\d{1,3})\](?!\()/g;

// Sprint 22 — block-form `:::code[lang]\n...\n:::` directive scanner.
// Returns the next match at or after `from`, or null. Exported for
// tests so the parser stays verified independently of the renderer.
export interface CodeDirectiveMatch {
  index: number;
  end: number;
  lang: string;
  code: string;
}
export function findCodeDirective(
  content: string,
  from: number,
): CodeDirectiveMatch | null {
  // Allow optional leading newline so `\n:::code[python]\n` is matched
  // either at start-of-string or after a newline.
  const open = /:::code\[([a-z][a-z0-9+-]*)\]\s*\n/g;
  open.lastIndex = from;
  const m = open.exec(content);
  if (!m) return null;
  const start = m.index;
  const bodyStart = m.index + m[0].length;
  // Find the closing `:::` on its own line.
  const close = content.indexOf("\n:::", bodyStart);
  if (close === -1) return null;
  const code = content.slice(bodyStart, close);
  return {
    index: start,
    end: close + "\n:::".length,
    lang: m[1],
    code,
  };
}

// Inline single-line `:::viz[name]` / `:::video[id=...]` directive.
export interface InlineDirectiveMatch {
  index: number;
  end: number;
  kind: "viz" | "video";
  inner: string;
}
export function findInlineDirective(
  content: string,
  from: number,
): InlineDirectiveMatch | null {
  const re = /:+(viz|video)\[([^\]]+)\]/g;
  re.lastIndex = from;
  const m = re.exec(content);
  if (!m) return null;
  return {
    index: m.index,
    end: m.index + m[0].length,
    kind: m[1] as "viz" | "video",
    inner: m[2],
  };
}

// Walk a text node and inject <Link> elements for any @mentions and
// inline ConceptLink popovers for any [[slug]] references. Both
// patterns run on the same prose text nodes so inline code, fenced
// blocks, and KaTeX subtrees pass through untouched.
function renderTextWithMentions(
  text: string,
  opts?: { linkCitations?: boolean },
): (string | JSX.Element)[] {
  if (!text) return [text];
  const hasMention = text.includes("@");
  const hasConcept = text.includes("[[");
  const hasCitation = !!opts?.linkCitations && /\[\d/.test(text);
  if (!hasMention && !hasConcept && !hasCitation) return [text];

  // Two-pass scan: collect every match (mention / concept / citation)
  // with its [start, end) range and replacement node, then weave them
  // back into the original string in order. Avoids double-wrapping
  // when a match would overlap.
  type Hit = {
    start: number;
    end: number;
    node: JSX.Element;
  };
  const hits: Hit[] = [];

  if (hasMention) {
    MENTION_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MENTION_RE.exec(text)) !== null) {
      const [full, lead, name] = m;
      const start = m.index + lead.length;
      const end = m.index + full.length;
      hits.push({
        start,
        end,
        node: (
          <Link
            key={`m-${start}`}
            to={`/profile/${name}`}
            className="text-primary hover:underline"
          >
            @{name}
          </Link>
        ),
      });
    }
  }

  if (hasConcept) {
    CONCEPT_LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CONCEPT_LINK_RE.exec(text)) !== null) {
      const [full, slug, display] = m;
      hits.push({
        start: m.index,
        end: m.index + full.length,
        node: (
          <ConceptLink
            key={`c-${m.index}`}
            slug={slug}
            display={display}
          />
        ),
      });
    }
  }

  if (hasCitation) {
    CITATION_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CITATION_RE.exec(text)) !== null) {
      const [full, n] = m;
      hits.push({
        start: m.index,
        end: m.index + full.length,
        node: (
          <a
            key={`cit-${m.index}`}
            href={`#ref-${n}`}
            className="text-primary hover:underline"
          >
            [{n}]
          </a>
        ),
      });
    }
  }

  if (hits.length === 0) return [text];
  hits.sort((a, b) => a.start - b.start);

  const parts: (string | JSX.Element)[] = [];
  let lastIdx = 0;
  for (const h of hits) {
    if (h.start < lastIdx) continue; // skip overlapping (shouldn't happen)
    if (h.start > lastIdx) parts.push(text.slice(lastIdx, h.start));
    parts.push(h.node);
    lastIdx = h.end;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}

function safeHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  // Internal route, anchor, or relative path — let through.
  if (href.startsWith("/") || href.startsWith("#") || href.startsWith("./") || href.startsWith("../")) {
    return href;
  }
  try {
    const url = new URL(href, "http://placeholder.invalid");
    if (SAFE_PROTOCOLS.includes(url.protocol)) return href;
  } catch {
    // unparseable URLs are dropped
  }
  return undefined;
}

// rehype-sanitize schema that preserves KaTeX's emitted classes/attributes
// while stripping the dangerous bits (script, iframe, event handlers, etc.).
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] || []), "className", "style"],
    span: [...(defaultSchema.attributes?.span || []), "className", "style", "aria-hidden"],
    div: [...(defaultSchema.attributes?.div || []), "className", "style"],
    code: [...(defaultSchema.attributes?.code || []), "className"],
    pre: [...(defaultSchema.attributes?.pre || []), "className"],
    math: [...(defaultSchema.attributes?.math || []), "xmlns"],
    annotation: [...(defaultSchema.attributes?.annotation || []), "encoding"],
    semantics: defaultSchema.attributes?.semantics || [],
    mrow: defaultSchema.attributes?.mrow || [],
    mi: defaultSchema.attributes?.mi || [],
    mn: defaultSchema.attributes?.mn || [],
    mo: defaultSchema.attributes?.mo || [],
    mfrac: defaultSchema.attributes?.mfrac || [],
    msup: defaultSchema.attributes?.msup || [],
    msub: defaultSchema.attributes?.msub || [],
    msubsup: defaultSchema.attributes?.msubsup || [],
    msqrt: defaultSchema.attributes?.msqrt || [],
    mroot: defaultSchema.attributes?.mroot || [],
    mtext: defaultSchema.attributes?.mtext || [],
    mspace: defaultSchema.attributes?.mspace || [],
    mtable: defaultSchema.attributes?.mtable || [],
    mtr: defaultSchema.attributes?.mtr || [],
    mtd: defaultSchema.attributes?.mtd || [],
  },
  tagNames: [
    ...(defaultSchema.tagNames || []),
    "math",
    "annotation",
    "semantics",
    "mrow",
    "mi",
    "mn",
    "mo",
    "mfrac",
    "msup",
    "msub",
    "msubsup",
    "msqrt",
    "mroot",
    "mtext",
    "mspace",
    "mtable",
    "mtr",
    "mtd",
  ],
};

export function MarkdownRenderer({
  content,
  className,
  untrusted,
  allowViz = true,
  codeKernelKey,
  codeAuthorUsername,
  codeViewerUsername,
  numberFigures = false,
  linkCitations = false,
}: MarkdownRendererProps) {
  // Sprint 23 — refs for every CodeCell rendered in this pass, so a
  // document-level Run-all toolbar can sequence them in document
  // order. Reset on every render and refilled as cells mount.
  const codeCellRefs = useRef<Array<CodeCellHandle | null>>([]);
  codeCellRefs.current = [];
  // Split content by viz + video + code directives and render them
  // inline. Code cells only render when the surface explicitly opts
  // in via `codeKernelKey` so a user can't run code from a comment
  // they didn't write.
  type Part =
    | { type: "markdown"; content: string }
    | { type: "viz"; content: string }
    | { type: "video"; id: string }
    | { type: "code"; lang: string; code: string };
  const parts: Part[] = [];

  // Walk the content scanning for the longest directive at each
  // position. We process code directives first because they're block-
  // form (multi-line) and may contain `:::` inside them; viz/video
  // are single-line so we'd match nested noise without this ordering.
  if (allowViz || codeKernelKey) {
    let cursor = 0;
    while (cursor < content.length) {
      // Look for the next directive starting at or after `cursor`.
      const codeMatch = codeKernelKey
        ? findCodeDirective(content, cursor)
        : null;
      const inlineMatch = allowViz
        ? findInlineDirective(content, cursor)
        : null;

      // Pick the earliest match (or stop if neither matched).
      let next: typeof codeMatch | typeof inlineMatch = null;
      if (codeMatch && inlineMatch) {
        next = codeMatch.index <= inlineMatch.index ? codeMatch : inlineMatch;
      } else {
        next = codeMatch ?? inlineMatch;
      }
      if (!next) break;

      if (next.index > cursor) {
        parts.push({
          type: "markdown",
          content: content.slice(cursor, next.index),
        });
      }
      if ("kind" in next && next.kind === "video") {
        const idMatch = next.inner.match(/id\s*=\s*([0-9a-f-]+)/i);
        if (idMatch) parts.push({ type: "video", id: idMatch[1] });
      } else if ("kind" in next && next.kind === "viz") {
        parts.push({ type: "viz", content: next.inner });
      } else if ("lang" in next) {
        parts.push({ type: "code", lang: next.lang, code: next.code });
      }
      cursor = next.end;
    }
    if (cursor < content.length) {
      parts.push({ type: "markdown", content: content.slice(cursor) });
    }
  }

  if (parts.length === 0) {
    parts.push({ type: "markdown", content });
  }

  // Sanitize must run AFTER rehype-katex (so katex output is in the tree
  // when sanitize evaluates it against the schema). Highlighting attaches
  // classNames to <code>/<span>, which the schema also permits.
  const rehypePlugins: any[] = [rehypeKatex, rehypeHighlight];
  if (untrusted) rehypePlugins.push([rehypeSanitize, sanitizeSchema]);

  const hasCodeCells = parts.some((p) => p.type === "code");

  return (
    <div className={`wiki-content ${className || ""}`}>
      {hasCodeCells && codeKernelKey && (
        <CodeCellsToolbar
          kernelKey={codeKernelKey}
          cellRefs={codeCellRefs}
          authorUsername={codeAuthorUsername ?? null}
          viewerUsername={codeViewerUsername ?? null}
        />
      )}
      {(() => {
        // Sprint 24 — sequential figure number across viz + code parts
        // when numberFigures is on. Computed once per render so the
        // mapping below stays stable.
        let figureN = 0;
        const figureNumbers = parts.map((p) =>
          numberFigures && (p.type === "viz" || p.type === "code")
            ? ++figureN
            : 0,
        );
        return parts.map((part, i) => {
          const figN = figureNumbers[i];
          const figLabel = (kind: string) =>
            numberFigures && figN > 0 ? (
              <figcaption className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1.5">
                {kind} {figN}
              </figcaption>
            ) : null;
          if (part.type === "viz") {
            return (
              <figure key={i}>
                <VizEmbed name={part.content} />
                {figLabel("Figure")}
              </figure>
            );
          }
          if (part.type === "video") {
            return (
              <video
                key={i}
                controls
                preload="metadata"
                className="my-4 max-w-full rounded-lg border border-border"
                src={`/api/v1/uploads/${part.id}`}
              />
            );
          }
          if (part.type === "code") {
            return (
              <figure key={i}>
                <CodeCell
                  ref={(h) => {
                    if (h) codeCellRefs.current.push(h);
                  }}
                  initialCode={part.code}
                  kernelKey={codeKernelKey || "scratch"}
                />
                {figLabel("Code")}
              </figure>
            );
          }
          return (
            <ReactMarkdown
            key={i}
            remarkPlugins={[remarkMath, remarkGfm]}
            rehypePlugins={rehypePlugins}
            components={{
              a: ({ href, children, ...props }) => {
                const safe = safeHref(href);
                if (!safe) {
                  return <span {...props}>{children}</span>;
                }
                if (safe.startsWith("/wiki/")) {
                  return (
                    <Link to={safe} className="text-primary underline underline-offset-2 hover:text-primary/80">
                      {children}
                    </Link>
                  );
                }
                return (
                  <a href={safe} target="_blank" rel="noopener noreferrer" {...props}>
                    {children}
                  </a>
                );
              },
              img: ({ src, alt, ...props }) => {
                const safe = safeHref(typeof src === "string" ? src : undefined);
                if (!safe) return null;
                return <img src={safe} alt={alt || ""} {...props} />;
              },
              h1: ({ children, ...props }) => {
                const id = String(children).toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
                return <h1 id={id} {...props}>{children}</h1>;
              },
              h2: ({ children, ...props }) => {
                const id = String(children).toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
                return <h2 id={id} {...props}>{children}</h2>;
              },
              h3: ({ children, ...props }) => {
                const id = String(children).toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
                return <h3 id={id} {...props}>{children}</h3>;
              },
              code: ({ className, children, ...props }) => {
                const isInline = !className;
                if (isInline) {
                  return (
                    <code className="font-mono text-sm bg-muted px-1.5 py-0.5 rounded" {...props}>
                      {children}
                    </code>
                  );
                }
                return <code className={className} {...props}>{children}</code>;
              },
              // Wrap @mentions in profile links. react-markdown only calls
              // this for prose text nodes — code spans, fenced blocks, and
              // KaTeX subtrees aren't routed through `text`, so we don't
              // mangle them.
              text: ({ children }) => {
                if (typeof children !== "string") return <>{children}</>;
                const rendered = renderTextWithMentions(children, {
                  linkCitations: linkCitations,
                });
                return <>{rendered}</>;
              },
            }}
          >
            {part.content}
          </ReactMarkdown>
          );
        });
      })()}
    </div>
  );
}

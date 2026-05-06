import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { Link } from "react-router-dom";
import { VizEmbed } from "./VizEmbed";
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
}

const SAFE_PROTOCOLS = ["http:", "https:", "mailto:"];

// Match @username (3-32 word chars), preceded by a non-word boundary so we
// don't pick up `email@example.com`. Keeps the regex aligned with the
// server-side extractor in apps/server/src/lib/notifications.ts.
const MENTION_RE = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{3,32})(?=$|[^A-Za-z0-9_])/g;

// Walk a text node and inject <Link> elements for any @mentions. This
// runs only on prose text nodes (react-markdown calls `text` for these),
// so inline code, fenced blocks, and KaTeX subtrees pass through
// untouched.
function renderTextWithMentions(text: string): (string | JSX.Element)[] {
  if (!text || !text.includes("@")) return [text];
  const parts: (string | JSX.Element)[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(text)) !== null) {
    const [full, lead, name] = m;
    const start = m.index + lead.length;
    if (start > lastIdx) parts.push(text.slice(lastIdx, start));
    parts.push(
      <Link
        key={`m-${start}`}
        to={`/profile/${name}`}
        className="text-primary hover:underline"
      >
        @{name}
      </Link>,
    );
    lastIdx = m.index + full.length;
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
}: MarkdownRendererProps) {
  // Split content by viz + video directives and render them inline.
  // The opt-in `allowViz` flag is independent of `untrusted` — forum
  // posts run with HTML sanitization on but with vizes allowed,
  // while comments disable vizes entirely.
  type Part =
    | { type: "markdown"; content: string }
    | { type: "viz"; content: string }
    | { type: "video"; id: string };
  const parts: Part[] = [];
  if (allowViz) {
    // Match either `:::viz[name]` (1+ colons, the historical form) or
    // `:::video[id=xxx]` for uploaded video attachments.
    const directivePattern = /:+(viz|video)\[([^\]]+)\]/g;
    let lastIndex = 0;
    let match;

    while ((match = directivePattern.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({
          type: "markdown",
          content: content.slice(lastIndex, match.index),
        });
      }
      const kind = match[1];
      const inner = match[2];
      if (kind === "video") {
        // Inner shape: id=<uuid>
        const idMatch = inner.match(/id\s*=\s*([0-9a-f-]+)/i);
        if (idMatch) parts.push({ type: "video", id: idMatch[1] });
      } else {
        parts.push({ type: "viz", content: inner });
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) {
      parts.push({ type: "markdown", content: content.slice(lastIndex) });
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

  return (
    <div className={`wiki-content ${className || ""}`}>
      {parts.map((part, i) =>
        part.type === "viz" ? (
          <VizEmbed key={i} name={part.content} />
        ) : part.type === "video" ? (
          <video
            key={i}
            controls
            preload="metadata"
            className="my-4 max-w-full rounded-lg border border-border"
            src={`/api/v1/uploads/${part.id}`}
          />
        ) : (
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
                const rendered = renderTextWithMentions(children);
                return <>{rendered}</>;
              },
            }}
          >
            {part.content}
          </ReactMarkdown>
        )
      )}
    </div>
  );
}

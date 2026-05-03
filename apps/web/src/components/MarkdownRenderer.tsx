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
  untrusted?: boolean;
}

const SAFE_PROTOCOLS = ["http:", "https:", "mailto:"];

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

export function MarkdownRenderer({ content, className, untrusted }: MarkdownRendererProps) {
  // Split content by viz directives and render them inline. Viz directives
  // are intentionally only honored for trusted content — otherwise a
  // commenter could embed any visualization into their post.
  const parts: { type: "markdown" | "viz"; content: string }[] = [];
  if (!untrusted) {
    const vizPattern = /::viz\[([^\]]+)\]/g;
    let lastIndex = 0;
    let match;

    while ((match = vizPattern.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: "markdown", content: content.slice(lastIndex, match.index) });
      }
      parts.push({ type: "viz", content: match[1] });
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
            }}
          >
            {part.content}
          </ReactMarkdown>
        )
      )}
    </div>
  );
}

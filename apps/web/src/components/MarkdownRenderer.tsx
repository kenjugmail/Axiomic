import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { Link } from "react-router-dom";
import { VizEmbed } from "./VizEmbed";
import "katex/dist/katex.min.css";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

function processVizDirectives(content: string): string {
  // Convert ::viz[name] to a special HTML comment that we can detect
  return content.replace(/::viz\[([^\]]+)\]/g, '\n<viz name="$1" />\n');
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  // Split content by viz directives and render them inline
  const parts: { type: "markdown" | "viz"; content: string }[] = [];
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

  if (parts.length === 0) {
    parts.push({ type: "markdown", content });
  }

  return (
    <div className={`wiki-content ${className || ""}`}>
      {parts.map((part, i) =>
        part.type === "viz" ? (
          <VizEmbed key={i} name={part.content} />
        ) : (
          <ReactMarkdown
            key={i}
            remarkPlugins={[remarkMath, remarkGfm]}
            rehypePlugins={[rehypeKatex, rehypeHighlight]}
            components={{
              a: ({ href, children, ...props }) => {
                if (href?.startsWith("/wiki/")) {
                  return (
                    <Link to={href} className="text-primary underline underline-offset-2 hover:text-primary/80">
                      {children}
                    </Link>
                  );
                }
                return (
                  <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                    {children}
                  </a>
                );
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

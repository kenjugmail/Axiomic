interface Heading {
  text: string;
  id: string;
  depth: 2 | 3;
}

// Cheap markdown-heading extractor. Walks the body line-by-line and
// pulls out h2 / h3 entries; computes the same id MarkdownRenderer
// stamps onto rendered headings (lowercase, kebab-case).
function extractHeadings(body: string): Heading[] {
  if (!body) return [];
  const out: Heading[] = [];
  const lines = body.split("\n");
  let inFence = false;
  for (const raw of lines) {
    if (raw.startsWith("```") || raw.startsWith("~~~")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = raw.match(/^(#{2,3})\s+(.+?)\s*$/);
    if (!m) continue;
    const depth = m[1].length === 2 ? 2 : 3;
    const text = m[2].trim();
    const id = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");
    out.push({ text, id, depth: depth as 2 | 3 });
  }
  return out;
}

interface Props {
  body: string;
}

export function ArticleTOC({ body }: Props) {
  const headings = extractHeadings(body);
  if (headings.length < 2) return null;

  return (
    <aside className="hidden xl:block sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
        On this page
      </div>
      <ul className="space-y-1 text-sm">
        {headings.map((h, i) => (
          <li
            key={`${h.id}-${i}`}
            className={h.depth === 3 ? "pl-4" : ""}
          >
            <a
              href={`#${h.id}`}
              className="text-muted-foreground hover:text-foreground line-clamp-2"
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}

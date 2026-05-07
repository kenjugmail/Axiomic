import { Link } from "react-router-dom";
import type { SearchResultItem } from "@axiomic/types";

interface Props {
  result: SearchResultItem;
  // When provided, hovering the row reports the index back so a parent
  // controlling keyboard navigation can sync its selection.
  index?: number;
  selected?: boolean;
  onHover?: (index: number) => void;
  onSelect?: (r: SearchResultItem) => void;
}

export function hrefFor(r: SearchResultItem): string {
  if (r.kind === "page") return `/wiki/${r.slug}`;
  if (r.kind === "lesson") return `/paths/${r.pathSlug}/lessons/${r.nodeSlug}`;
  if (r.kind === "news") return `/news/${r.slug}`;
  if (r.kind === "research") return `/research/${r.slug}`;
  return `/forum/t/${r.slug}`;
}

// Shared row used by SearchDialog (modal) and SearchPage (full page).
export function SearchResultRow({
  result: r,
  index,
  selected,
  onHover,
  onSelect,
}: Props) {
  const trailing =
    r.kind === "page"
      ? r.category
      : r.kind === "lesson"
        ? "lesson"
        : r.kind === "news"
          ? "news"
          : r.kind === "research"
            ? `research · ${r.format}`
            : `forum · ${r.postType}`;
  const semanticChip = r.matchedBy === "semantic";
  const bothChip = r.matchedBy === "both";
  const inner = (
    <>
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{r.title}</span>
          {semanticChip && (
            <span className="text-[9px] uppercase tracking-wider px-1 py-px rounded bg-primary/10 text-primary shrink-0">
              related
            </span>
          )}
          {bothChip && (
            <span className="text-[9px] uppercase tracking-wider px-1 py-px rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
              match
            </span>
          )}
        </div>
        {r.snippet && (
          <span className="text-xs text-muted-foreground truncate mt-0.5">
            {r.snippet}
          </span>
        )}
      </div>
      <span className="text-xs text-muted-foreground capitalize shrink-0">
        {trailing}
      </span>
    </>
  );

  const className = `w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between gap-3 ${
    selected
      ? "bg-accent text-accent-foreground"
      : "text-foreground hover:bg-accent/50"
  }`;

  if (onSelect) {
    return (
      <button
        onClick={() => onSelect(r)}
        onMouseEnter={() => index !== undefined && onHover?.(index)}
        className={className}
      >
        {inner}
      </button>
    );
  }
  return (
    <Link
      to={hrefFor(r)}
      onMouseEnter={() => index !== undefined && onHover?.(index)}
      className={className}
    >
      {inner}
    </Link>
  );
}

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, type SearchResultItem } from "../lib/api";

interface SearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchDialog({ isOpen, onClose }: SearchDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.search.query(query, 12);
        setResults(data.results);
        setSelectedIndex(0);
      } catch {
        // ignore
      }
      setLoading(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const hrefFor = (r: SearchResultItem): string =>
    r.kind === "page" ? `/wiki/${r.slug}` : `/forum/t/${r.slug}`;

  const handleSelect = useCallback(
    (r: SearchResultItem) => {
      navigate(hrefFor(r));
      onClose();
    },
    [navigate, onClose],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  // Group: keyword / both first, pure semantic ("Related") below.
  const direct = results.filter((r) => r.matchedBy !== "semantic");
  const related = results.filter((r) => r.matchedBy === "semantic");

  // Flat ordered list to drive keyboard navigation.
  const ordered = [...direct, ...related];

  const renderRow = (r: SearchResultItem, flatIdx: number) => {
    const trailing =
      r.kind === "page"
        ? r.category
        : r.kind === "lesson"
          ? "lesson"
          : `forum · ${r.postType}`;
    const semanticChip = r.matchedBy === "semantic";
    const bothChip = r.matchedBy === "both";
    return (
      <button
        key={r.id}
        onClick={() => handleSelect(r)}
        onMouseEnter={() => setSelectedIndex(flatIdx)}
        className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between gap-3 ${
          flatIdx === selectedIndex
            ? "bg-accent text-accent-foreground"
            : "text-foreground hover:bg-accent/50"
        }`}
      >
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
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-border">
          <svg className="w-4 h-4 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search wiki, forum, or paraphrase a question..."
            className="flex-1 py-3 bg-transparent text-foreground outline-none text-sm"
          />
          <kbd className="hidden sm:block text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">ESC</kbd>
        </div>

        {ordered.length > 0 && (
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {direct.length > 0 && (
              <>
                {direct.map((r, i) => renderRow(r, i))}
              </>
            )}
            {related.length > 0 && (
              <>
                <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Related
                </div>
                {related.map((r, i) => renderRow(r, direct.length + i))}
              </>
            )}
          </div>
        )}

        {query && !loading && ordered.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No matches for "{query}"
          </div>
        )}

        {!query && (
          <div className="p-4 text-xs text-muted-foreground">
            <p>Type to search wiki pages and forum topics.</p>
            <p className="mt-1">
              Use <kbd className="bg-muted px-1 rounded">↑↓</kbd> to navigate, <kbd className="bg-muted px-1 rounded">Enter</kbd> to select.
            </p>
            <p className="mt-1">Try a paraphrase — semantic results appear under "Related".</p>
          </div>
        )}

        {query && (
          <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground flex justify-end">
            <button
              onClick={() => {
                navigate(`/search?q=${encodeURIComponent(query)}`);
                onClose();
              }}
              className="hover:text-foreground"
            >
              See all results in /search →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

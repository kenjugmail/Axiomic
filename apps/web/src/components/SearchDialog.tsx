import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, type WikiPage, type ForumTopicSummary } from "../lib/api";

interface SearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type SearchResult =
  | { kind: "page"; page: WikiPage }
  | { kind: "topic"; topic: ForumTopicSummary };

export function SearchDialog({ isOpen, onClose }: SearchDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
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
        const [pagesData, topicsData] = await Promise.all([
          api.wiki.search(query),
          api.forum.listTopics({}).catch(() => ({ topics: [] })),
        ]);
        const q = query.toLowerCase();
        const matchedTopics = topicsData.topics
          .filter((t) => t.title.toLowerCase().includes(q))
          .slice(0, 5);
        const next: SearchResult[] = [
          ...pagesData.results.map((page) => ({ kind: "page" as const, page })),
          ...matchedTopics.map((topic) => ({ kind: "topic" as const, topic })),
        ];
        setResults(next);
        setSelectedIndex(0);
      } catch {}
      setLoading(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      if (result.kind === "page") {
        navigate(`/wiki/${result.page.slug}`);
      } else {
        navigate(`/forum/t/${result.topic.slug}`);
      }
      onClose();
    },
    [navigate, onClose]
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
            placeholder="Search wiki pages and forum topics..."
            className="flex-1 py-3 bg-transparent text-foreground outline-none text-sm"
          />
          <kbd className="hidden sm:block text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">ESC</kbd>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="max-h-80 overflow-y-auto p-2">
            {results.map((result, i) => {
              const isPage = result.kind === "page";
              const title = isPage ? result.page.title : result.topic.title;
              const trailing = isPage
                ? result.page.category
                : `forum · ${result.topic.postType}`;
              const key = isPage ? result.page.id : result.topic.id;
              return (
                <button
                  key={key}
                  onClick={() => handleSelect(result)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between gap-3 ${
                    i === selectedIndex
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground hover:bg-accent/50"
                  }`}
                >
                  <span className="font-medium truncate">{title}</span>
                  <span className="text-xs text-muted-foreground capitalize shrink-0">
                    {trailing}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {query && !loading && results.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No matches for "{query}"
          </div>
        )}

        {!query && (
          <div className="p-4 text-xs text-muted-foreground">
            <p>Type to search wiki pages and forum topics.</p>
            <p className="mt-1">Use <kbd className="bg-muted px-1 rounded">↑↓</kbd> to navigate, <kbd className="bg-muted px-1 rounded">Enter</kbd> to select.</p>
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import type { SearchResultItem } from "@axiomic/types";
import { SearchResultRow } from "../components/SearchResultRow";

type Filter = "all" | "pages" | "topics";

// Full-page search. Mirrors SearchDialog's logic but writes the query
// to the URL so the result is shareable, and exposes filters that the
// modal doesn't have room for.
export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initial);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [semanticOnly, setSemanticOnly] = useState(false);

  // Keep ?q= in sync with the input. Debounced so we don't push a
  // history entry per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      const sp = new URLSearchParams(searchParams);
      if (query) sp.set("q", query);
      else sp.delete("q");
      setSearchParams(sp, { replace: true });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Run the search. Separate timer so empty queries clear immediately.
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await api.search.query(query, 30);
        setResults(data.results);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  const filtered = results.filter((r) => {
    if (filter === "pages" && r.kind !== "page") return false;
    if (filter === "topics" && r.kind !== "topic") return false;
    if (semanticOnly && r.matchedBy === "keyword") return false;
    return true;
  });

  const pages = filtered.filter((r) => r.kind === "page");
  const topics = filtered.filter((r) => r.kind === "topic");

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Search</h1>

      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search wiki pages, forum topics, or paraphrase a question..."
        className="w-full px-4 py-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />

      <div className="flex flex-wrap items-center gap-3 mt-4">
        <div className="flex gap-1 p-1 rounded-md bg-muted">
          {(["all", "pages", "topics"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs font-medium capitalize rounded transition-colors ${
                filter === f
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={semanticOnly}
            onChange={(e) => setSemanticOnly(e.target.checked)}
            className="accent-primary"
          />
          Semantic only
        </label>
        {!loading && query && (
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} result{filtered.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="mt-6 space-y-6">
        {!query && (
          <p className="text-sm text-muted-foreground">
            Type to search wiki pages and forum topics. Paraphrasing works —
            semantic matches are tagged with the "related" chip.
          </p>
        )}
        {query && !loading && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">No matches for "{query}".</p>
        )}
        {filter !== "topics" && pages.length > 0 && (
          <section>
            <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Pages
            </h2>
            <div className="space-y-1">
              {pages.map((r) => (
                <SearchResultRow key={r.id} result={r} />
              ))}
            </div>
          </section>
        )}
        {filter !== "pages" && topics.length > 0 && (
          <section>
            <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Topics
            </h2>
            <div className="space-y-1">
              {topics.map((r) => (
                <SearchResultRow key={r.id} result={r} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

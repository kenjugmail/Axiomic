import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Search, X } from "lucide-react";
import { api } from "../lib/api";
import type { ConceptSearchResponse } from "@axiomic/types";

// Cross-path concept search. Type a term — "transformer", "Bayesian",
// "cooperative binding" — and see every mastery node that touches it
// across the 95+ paths. Hits are grouped by path so users can pivot
// from a concept they're looking up to a path that covers it deeply.

const MATCH_BADGE: Record<string, { label: string; color: string }> = {
  "node-title": { label: "node title", color: "#4ecdc4" },
  "lesson-title": { label: "lesson", color: "#fbbf24" },
  "node-description": { label: "description", color: "#a78bfa" },
  "lesson-body": { label: "lesson body", color: "#60a5fa" },
  "path-title": { label: "path", color: "#9aa3b8" },
};

export function ConceptSearchPage() {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<ConceptSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      api.concepts
        .search(trimmed)
        .then((r) => setData(r))
        .catch(() => setData(null))
        .finally(() => setLoading(false));
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const totalGroups = data?.groups.length ?? 0;
  const totalHits = data?.totalHits ?? 0;

  const examples = useMemo(
    () => ["transformer", "Bayesian", "memory", "evolution", "selection", "Bourdieu", "Helmholtz", "Wright-Fisher"],
    [],
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Concept search</h1>
      <p className="text-muted-foreground mb-6">
        Find every mastery node that touches a concept — across all 95+ paths.
        Useful when a topic appears in multiple disciplines (e.g. "Bayesian"
        in AI Researcher, Cognitive Scientist, Applied Statistician, Epidemiologist).
      </p>

      <div className="mb-3 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search 95+ paths × ~760 nodes…"
          className="w-full pl-9 pr-9 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          aria-label="Search concepts"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-accent"
            aria-label="Clear search"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {query.length === 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Try:</span>
          {examples.map((ex) => (
            <button
              key={ex}
              onClick={() => setQuery(ex)}
              className="px-2 py-0.5 rounded-full bg-muted hover:bg-accent border border-border"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {loading && query.length >= 2 && (
        <div className="text-sm text-muted-foreground">Searching…</div>
      )}

      {!loading && data && totalGroups === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>No paths cover "{data.query}" yet.</p>
        </div>
      )}

      {!loading && data && totalGroups > 0 && (
        <>
          <div className="mb-4 text-sm text-muted-foreground">
            {totalHits} hit{totalHits === 1 ? "" : "s"} across {totalGroups} path{totalGroups === 1 ? "" : "s"}
          </div>
          <div className="space-y-5">
            {data.groups.map((g) => (
              <section key={g.pathSlug} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-baseline justify-between mb-3">
                  <Link
                    to={`/paths/${g.pathSlug}`}
                    className="text-base font-semibold hover:text-primary"
                  >
                    {g.pathTitle}
                  </Link>
                  <span className="text-xs text-muted-foreground">{g.hits.length} hit{g.hits.length === 1 ? "" : "s"}</span>
                </div>
                <ul className="space-y-2">
                  {g.hits.map((h) => {
                    const badge = MATCH_BADGE[h.matchedIn] ?? { label: h.matchedIn, color: "#9aa3b8" };
                    return (
                      <li key={h.nodeSlug}>
                        <Link
                          to={`/paths/${g.pathSlug}/lessons/${h.nodeSlug}`}
                          className="block p-3 rounded border border-border/50 hover:bg-accent/30 hover:border-primary/40 transition-colors"
                        >
                          <div className="flex items-baseline gap-2 mb-1">
                            <span className="text-sm font-medium">{h.nodeTitle}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${badge.color}22`, color: badge.color }}>{badge.label}</span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">{h.snippet}</p>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { VIZ_CATALOG } from "../components/lesson/VizPicker";
import { PreviewViz } from "../components/lesson/PreviewViz";

// Public gallery surfacing every interactive visualization that ships
// with the lesson player. Used as a discovery surface so learners can
// browse the catalog without first opening a specific lesson, and as
// a sanity check that all registered viz components actually mount.
// Each card renders the live component lazily — clicking expands it
// full-width.

export function VizGalleryPage() {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of VIZ_CATALOG) {
      for (const tag of entry.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 18);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return VIZ_CATALOG.filter((entry) => {
      if (activeTag !== null && !entry.tags.includes(activeTag)) return false;
      if (q.length === 0) return true;
      return (
        entry.label.toLowerCase().includes(q) ||
        entry.description.toLowerCase().includes(q) ||
        entry.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [query, activeTag]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Visualization Gallery</h1>
      <p className="text-muted-foreground mb-6">
        Every interactive visualization in the lesson player — {VIZ_CATALOG.length} live components from softmax temperature and attention heatmaps to Friedmann a(t) and the Hodgkin-Huxley action potential. Click a card to expand the live demo.
      </p>

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, description, or tag…"
          className="w-full pl-9 pr-9 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          aria-label="Search visualizations"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-accent"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      <div className="mb-6 flex flex-wrap gap-1.5">
        <button
          onClick={() => setActiveTag(null)}
          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${activeTag === null ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-accent"}`}
        >
          All tags
        </button>
        {allTags.map(([tag, count]) => (
          <button
            key={tag}
            onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${activeTag === tag ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-accent"}`}
          >
            {tag} <span className="opacity-60">· {count}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No visualizations match your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((entry) => {
            const isExpanded = expanded === entry.name;
            return (
              <div
                key={entry.name}
                className={`rounded-lg border border-border bg-card hover:border-primary/40 transition-colors ${isExpanded ? "md:col-span-2 lg:col-span-3" : ""}`}
              >
                <button
                  onClick={() => setExpanded(isExpanded ? null : entry.name)}
                  className="w-full text-left p-4 cursor-pointer"
                  aria-expanded={isExpanded}
                >
                  <div className="flex items-start gap-3 mb-2">
                    <span className="text-2xl leading-none" aria-hidden>
                      {entry.thumb}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-sm font-semibold mb-1">{entry.label}</h2>
                      <p className="text-xs text-muted-foreground line-clamp-2">{entry.description}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {entry.tags.slice(0, 4).map((t) => (
                      <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {t}
                      </span>
                    ))}
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border/50">
                    <div className="pt-3">
                      <PreviewViz name={entry.name} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, X } from "lucide-react";
import { api, type MasteryPath } from "../lib/api";

// Tag a path based on title + description keywords. With 60+ paths
// the bare list is unworkable; this lets users find paths by topic
// area without a backend round-trip. Tags are derived locally from
// title/description so they update naturally as new paths land.
type Domain = "AI/ML" | "Science" | "Engineering" | "Health" | "Society" | "Math" | "Other";

const DOMAIN_RULES: Array<{ domain: Domain; needles: RegExp }> = [
  { domain: "AI/ML", needles: /\b(ml|ai|transformer|llm|neural|deep learning|reinforcement|nlp|vision|rlhf|fine-tun|gpt|claude|alignment)/i },
  { domain: "Math", needles: /\b(algebra|topolog|calculus|number theory|category|combinator|galois|hilbert|gödel|godel|mathematician|probability|measure)/i },
  { domain: "Science", needles: /\b(physics|cosmolog|chemist|biolog|geolog|astronom|quantum|relativity|particle|atomic|molecular|evolution|ecolog|genomic|climate|materials)/i },
  { domain: "Engineering", needles: /\b(engineer|robotic|control|systems|networking|distributed|database|compiler|cryptograph|signal|process|hardware|chip)/i },
  { domain: "Health", needles: /\b(medicine|medic|physician|nurs|pharma|clinical|surge|psychiatry|epidemiolog|public health|neuroscien|cardio)/i },
  { domain: "Society", needles: /\b(econom|sociolog|anthropolog|histor|polit|law|linguist|philosoph|psycholog|business|finance|education)/i },
];

function inferDomain(p: MasteryPath): Domain {
  const haystack = `${p.title} ${p.description}`;
  for (const rule of DOMAIN_RULES) {
    if (rule.needles.test(haystack)) return rule.domain;
  }
  return "Other";
}

const DOMAIN_ORDER: Domain[] = ["AI/ML", "Math", "Science", "Engineering", "Health", "Society", "Other"];

export function MasteryListPage() {
  const [paths, setPaths] = useState<MasteryPath[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState<Domain | "All">("All");

  useEffect(() => {
    api.mastery
      .getPaths()
      .then((data) => setPaths(data.paths))
      .finally(() => setLoading(false));
  }, []);

  const tagged = useMemo(
    () => paths.map((p) => ({ ...p, _domain: inferDomain(p) })),
    [paths],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tagged.filter((p) => {
      if (domain !== "All" && p._domain !== domain) return false;
      if (q.length === 0) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q)
      );
    });
  }, [tagged, query, domain]);

  const domainCounts = useMemo(() => {
    const counts: Record<string, number> = { All: tagged.length };
    for (const d of DOMAIN_ORDER) counts[d] = 0;
    for (const p of tagged) counts[p._domain] = (counts[p._domain] ?? 0) + 1;
    return counts;
  }, [tagged]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Mastery Paths</h1>
      <p className="text-muted-foreground mb-6">
        Structured learning journeys from fundamentals to research-level expertise — {tagged.length} paths across {DOMAIN_ORDER.filter((d) => (domainCounts[d] ?? 0) > 0).length} domains.
      </p>

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search paths by title, slug, or description…"
          className="w-full pl-9 pr-9 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          aria-label="Search mastery paths"
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
        {(["All", ...DOMAIN_ORDER] as const).map((d) => {
          const count = domainCounts[d] ?? 0;
          if (d !== "All" && count === 0) return null;
          return (
            <button
              key={d}
              onClick={() => setDomain(d)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                domain === d
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-accent"
              }`}
            >
              {d} <span className="opacity-60">· {count}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse h-24 bg-muted rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="mb-2">No paths match your filters.</p>
          <button
            onClick={() => {
              setQuery("");
              setDomain("All");
            }}
            className="text-xs underline hover:text-foreground"
          >
            Reset
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((path) => (
            <Link
              key={path.id}
              to={`/paths/${path.slug}`}
              className="block p-5 rounded-lg border border-border hover:bg-accent/50 transition-colors group"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-lg font-semibold group-hover:text-primary transition-colors">{path.title}</h2>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                      {path._domain}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-sm line-clamp-3">{path.description}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Sparkles } from "lucide-react";
import { api, type MasteryPath } from "../lib/api";
import { VIZ_CATALOG } from "../components/lesson/VizPicker";

// Discovery surface for the 70+ mastery paths. Groups paths into
// topic rails inferred from title/description keywords (same
// heuristic as MasteryListPage), plus a "recently added" rail
// (last 9 paths by API order) and a featured-visualization carousel.
// One front door, not a flat list.

type Domain = "AI/ML" | "Science" | "Engineering" | "Health" | "Society" | "Math" | "Humanities" | "Other";

const DOMAIN_RULES: Array<{ domain: Domain; needles: RegExp }> = [
  { domain: "AI/ML", needles: /\b(ml|ai\b|transformer|llm|neural|deep learning|reinforcement|nlp|vision|rlhf|fine-tun|gpt|claude|alignment|machine learning)/i },
  { domain: "Math", needles: /\b(algebra|topolog|calculus|number theory|category|combinator|galois|hilbert|gödel|godel|mathematician|measure|optimi|probabili)/i },
  { domain: "Humanities", needles: /\b(philosoph|histor|musicolog|anthropolog|legal|lawyer|sociolog|psycholog|linguist|educator)/i },
  { domain: "Science", needles: /\b(physic|cosmolog|chemist|biolog|geolog|astronom|quantum|relativity|particle|atomic|molecular|evolution|ecolog|genomic|climate|materials|paleont|oceanograph|microbiolog|immunolog|virolog|neuroscien|pharmacolog)/i },
  { domain: "Engineering", needles: /\b(engineer|robotic|control|systems|networking|distributed|database|compiler|cryptograph|signal|process|hardware|chip|urban planner|architec)/i },
  { domain: "Health", needles: /\b(medicine|medic|physician|nurs|pharma|clinical|surge|psychiatry|epidemiolog|public health|cardio|biomedical)/i },
  { domain: "Society", needles: /\b(econom|polit|game theor|operations research|quant trader|financial)/i },
];

function inferDomain(p: MasteryPath): Domain {
  const haystack = `${p.title} ${p.description}`;
  for (const rule of DOMAIN_RULES) {
    if (rule.needles.test(haystack)) return rule.domain;
  }
  return "Other";
}

const DOMAIN_ICON: Record<Domain, string> = {
  "AI/ML": "🤖",
  Math: "🧮",
  Science: "🔬",
  Engineering: "⚙️",
  Health: "🩺",
  Society: "🏛️",
  Humanities: "📜",
  Other: "✨",
};

const DOMAIN_BLURB: Record<Domain, string> = {
  "AI/ML": "Transformers, alignment, vision, RL, and the practitioner stack.",
  Math: "From foundations to the modern frontier — algebra, analysis, probability, category theory.",
  Science: "Physical, biological, and earth sciences — laboratory to cosmology.",
  Engineering: "How things get built — robotics, distributed systems, hardware, urban infrastructure.",
  Health: "Medicine, immunology, pharmacology, epidemiology, biomedical engineering.",
  Society: "Economics, political science, game theory, financial markets.",
  Humanities: "Philosophy, history, music, law, sociology, psychology, education.",
  Other: "Other paths that don't fit a single domain neatly.",
};

const DOMAIN_ORDER: Domain[] = ["AI/ML", "Science", "Engineering", "Math", "Humanities", "Health", "Society"];

// Hand-picked subset for the viz rail — well-known + visually striking.
const FEATURED_VIZ_NAMES = [
  "attention-heatmap",
  "friedmann-equation",
  "schelling-segregation",
  "forward-kinematics-arm",
  "voting-systems",
  "harmonic-series",
  "allele-frequency-drift",
  "clonal-selection",
];

export function DiscoverPage() {
  const [paths, setPaths] = useState<MasteryPath[]>([]);
  const [loading, setLoading] = useState(true);
  const [completion, setCompletion] = useState<Map<string, { completed: number; total: number; fraction: number }>>(new Map());
  const [query, setQuery] = useState("");

  useEffect(() => {
    api.mastery
      .getPaths()
      .then((data) => setPaths(data.paths))
      .finally(() => setLoading(false));
    api.mastery
      .getPathsCompletion()
      .then((r) => {
        const m = new Map<string, { completed: number; total: number; fraction: number }>();
        for (const c of r.completion) m.set(c.pathSlug, c);
        setCompletion(m);
      })
      .catch(() => undefined);
  }, []);

  function completionChip(slug: string) {
    const c = completion.get(slug);
    if (!c || c.total === 0 || c.completed === 0) return null;
    const pct = Math.round(c.fraction * 100);
    return (
      <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${pct === 100 ? "bg-green-500/20 text-green-700 dark:text-green-300" : "bg-primary/15 text-primary"}`}>
        {pct === 100 ? "✓" : `${c.completed}/${c.total}`}
      </span>
    );
  }

  const tagged = useMemo(
    () => paths.map((p) => ({ ...p, _domain: inferDomain(p) })),
    [paths],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return tagged;
    return tagged.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q),
    );
  }, [tagged, query]);

  const byDomain = useMemo(() => {
    const m = new Map<Domain, MasteryPath[]>();
    for (const p of filtered) {
      const list = m.get(p._domain) ?? [];
      list.push(p);
      m.set(p._domain, list);
    }
    return m;
  }, [filtered]);

  // "Recently added" — last 12 paths by API order (which mirrors seed order, P-numbered)
  const recent = useMemo(() => filtered.slice(-12).reverse(), [filtered]);

  const featuredViz = useMemo(
    () =>
      VIZ_CATALOG.filter((v) => FEATURED_VIZ_NAMES.includes(v.name)).sort(
        (a, b) => FEATURED_VIZ_NAMES.indexOf(a.name) - FEATURED_VIZ_NAMES.indexOf(b.name),
      ),
    [],
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2 font-display">Discover Axiomic</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          {tagged.length} mastery paths across {DOMAIN_ORDER.filter((d) => (byDomain.get(d)?.length ?? 0) > 0).length} domains, anchored by {VIZ_CATALOG.length} interactive visualizations. Pick a topic, browse what's new, or play with the viz catalog.
        </p>
      </div>

      <div className="mb-3 relative max-w-2xl mx-auto">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search 70+ paths — try 'transformer', 'evolution', 'philosophy'…"
          className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          aria-label="Search paths"
        />
      </div>
      <div className="mb-8 text-center text-xs text-muted-foreground">
        Looking for a specific concept across paths?{" "}
        <Link to="/concepts/search" className="text-primary hover:underline">
          Try concept search →
        </Link>
      </div>

      {loading ? (
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse h-32 bg-muted rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          {/* Journeys rail — curated multi-path sequences */}
          {query.length === 0 && (
            <section className="mb-8">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-lg font-semibold">Learning journeys</h2>
                <Link to="/journeys" className="text-xs text-muted-foreground hover:text-foreground">browse all →</Link>
              </div>
              <p className="text-xs text-muted-foreground mb-2">Curated multi-path sequences for common research + builder directions.</p>
              <Link
                to="/journeys"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded border border-border bg-card hover:bg-accent/40 hover:border-primary/40"
              >
                <span>Explore 12 curated journeys →</span>
              </Link>
            </section>
          )}

          {/* Recently added rail */}
          {query.length === 0 && (
            <section className="mb-10">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Recently added
                </h2>
                <Link to="/paths" className="text-xs text-muted-foreground hover:text-foreground">view all →</Link>
              </div>
              <div className="overflow-x-auto -mx-4 px-4 pb-2">
                <div className="flex gap-3 min-w-min">
                  {recent.map((p) => (
                    <Link
                      key={p.id}
                      to={`/paths/${p.slug}`}
                      className="flex-shrink-0 w-64 p-4 rounded-lg border border-border bg-card hover:bg-accent/50 hover:border-primary/40 transition-colors"
                    >
                      <div className="text-2xl mb-1.5" aria-hidden>{DOMAIN_ICON[(p as { _domain: Domain })._domain]}</div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <h3 className="text-sm font-semibold line-clamp-1 flex-1">{p.title}</h3>
                        {completionChip(p.slug)}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-3">{p.description}</p>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Per-domain sections */}
          {DOMAIN_ORDER.map((d) => {
            const list = byDomain.get(d) ?? [];
            if (list.length === 0) return null;
            const visible = list.slice(0, 6);
            return (
              <section key={d} className="mb-10">
                <div className="flex items-baseline justify-between mb-1">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <span className="text-xl">{DOMAIN_ICON[d]}</span>
                    {d}
                    <span className="text-xs text-muted-foreground font-normal">· {list.length} path{list.length === 1 ? "" : "s"}</span>
                  </h2>
                  {list.length > visible.length && (
                    <Link to="/paths" className="text-xs text-muted-foreground hover:text-foreground">view all {list.length} →</Link>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-3">{DOMAIN_BLURB[d]}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {visible.map((p) => (
                    <Link
                      key={p.id}
                      to={`/paths/${p.slug}`}
                      className="block p-4 rounded-lg border border-border bg-card hover:bg-accent/50 hover:border-primary/40 transition-colors group"
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <h3 className="text-sm font-semibold group-hover:text-primary line-clamp-1 flex-1">{p.title}</h3>
                        {completionChip(p.slug)}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-3">{p.description}</p>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}

          {/* Featured viz rail */}
          {query.length === 0 && (
            <section className="mb-8">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-lg font-semibold">Featured visualizations</h2>
                <Link to="/viz-gallery" className="text-xs text-muted-foreground hover:text-foreground">browse all {VIZ_CATALOG.length} →</Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {featuredViz.map((v) => (
                  <Link
                    key={v.name}
                    to="/viz-gallery"
                    className="block p-4 rounded-lg border border-border bg-card hover:bg-accent/50 hover:border-primary/40 transition-colors text-center"
                  >
                    <div className="text-3xl mb-1.5" aria-hidden>{v.thumb}</div>
                    <h3 className="text-xs font-semibold line-clamp-1">{v.label}</h3>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

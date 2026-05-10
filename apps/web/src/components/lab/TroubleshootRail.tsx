import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, AlertTriangle } from "lucide-react";

interface Hit {
  kind: "protocol-step" | "equipment" | "misconception";
  slug: string;
  title: string;
  snippet: string;
  href: string;
  score: number;
}

interface Props {
  // Optional initial query — used by the protocol detail page when
  // the user followed a "having trouble?" link from a step.
  initialQuery?: string;
  // When true, the rail collapses by default and expands on input.
  // Used in the dashboard sidebar where vertical space is tight.
  compact?: boolean;
}

const KIND_LABEL: Record<Hit["kind"], string> = {
  "protocol-step": "Step",
  equipment: "Equipment",
  misconception: "Common mistake",
};

const KIND_TONE: Record<Hit["kind"], string> = {
  "protocol-step":
    "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
  equipment:
    "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30",
  misconception:
    "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
};

export function TroubleshootRail({ initialQuery, compact }: Props) {
  const [q, setQ] = useState(initialQuery ?? "");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setHits(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(() => {
      fetch(
        `/api/v1/lab/troubleshoot?q=${encodeURIComponent(trimmed)}&limit=8`,
        { credentials: "include" },
      )
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((body: { results: Hit[] }) => {
          if (cancelled) return;
          setHits(body.results);
          setError(null);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err?.message ?? "Search failed");
          setHits([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [q]);

  return (
    <section
      className={`rounded-lg border border-border bg-card ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
        <AlertTriangle
          className="w-3.5 h-3.5 text-amber-500"
          strokeWidth={2}
        />
        Troubleshoot
      </h3>
      <div className="relative">
        <Search
          className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          strokeWidth={2}
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="my gel didn't run…"
          className="w-full pl-8 pr-2.5 py-1.5 rounded-md border border-input bg-background text-sm"
        />
      </div>
      {error && (
        <div className="mt-2 text-xs text-destructive">{error}</div>
      )}
      {hits !== null && (
        <ul className="mt-3 space-y-2">
          {loading && hits.length === 0 ? (
            <li className="text-xs text-muted-foreground italic">
              Searching…
            </li>
          ) : hits.length === 0 ? (
            <li className="text-xs text-muted-foreground italic">
              No matches yet.
            </li>
          ) : (
            hits.map((h) => (
              <li key={`${h.kind}:${h.slug}:${h.href}`}>
                <Link
                  to={h.href}
                  className="block rounded-md border border-border bg-background hover:bg-accent/40 transition-colors duration-fast p-2"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span
                      className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${KIND_TONE[h.kind]}`}
                    >
                      {KIND_LABEL[h.kind]}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {(h.score * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="text-sm font-medium text-foreground truncate">
                    {h.title}
                  </div>
                  <div className="text-xs text-muted-foreground line-clamp-2">
                    {h.snippet}
                  </div>
                </Link>
              </li>
            ))
          )}
        </ul>
      )}
    </section>
  );
}

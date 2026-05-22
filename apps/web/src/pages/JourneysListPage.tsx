import { Link } from "react-router-dom";
import { JOURNEYS } from "../lib/journeys";

// Index of curated multi-path learning journeys. Each card links to
// /journeys/:slug which renders the constituent paths with progress.

export function JourneysListPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Learning journeys</h1>
      <p className="text-muted-foreground mb-8 max-w-2xl">
        Hand-curated path sequences for common research + builder
        directions. Pick a journey to see the chained paths with your
        progress on each. Designed for learners who want a "where to
        next?" map rather than the firehose of all 99+ paths.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {JOURNEYS.map((j) => (
          <Link
            key={j.slug}
            to={`/journeys/${j.slug}`}
            className="block p-5 rounded-lg border border-border bg-card hover:bg-accent/40 hover:border-primary/40 transition-colors"
          >
            <div className="flex items-start gap-3 mb-2">
              <span className="text-3xl leading-none" aria-hidden>{j.icon}</span>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold mb-0.5">{j.title}</h2>
                <p className="text-sm text-muted-foreground">{j.tagline}</p>
              </div>
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              {j.paths.length} paths · {j.paths.slice(0, 3).join(" → ")}{j.paths.length > 3 ? " → …" : ""}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type MasteryPath } from "../lib/api";

export function MasteryListPage() {
  const [paths, setPaths] = useState<MasteryPath[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.mastery
      .getPaths()
      .then((data) => setPaths(data.paths))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Mastery Paths</h1>
      <p className="text-muted-foreground mb-8">
        Structured learning journeys from fundamentals to research-level expertise.
      </p>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="animate-pulse h-28 bg-muted rounded-lg" />
          ))}
        </div>
      ) : paths.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">No mastery paths available yet.</p>
      ) : (
        <div className="space-y-4">
          {paths.map((path) => (
            <Link
              key={path.id}
              to={`/paths/${path.slug}`}
              className="block p-6 rounded-lg border border-border hover:bg-accent/50 transition-colors"
            >
              <h2 className="text-xl font-semibold mb-1">{path.title}</h2>
              <p className="text-muted-foreground text-sm">{path.description}</p>
              <div className="flex gap-2 mt-3">
                {["Apprentice", "Practitioner", "Specialist", "Expert", "Researcher"].map((level) => (
                  <span key={level} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {level}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

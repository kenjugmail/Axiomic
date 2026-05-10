// S102 — Public class directory.
//
// Lists every active + discoverable class. No auth required so a
// logged-out visitor can browse before signing up. Each card links
// into /classes/:slug — the class page itself gates enrollment via
// the join-code flow + the share-link from S99.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users, ChevronRight } from "lucide-react";
import type { DiscoverClassesResponse } from "@axiomic/types";
import { api } from "../lib/api";
import { Skeleton } from "../components/ui";

export function ClassesDirectoryPage() {
  const [data, setData] = useState<DiscoverClassesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.classes
      .discover()
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e) => { if (!cancelled) setError(e?.message ?? "Failed"); });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-3">
        <Skeleton variant="card" className="h-24" />
        <Skeleton variant="card" className="h-24" />
        <Skeleton variant="card" className="h-24" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="text-xs text-muted-foreground mb-3">
        <Link to="/classes" className="hover:text-foreground">My classes</Link>
        {" / discover"}
      </div>
      <h1 className="font-display text-2xl font-semibold tracking-tight mb-1">
        Discover classes
      </h1>
      <p className="text-xs text-muted-foreground mb-6">
        Public classes anyone can browse. Click in to see the join code and welcome message.
      </p>

      {data.classes.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No public classes right now. Ask your professor to mark theirs discoverable, or join with a code.
        </p>
      ) : (
        <ul className="space-y-3">
          {data.classes.map((c) => (
            <li key={c.slug}>
              <Link
                to={`/classes/${c.slug}`}
                className="block p-4 rounded-md border border-border hover:shadow-soft transition-shadow"
              >
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold truncate">{c.title}</h2>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                      {c.term && <span>{c.term}</span>}
                      {c.term && <span>·</span>}
                      <span>
                        @{c.instructorUsername}
                      </span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {c.memberCount} member{c.memberCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>
                {c.description && (
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {c.description}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

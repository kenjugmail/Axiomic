import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FilePlus } from "lucide-react";
import type { ResearchPaperDraftSummary } from "@axiomic/types";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { EmptyState } from "../components/ui/EmptyState";

export function ResearchDraftsPage() {
  const { user, loading } = useAuthStore();
  const [drafts, setDrafts] = useState<ResearchPaperDraftSummary[] | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    api.research
      .drafts()
      .then((r) => setDrafts(r.papers))
      .catch(() => setDrafts([]));
  }, [user, loading]);

  if (loading) return null;
  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground mb-4">Sign in to see your drafts.</p>
        <Link to="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link to="/research" className="text-sm text-muted-foreground hover:text-foreground">
        &larr; Research
      </Link>
      <h1 className="font-display text-2xl font-semibold tracking-tight mt-1">
        My drafts
      </h1>

      {drafts === null ? (
        <div className="mt-6 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse bg-muted rounded-md" />
          ))}
        </div>
      ) : drafts.length === 0 ? (
        <EmptyState
          icon={FilePlus}
          title="No drafts yet"
          description="Drafts you save without publishing live here. The wizard scaffolds title, abstract, and section drafts in one go."
          cta={
            <Link
              to="/research/new/wizard"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-foreground text-background text-sm font-medium hover:bg-foreground/90"
            >
              Start a paper
            </Link>
          }
        />
      ) : (
        <ul className="mt-6 divide-y divide-border border border-border rounded-md">
          {drafts.map((d) => (
            <li key={d.id}>
              <Link
                to={`/research/${d.slug}/edit`}
                className="block px-4 py-3 hover:bg-accent/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{d.coverEmoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {d.title || (
                        <span className="text-muted-foreground italic">
                          Untitled
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {d.format} · last edited{" "}
                      {new Date(d.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Sprint 29 — /me/weak-concepts.
//
// Surfaces typed misconception diagnoses produced by
// `runDetectorForUser`. Each row links into the AI sidebar in
// misconception-mode (S30) and offers Dismiss / Coach me CTAs.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, X, RotateCw, Brain } from "lucide-react";
import type { MisconceptionDiagnosis } from "@axiomic/types";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";

export function WeakConceptsPage() {
  const { user } = useAuthStore();
  const [diagnoses, setDiagnoses] = useState<MisconceptionDiagnosis[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.me.weakConcepts().then((r) => setDiagnoses(r.diagnoses));
  }, [user]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await api.me.refreshWeakConcepts();
      const r = await api.me.weakConcepts();
      setDiagnoses(r.diagnoses);
    } finally {
      setRefreshing(false);
    }
  };

  const dismiss = async (id: string) => {
    await api.me.dismissWeakConcept(id);
    setDiagnoses((d) => (d ? d.filter((x) => x.id !== id) : d));
  };

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">Sign in to see your weak concepts.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
            <Brain className="w-7 h-7 text-primary" />
            Weak concepts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Misconceptions inferred from your recent quiz mistakes. Coach the gap, then move on.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 inline-flex items-center gap-1.5 disabled:opacity-60"
        >
          <RotateCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {diagnoses === null ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="card" className="h-24" />
          ))}
        </div>
      ) : diagnoses.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          <Sparkles className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
          No active misconceptions detected. Keep practicing — the detector runs after each quiz.
        </div>
      ) : (
        <ul className="space-y-3">
          {diagnoses.map((d) => (
            <li
              key={d.id}
              className="rounded-lg border border-border p-4 bg-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    {d.conceptTitle ? (
                      <Link to={`/wiki/${d.conceptSlug}`} className="hover:text-foreground">
                        {d.conceptTitle}
                      </Link>
                    ) : (
                      d.conceptSlug
                    )}{" "}
                    · confidence {(d.confidence * 100).toFixed(0)}%
                  </div>
                  <h2 className="text-sm font-semibold leading-snug">{d.label}</h2>
                  {d.description && (
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed line-clamp-3">
                      {d.description.slice(0, 280)}
                      {d.description.length > 280 ? "…" : ""}
                    </p>
                  )}
                  {d.evidence.length > 0 && (
                    <div className="text-[10px] text-muted-foreground mt-2 italic">
                      Evidence: {d.evidence.map((e) => e.snippet).join(" · ")}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Link
                    to={`/wiki/${d.conceptSlug}?aiMode=misconception&diagnosisId=${d.id}`}
                    className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Coach me
                  </Link>
                  <button
                    type="button"
                    onClick={() => dismiss(d.id)}
                    className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 inline-flex items-center gap-1.5"
                  >
                    <X className="w-3.5 h-3.5" />
                    Dismiss
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

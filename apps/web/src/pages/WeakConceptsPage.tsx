// Sprint 29 — /me/weak-concepts.
//
// Surfaces typed misconception diagnoses produced by
// `runDetectorForUser`. Each row links into the AI sidebar in
// misconception-mode (S30) and offers Dismiss / Coach me CTAs.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  Brain,
  Layers,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import type { MisconceptionDiagnosis } from "@axiomic/types";
import { api } from "../lib/api";
import { EmptyState } from "../components/ui/EmptyState";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";

export function WeakConceptsPage() {
  const { user } = useAuthStore();
  const [diagnoses, setDiagnoses] = useState<MisconceptionDiagnosis[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api.me
      .weakConcepts()
      .then((r) => {
        if (!cancelled) setDiagnoses(r.diagnoses);
      })
      .catch(() => {
        // Clear loading state on failure (e.g., timeout, 401) — without
        // this the skeleton renders forever.
        if (!cancelled) setDiagnoses([]);
      });
    return () => {
      cancelled = true;
    };
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
        <EmptyState
          icon={ShieldCheck}
          title="No active misconceptions detected"
          description="The detector runs after each quiz. Keep practicing — diagnoses appear here when patterns emerge."
        />
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
                  <NextStepPills d={d} />
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

      <div className="mt-10 pt-6 border-t border-border text-sm text-muted-foreground">
        Don't see a misconception that matches what tripped you up?{" "}
        <Link
          to="/misconceptions"
          className="text-primary hover:underline"
        >
          Propose one →
        </Link>{" "}
        Once five learners agree, the AI tutor and detector start using it.
      </div>
    </div>
  );
}

// Phase 16B — concrete remediation pills. Only renders a pill when
// the underlying content exists, so the user never lands on a 404
// or an empty SRS deck.
function NextStepPills({ d }: { d: MisconceptionDiagnosis }) {
  const ns = d.nextSteps;
  if (!ns) return null;
  const pills: Array<{ to: string; label: string; icon: typeof BookOpen }> = [];
  if (ns.wikiSlug) {
    pills.push({
      to: `/wiki/${ns.wikiSlug}`,
      label: "Re-read wiki",
      icon: BookOpen,
    });
  }
  if (ns.quizPath) {
    pills.push({
      to: `/paths/${ns.quizPath.pathSlug}/${ns.quizPath.nodeSlug}?retake=1`,
      label: "Retake quiz",
      icon: Target,
    });
  }
  if (ns.hasFlashcards) {
    pills.push({
      to: `/flashcards?page=${d.conceptSlug}`,
      label: "Drill flashcards",
      icon: Layers,
    });
  }
  if (pills.length === 0) return null;
  return (
    <div
      data-testid="next-step-pills"
      className="mt-2.5 flex flex-wrap gap-1.5"
    >
      {pills.map((p) => {
        const Icon = p.icon;
        return (
          <Link
            key={p.label}
            to={p.to}
            className="text-[11px] px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:bg-accent/40 hover:text-foreground inline-flex items-center gap-1"
          >
            <Icon className="w-3 h-3" />
            {p.label}
          </Link>
        );
      })}
    </div>
  );
}

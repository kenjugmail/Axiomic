// Sprint 73 — Exams list.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, GraduationCap } from "lucide-react";
import type { ExamSummary } from "@axiomic/types";
import { api } from "../lib/api";
import { Skeleton } from "../components/ui";

export function ExamsListPage() {
  const [items, setItems] = useState<ExamSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.exams
      .list()
      .then((r) => setItems(r.items))
      .catch((e: unknown) => {
        setItems([]);
        setError(e instanceof Error ? e.message : "Failed to load exams");
      });
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Exam prep
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Timed mock exams with section-aware navigation, score reports,
          and adaptive practice.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
          {error}
        </div>
      )}

      {!items ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No exams configured yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((e) => (
            <Link
              key={e.slug}
              to={`/exams/${e.slug}`}
              className="rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <GraduationCap className="w-4 h-4 text-primary" />
                <span className="font-display text-base font-semibold">
                  {e.title}
                </span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-3">
                {e.description}
              </p>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-3 inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {e.totalDurationMinutes} min total
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

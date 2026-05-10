// Sprint 73 — Exam detail page. Lists sections + scoring overview +
// "Start full mock", "Start section", "Adaptive practice" CTAs.

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Clock, GraduationCap, Play, Sparkles, ListChecks } from "lucide-react";
import type { ExamDetail, ExamHistoryEntry } from "@axiomic/types";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleDateString();
}

export function ExamPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [history, setHistory] = useState<ExamHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setError(null);
    api.exams
      .get(slug)
      .then((r) => setExam(r.exam))
      .catch((e: unknown) => {
        setExam(null);
        setError(e instanceof Error ? e.message : "Failed to load exam");
      });
    if (user) {
      api.exams
        .history(slug)
        .then((r) => setHistory(r.items))
        .catch(() => setHistory([]));
    }
  }, [slug, user]);

  const start = async (
    mode: "full_mock" | "section" | "adaptive",
    sectionSlug?: string,
  ) => {
    if (!slug || !user) {
      navigate("/login");
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const r = await api.exams.startAttempt(slug, { mode, sectionSlug });
      navigate(`/exams/${slug}/run/${r.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to start attempt");
    } finally {
      setStarting(false);
    }
  };

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
          {error}
        </div>
        <Link to="/exams" className="text-sm text-primary hover:underline mt-4 inline-block">
          ← All exams
        </Link>
      </div>
    );
  }
  if (!exam) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Skeleton className="h-8 w-1/2 mb-3" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const completedAttempts = (history ?? []).filter((h) => h.completedAt);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link to="/exams" className="text-sm text-primary hover:underline">
        ← All exams
      </Link>
      <div className="mt-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight inline-flex items-center gap-2">
          <GraduationCap className="w-6 h-6 text-primary" />
          {exam.title}
        </h1>
        <p className="text-sm text-muted-foreground mt-1 inline-flex items-center gap-1.5">
          <Clock className="w-4 h-4" />
          {exam.totalDurationMinutes} min total
          {" · "}
          {exam.sections.length} section{exam.sections.length === 1 ? "" : "s"}
        </p>
        {exam.description && (
          <p className="text-sm mt-3 max-w-prose">{exam.description}</p>
        )}
      </div>

      <section className="mt-6">
        <h2 className="font-display text-lg font-semibold mb-3">Sections</h2>
        <div className="space-y-2">
          {exam.sections.map((s) => (
            <div
              key={s.slug}
              className="rounded-lg border border-border bg-card p-3 flex items-center justify-between gap-3"
            >
              <div>
                <div className="font-display font-semibold text-sm">
                  {s.title}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                  {s.questionCount} questions · {s.durationMinutes} min
                </div>
              </div>
              {user && (
                <button
                  type="button"
                  onClick={() => start("section", s.slug)}
                  disabled={starting}
                  className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <Play className="w-3 h-3" />
                  Section only
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 flex items-center gap-2 flex-wrap">
        {user ? (
          <>
            <button
              type="button"
              onClick={() => start("full_mock")}
              disabled={starting}
              className="text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5 font-medium"
            >
              <Play className="w-4 h-4" />
              Start full mock
            </button>
            <button
              type="button"
              onClick={() => start("adaptive")}
              disabled={starting}
              className="text-sm px-4 py-2 rounded-md border border-border hover:bg-accent/40 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Sparkles className="w-4 h-4" />
              Adaptive practice
            </button>
          </>
        ) : (
          <Link
            to="/login"
            className="text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 font-medium"
          >
            Sign in to start
          </Link>
        )}
      </section>

      {user && completedAttempts.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-lg font-semibold mb-3 inline-flex items-center gap-1.5">
            <ListChecks className="w-4 h-4 text-primary" />
            Your past attempts
          </h2>
          <div className="space-y-2">
            {completedAttempts.slice(0, 10).map((h) => (
              <div
                key={h.id}
                className="rounded-lg border border-border bg-card p-3 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="text-sm font-medium">
                    {h.mode === "full_mock"
                      ? "Full mock"
                      : h.mode === "section"
                        ? `Section · ${h.sectionSlug ?? ""}`
                        : "Adaptive"}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                    {formatDate(h.startedAt)}
                  </div>
                </div>
                <div className="text-right">
                  {h.scoreScaled != null && (
                    <div className="font-mono font-semibold text-base">
                      {h.scoreScaled}
                    </div>
                  )}
                  {h.scorePercentile != null && (
                    <div className="text-[10px] text-muted-foreground">
                      {h.scorePercentile}th pct
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

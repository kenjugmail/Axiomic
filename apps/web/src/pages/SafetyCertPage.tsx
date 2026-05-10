import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import type {
  SafetyCertAttemptResponse,
  SafetyCertWithQuestionsResponse,
  UserSafetyCertEntry,
} from "@axiomic/types";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { CertExpiryBadge } from "../components/lab/CertExpiryBadge";
import { DISCIPLINE_LABEL } from "../components/lab/DisciplineFilterChips";

interface MultipleChoiceQuestion {
  id: string;
  kind?: string;
  question: string;
  options: string[];
}

function isMC(q: Record<string, unknown>): boolean {
  return (
    typeof q.id === "string" &&
    typeof q.question === "string" &&
    Array.isArray(q.options) &&
    (q.options as unknown[]).every((o) => typeof o === "string") &&
    (q.kind === undefined ||
      q.kind === "multiple_choice" ||
      q.kind === null)
  );
}

export function SafetyCertPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuthStore();
  const [data, setData] = useState<SafetyCertWithQuestionsResponse | null>(
    null,
  );
  const [held, setHeld] = useState<UserSafetyCertEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SafetyCertAttemptResponse | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setData(null);
    setError(null);
    setResult(null);
    setAnswers({});
    api.lab.safetyCerts
      .get(slug)
      .then((res) => {
        if (cancelled) return;
        setData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message ?? "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!user || !slug) {
      setHeld(null);
      return;
    }
    let cancelled = false;
    api.lab.safetyCerts.mine().then((res) => {
      if (cancelled) return;
      const found = res.certs.find((c) => c.certSlug === slug) ?? null;
      setHeld(found);
    });
    return () => {
      cancelled = true;
    };
  }, [user, slug, result]);

  const mcQuestions = useMemo(() => {
    if (!data) return [] as MultipleChoiceQuestion[];
    const out: MultipleChoiceQuestion[] = [];
    for (const q of data.questions) {
      if (isMC(q)) {
        out.push(q as unknown as MultipleChoiceQuestion);
      }
    }
    return out;
  }, [data]);

  const allAnswered =
    data &&
    mcQuestions.length === data.questions.length &&
    mcQuestions.every((q) => answers[q.id] !== undefined);

  const submit = async () => {
    if (!slug) return;
    setSubmitting(true);
    try {
      const res = await api.lab.safetyCerts.attempt(slug, answers);
      setResult(res);
    } catch (err) {
      setError((err as Error)?.message ?? "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link
          to="/lab/safety-certs"
          className="text-sm text-muted-foreground"
        >
          ← Back to certifications
        </Link>
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-3">
        <div className="animate-pulse h-10 bg-muted rounded-md w-2/3" />
        <div className="animate-pulse h-32 bg-muted rounded-xl" />
      </div>
    );
  }

  const { cert } = data;

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link
        to="/lab/safety-certs"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} />
        Certifications
      </Link>

      <header className="mt-3 mb-5">
        <div className="flex flex-wrap items-center gap-2 mb-2 text-xs text-muted-foreground">
          <span className="px-2 py-0.5 rounded-full bg-muted text-foreground font-medium">
            {DISCIPLINE_LABEL[cert.discipline]}
          </span>
          <span>· passing {(cert.passingScore * 100).toFixed(0)}%</span>
          {cert.validityDays ? (
            <span>· expires after {cert.validityDays}d</span>
          ) : (
            <span>· no expiry</span>
          )}
        </div>
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-3xl font-semibold tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-primary" strokeWidth={1.75} />
            {cert.title}
          </h1>
          {held && <CertExpiryBadge expiresAt={held.expiresAt} verbose />}
        </div>
        {cert.description && (
          <p className="text-muted-foreground mt-2">{cert.description}</p>
        )}
      </header>

      {!user && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 mb-5 text-sm">
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>{" "}
          to take this certification.
        </div>
      )}

      {result && (
        <div
          className={`rounded-lg border p-4 mb-5 ${
            result.passed
              ? "border-emerald-500/40 bg-emerald-500/5"
              : "border-amber-500/40 bg-amber-500/5"
          }`}
        >
          <div className="font-semibold text-foreground mb-1">
            {result.passed
              ? "Passed — certification recorded."
              : "Not yet — try again."}
          </div>
          <div className="text-sm text-muted-foreground">
            {result.correct} / {result.total} correct ·{" "}
            {(result.score * 100).toFixed(0)}%
            {result.passingScore && !result.passed
              ? ` (need ${(result.passingScore * 100).toFixed(0)}%)`
              : ""}
          </div>
          {result.expiresAt && (
            <div className="text-xs text-muted-foreground mt-1">
              Valid until{" "}
              {new Date(result.expiresAt).toLocaleDateString()}
            </div>
          )}
          {!result.passed && (
            <button
              type="button"
              onClick={() => {
                setAnswers({});
                setResult(null);
              }}
              className="mt-3 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent/40"
            >
              Reset answers
            </button>
          )}
        </div>
      )}

      {mcQuestions.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          This certification uses an unsupported question type. Contact the
          author.
        </p>
      ) : (
        <ol className="space-y-4">
          {mcQuestions.map((q, idx) => {
            const selected = answers[q.id];
            return (
              <li
                key={q.id}
                className="rounded-lg border border-border bg-card p-4"
              >
                <h3 className="text-sm font-semibold text-foreground mb-3">
                  <span className="text-muted-foreground font-mono mr-2">
                    {idx + 1}.
                  </span>
                  {q.question}
                </h3>
                <ul className="space-y-2">
                  {q.options.map((opt, i) => {
                    const value = String(i);
                    const checked = selected === value;
                    return (
                      <li key={i}>
                        <label
                          className={`flex items-start gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors duration-fast ${
                            checked
                              ? "border-primary bg-primary/10"
                              : "border-border hover:bg-accent/40"
                          } ${result ? "cursor-default" : ""}`}
                        >
                          <input
                            type="radio"
                            name={q.id}
                            value={value}
                            checked={checked}
                            disabled={!user || !!result}
                            onChange={() =>
                              setAnswers((prev) => ({
                                ...prev,
                                [q.id]: value,
                              }))
                            }
                            className="mt-0.5"
                          />
                          <span className="text-sm">{opt}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
      )}

      {user && mcQuestions.length > 0 && !result && (
        <div className="mt-6 flex items-center justify-end">
          <button
            type="button"
            disabled={!allAnswered || submitting}
            onClick={submit}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? "Grading…" : "Submit"}
          </button>
        </div>
      )}
    </article>
  );
}

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import {
  api,
  type MasteryPath,
  type OnboardingGoal,
  type PrimaryPersona,
} from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";
import { toast } from "../stores/toast";
import { AUDIENCES, AUDIENCE_IDS } from "../marketing/audiences";

const ACCENTS = [
  "bg-accent-indigo",
  "bg-accent-emerald",
  "bg-accent-rose",
  "bg-accent-amber",
];

const GOALS: Array<{
  id: OnboardingGoal;
  label: string;
  description: string;
}> = [
  {
    id: "complete_track",
    label: "Complete a capstone track",
    description: "Bundle 4-6 capstones into a single signed credential.",
  },
  {
    id: "finish_path",
    label: "Finish a mastery path",
    description: "Walk a path from apprentice to expert.",
  },
  {
    id: "publish_paper",
    label: "Publish a research paper",
    description: "Author a tiered article with runnable code cells.",
  },
  {
    id: "join_cohort",
    label: "Join a cohort",
    description: "Work alongside others on the same material.",
  },
  {
    id: "ship_misconception",
    label: "Ship a misconception",
    description: "Spot a common gap and propose a correction to the catalog.",
  },
];

type Step = 0 | 1 | 2 | 3;

export function OnboardingPage() {
  const navigate = useNavigate();
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const { user, loading: authLoading } = useAuthStore();
  const [paths, setPaths] = useState<MasteryPath[] | null>(null);
  const [step, setStep] = useState<Step>(0);
  const [persona, setPersona] = useState<PrimaryPersona | null>(null);
  const [picked, setPicked] = useState<MasteryPath | null>(null);
  const [goal, setGoal] = useState<OnboardingGoal | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.mastery
      .getPaths()
      .then((r) => setPaths(r.paths))
      .catch(() => setPaths([]));
  }, []);

  useEffect(() => {
    if (!authLoading && !user) navigate("/signup");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    api.onboarding
      .status()
      .then((s) => {
        if (s.onboarded) navigate("/", { replace: true });
      })
      .catch(() => {});
  }, [user, navigate]);

  const finish = async (chosen?: MasteryPath) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const r = await api.onboarding.complete(
        chosen?.slug,
        goal ?? undefined,
        persona ?? undefined,
      );
      await fetchUser();
      if (chosen && r.firstNodeSlug) {
        navigate(`/paths/${chosen.slug}/lessons/${r.firstNodeSlug}`, {
          replace: true,
        });
      } else if (chosen) {
        navigate(`/paths/${chosen.slug}`, { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't finish onboarding.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 min-h-[60vh] flex flex-col">
      <div className="flex items-center gap-2 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-fast ${
              i <= step ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-6 sm:p-8 shadow-soft animate-fade-in">
        {step === 0 && (
          <>
            <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-primary mb-2">
              <Sparkles className="w-3 h-3" strokeWidth={2} />
              Step 1 · Focus
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight leading-tight mb-3">
              What brings you to Axiomic?
            </h1>
            <p className="text-base text-muted-foreground mb-5">
              We use this to tune navigation hints and the AI coach. You can
              change it anytime in settings.
            </p>
            <div className="grid sm:grid-cols-2 gap-2 mb-6">
              {AUDIENCE_IDS.map((id, i) => {
                const def = AUDIENCES[id];
                const active = persona === id;
                const accent = ACCENTS[i % ACCENTS.length];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPersona(active ? null : id)}
                    className={`group relative text-left rounded-lg border p-3 transition-colors duration-fast ${
                      active
                        ? "border-primary ring-1 ring-primary/40 bg-primary/5"
                        : "border-border hover:bg-accent/30"
                    }`}
                  >
                    <span
                      className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${accent}`}
                    />
                    <div className="pl-2 text-sm font-semibold flex items-center gap-1.5">
                      {def.title.replace(/^For /, "")}
                      {active && (
                        <Check className="w-3.5 h-3.5 text-primary" strokeWidth={2.5} />
                      )}
                    </div>
                    <p className="pl-2 text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {def.tagline}
                    </p>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors duration-fast"
              >
                Continue
                <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => finish(undefined)}
                disabled={submitting}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Skip and explore on my own
              </button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-primary mb-2">
              <Sparkles className="w-3 h-3" strokeWidth={2} />
              Step 2 · Welcome
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight leading-tight mb-3">
              Let's set you up.
            </h1>
            <p className="text-base text-muted-foreground mb-6">
              Pick a starting path and we'll drop you into the first lesson.
              You can switch paths any time — nothing is locked.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors duration-fast"
              >
                Choose a path
                <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => setStep(0)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => finish(undefined)}
                disabled={submitting}
                className="ml-auto text-sm text-muted-foreground hover:text-foreground"
              >
                Skip and explore on my own
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Step 3 · Pick a path
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight leading-tight mb-3">
              What do you want to learn first?
            </h2>
            <p className="text-sm text-muted-foreground mb-5">
              Each path runs from apprentice to researcher. You can read,
              quiz, or run interactive lessons end-to-end.
            </p>
            {paths === null ? (
              <div className="space-y-3">
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
              </div>
            ) : paths.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No paths available right now.{" "}
                <Link to="/" className="text-primary hover:underline">
                  Continue
                </Link>
              </p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {paths.map((p, i) => {
                  const accent = ACCENTS[i % ACCENTS.length];
                  const active = picked?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPicked(p)}
                      className={`group relative pl-5 pr-4 py-4 rounded-lg border bg-card text-left transition-all duration-fast ${
                        active
                          ? "border-primary ring-1 ring-primary/40"
                          : "border-border hover:bg-accent/30 hover:shadow-soft"
                      }`}
                    >
                      <span
                        className={`absolute left-0 top-0 bottom-0 w-1 ${accent}`}
                      />
                      <h3 className="font-semibold text-base mb-1 flex items-center gap-1.5">
                        {p.title}
                        {active && (
                          <Check
                            className="w-4 h-4 text-primary"
                            strokeWidth={2.5}
                          />
                        )}
                      </h3>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {p.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex items-center gap-3 mt-6 flex-wrap">
              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={!picked}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                Continue
                <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => finish(undefined)}
                disabled={submitting}
                className="ml-auto text-sm text-muted-foreground hover:text-foreground"
              >
                Skip
              </button>
            </div>
          </>
        )}

        {step === 3 && picked && (
          <>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Step 4 · Confirm
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight leading-tight mb-3">
              You're starting with {picked.title}.
            </h2>
            <p className="text-sm text-muted-foreground mb-5">
              Optional: pick a first goal so the AI coach can keep you pointed
              at it. You can change this later.
            </p>
            <div className="grid sm:grid-cols-2 gap-2 mb-5">
              {GOALS.map((g) => {
                const active = goal === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGoal(active ? null : g.id)}
                    className={`text-left rounded-lg border p-3 transition-colors duration-fast ${
                      active
                        ? "border-primary ring-1 ring-primary/40 bg-primary/5"
                        : "border-border hover:bg-accent/30"
                    }`}
                  >
                    <div className="text-sm font-medium flex items-center gap-1.5">
                      {g.label}
                      {active && (
                        <Check className="w-3.5 h-3.5 text-primary" strokeWidth={2.5} />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {g.description}
                    </p>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => finish(picked)}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting ? "Starting…" : "Start the first lesson"}
                <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

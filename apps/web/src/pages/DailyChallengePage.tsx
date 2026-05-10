import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Flame, X as XIcon } from "lucide-react";
import { api } from "../lib/api";
import type { DailyChallengeResponse } from "@axiomic/types";
import { useAuthStore } from "../stores/auth";
import { toast } from "../stores/toast";

export function DailyChallengePage() {
  const me = useAuthStore((s) => s.user);
  const [challenge, setChallenge] = useState<DailyChallengeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ correct: boolean } | null>(null);

  useEffect(() => {
    api.gamification
      .dailyChallenge()
      .then((r) => {
        setChallenge(r);
        if (r.myAnswer) {
          setSelected(parseInt(r.myAnswer.answer, 10));
          setResult({ correct: r.myAnswer.correct });
        }
      })
      .catch((e) => setError(e?.message ?? "Failed to load"));
  }, []);

  const handleSubmit = async () => {
    if (selected === null || submitting || !me) return;
    setSubmitting(true);
    try {
      const r = await api.gamification.submitDaily(String(selected));
      setResult({ correct: r.correct });
      setChallenge((c) => (c ? { ...c, stats: r.stats, streak: r.streak, myAnswer: { answer: String(selected), correct: r.correct } } : c));

      // S91 — celebrate the XP grant + level-up. xpAwarded is 0 on a
      // wrong answer or a re-attempt, so silence those cases.
      if (r.xpAwarded && r.xpAwarded > 0) {
        toast.success(`+${r.xpAwarded} XP for the daily challenge!`);
      }
      if (r.petHatched) {
        toast.success(`Your egg hatched into a ${r.petHatched.name}!`);
      }
      if (r.petLeveledUp) {
        toast.success(`Your pet leveled up to Lv ${r.petLeveledUp.newLevel}!`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }
  if (!challenge) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="animate-pulse h-48 bg-muted rounded-xl" />
      </div>
    );
  }

  const q = challenge.question.raw;
  const opts: string[] = Array.isArray(q?.options) ? q.options : [];

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="text-xs uppercase tracking-wider text-primary mb-1">
        Daily challenge · {challenge.day}
      </div>
      <h1 className="text-2xl font-bold mb-2">{q?.question ?? "Today's question"}</h1>
      <p className="text-sm text-muted-foreground mb-6">
        From{" "}
        <Link to={`/wiki/${challenge.nodeSlug}`} className="text-primary hover:underline">
          {challenge.nodeTitle}
        </Link>
        . {challenge.stats.attempted} {challenge.stats.attempted === 1 ? "answer" : "answers"} so far
        {challenge.stats.attempted > 0 && (
          <> · {Math.round(challenge.stats.correctRate * 100)}% correct</>
        )}
      </p>

      <ul className="space-y-2 mb-6">
        {opts.map((label: string, i: number) => {
          const isSelected = selected === i;
          const isCorrect = result && result.correct && isSelected;
          const isWrong = result && !result.correct && isSelected;
          return (
            <li key={i}>
              <button
                onClick={() => !result && setSelected(i)}
                disabled={!!result || !me}
                className={`w-full text-left px-3 py-2 rounded-md border text-sm transition-colors ${
                  isCorrect
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : isWrong
                      ? "border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-400"
                      : isSelected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-accent/40"
                } disabled:cursor-not-allowed`}
              >
                <span className="text-xs text-muted-foreground mr-2">
                  {String.fromCharCode(65 + i)}.
                </span>
                {label}
              </button>
            </li>
          );
        })}
      </ul>

      {!me ? (
        <p className="text-sm text-muted-foreground">
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>{" "}
          to submit your answer and start a streak.
        </p>
      ) : !result ? (
        <button
          onClick={handleSubmit}
          disabled={selected === null || submitting}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit answer"}
        </button>
      ) : (
        <div className={`rounded-lg border p-4 ${
          result.correct
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-rose-500/30 bg-rose-500/5"
        }`}>
          <div className="font-semibold mb-1 inline-flex items-center gap-1.5">
            {result.correct ? (
              <>
                <Check className="w-4 h-4" strokeWidth={2.5} />
                Correct
              </>
            ) : (
              <>
                <XIcon className="w-4 h-4" strokeWidth={2.5} />
                Not quite
              </>
            )}
          </div>
          {q?.explanation && (
            <p className="text-sm text-muted-foreground">{q.explanation}</p>
          )}
          <p className="inline-flex items-center gap-1 text-xs text-muted-foreground mt-3">
            <Flame className="w-3 h-3" strokeWidth={2} />
            Streak: <span className="font-semibold text-foreground">{challenge.streak}</span> day{challenge.streak === 1 ? "" : "s"}
          </p>
        </div>
      )}
    </div>
  );
}

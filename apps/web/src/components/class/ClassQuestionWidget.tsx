// S96 — Class question of the day widget.
//
// One component, two modes: students see the active question (or
// the post-answer feedback), instructors see a "Compose" form
// inline so they can publish without leaving the class page. Lives
// at the top of ClassPage's Tasks tab when an active question
// exists; instructor-mode also shows when none exists so they can
// publish the first one.

import { useEffect, useState } from "react";
import { Check, X, Send, HelpCircle } from "lucide-react";
import type { ClassQuestionActive, ClassRole } from "@axiomic/types";
import { api, ApiError } from "../../lib/api";
import { toast } from "../../stores/toast";

interface ClassQuestionWidgetProps {
  classSlug: string;
  myRole: ClassRole;
}

export function ClassQuestionWidget({ classSlug, myRole }: ClassQuestionWidgetProps) {
  const [active, setActive] = useState<ClassQuestionActive | null | undefined>(undefined);
  const [composing, setComposing] = useState(false);
  const isStaff = myRole === "instructor" || myRole === "ta";

  const reload = async () => {
    try {
      const r = await api.classes.activeQuestion(classSlug);
      setActive(r.question);
    } catch {
      setActive(null);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classSlug]);

  // Loading: render nothing to avoid layout flash.
  if (active === undefined) return null;

  // No active question. Students see nothing; instructors get a
  // small "publish a question" affordance.
  if (!active) {
    if (!isStaff) return null;
    return (
      <div className="rounded-md border border-dashed border-border p-3 mb-4">
        {composing ? (
          <ComposeForm
            classSlug={classSlug}
            onClose={() => setComposing(false)}
            onPublished={() => { setComposing(false); reload(); }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="text-xs text-primary hover:underline inline-flex items-center gap-1.5"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Publish a question of the day
          </button>
        )}
      </div>
    );
  }

  // Active question: students see the answer UI; instructors see
  // the question + a "publish a new one" link to rotate.
  return (
    <div className="rounded-md border border-primary/40 bg-primary/5 p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <HelpCircle className="w-4 h-4 text-primary" />
        <span className="text-[10px] uppercase tracking-wider text-primary font-semibold">
          Question of the day
        </span>
      </div>
      <p className="text-sm font-medium mb-3">{active.prompt}</p>
      <ChoicesList
        classSlug={classSlug}
        question={active}
        onAnswered={reload}
      />
      {isStaff && (
        <div className="mt-3 pt-3 border-t border-primary/20">
          {composing ? (
            <ComposeForm
              classSlug={classSlug}
              onClose={() => setComposing(false)}
              onPublished={() => { setComposing(false); reload(); }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="text-xs text-primary hover:underline"
            >
              Publish a new question (closes this one)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ChoicesList({
  classSlug,
  question,
  onAnswered,
}: {
  classSlug: string;
  question: ClassQuestionActive;
  onAnswered: () => void;
}) {
  const [busyIdx, setBusyIdx] = useState<number | null>(null);
  const myAttempt = question.myAttempt;

  const submit = async (idx: number) => {
    setBusyIdx(idx);
    try {
      const r = await api.classes.answerQuestion(classSlug, question.id, { answerIndex: idx });
      toast.success(
        r.correct
          ? `Correct! +${r.xpAwarded} XP`
          : "Not quite — better luck next time.",
      );
      onAnswered();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setBusyIdx(null);
    }
  };

  return (
    <ul className="space-y-1.5">
      {question.choices.map((choice, idx) => {
        const isMyPick = myAttempt?.answerIndex === idx;
        const isCorrect = myAttempt?.correctIndex === idx;
        // After answering: highlight correct in green, my-wrong in red.
        const stateClass = !myAttempt
          ? "border-border hover:bg-accent/40"
          : isCorrect
            ? "border-emerald-500/60 bg-emerald-500/10"
            : isMyPick
              ? "border-red-500/60 bg-red-500/10"
              : "border-border opacity-60";
        return (
          <li key={idx}>
            <button
              type="button"
              onClick={() => !myAttempt && submit(idx)}
              disabled={!!myAttempt || busyIdx !== null}
              className={`w-full text-left text-sm px-3 py-2 rounded-md border ${stateClass} flex items-center gap-2 transition-colors disabled:cursor-default`}
            >
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground w-4">
                {String.fromCharCode(65 + idx)}
              </span>
              <span className="flex-1">{choice}</span>
              {myAttempt && isCorrect && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
              {myAttempt && isMyPick && !isCorrect && <X className="w-4 h-4 text-red-500 shrink-0" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ComposeForm({
  classSlug,
  onClose,
  onPublished,
}: {
  classSlug: string;
  onClose: () => void;
  onPublished: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [choices, setChoices] = useState<string[]>(["", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const setChoice = (idx: number, value: string) => {
    setChoices((arr) => arr.map((c, i) => (i === idx ? value : c)));
  };
  const addChoice = () => setChoices((arr) => (arr.length < 8 ? [...arr, ""] : arr));
  const removeChoice = (idx: number) => {
    if (choices.length <= 2) return;
    setChoices((arr) => arr.filter((_, i) => i !== idx));
    if (correctIndex >= choices.length - 1) setCorrectIndex(0);
  };

  const canSubmit =
    prompt.trim().length >= 3 &&
    choices.every((c) => c.trim().length > 0) &&
    correctIndex >= 0 &&
    correctIndex < choices.length;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await api.classes.createQuestion(classSlug, {
        prompt: prompt.trim(),
        choices: choices.map((c) => c.trim()),
        correctIndex,
      });
      toast.success("Question published");
      onPublished();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          New question
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
      <input
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Question prompt"
        className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
      />
      <div className="space-y-1">
        {choices.map((c, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCorrectIndex(idx)}
              title="Mark correct"
              className={`w-5 h-5 rounded-full border ${
                correctIndex === idx
                  ? "bg-emerald-500 border-emerald-500 text-white"
                  : "border-border"
              } flex items-center justify-center text-[10px] font-bold`}
            >
              {correctIndex === idx ? "✓" : String.fromCharCode(65 + idx)}
            </button>
            <input
              value={c}
              onChange={(e) => setChoice(idx, e.target.value)}
              placeholder={`Choice ${String.fromCharCode(65 + idx)}`}
              className="flex-1 text-sm px-3 py-1.5 rounded-md border border-border bg-background"
            />
            {choices.length > 2 && (
              <button
                type="button"
                onClick={() => removeChoice(idx)}
                className="text-muted-foreground hover:text-destructive p-1"
                aria-label="Remove choice"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
        {choices.length < 8 && (
          <button
            type="button"
            onClick={addChoice}
            className="text-xs text-primary hover:underline"
          >
            + Add choice
          </button>
        )}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit || busy}
          className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 inline-flex items-center gap-1.5"
        >
          <Send className="w-3.5 h-3.5" />
          {busy ? "Publishing…" : "Publish"}
        </button>
      </div>
    </div>
  );
}

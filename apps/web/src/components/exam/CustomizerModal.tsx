// Digital-SAT-parity: pre-start customizer modal. Before launching
// an attempt the learner picks which sections to include, the
// question count per section, a time multiplier (1× / 1.5× / 2×
// for accommodations), a difficulty filter, shuffle on/off, and
// whether the calculator panel is available during the math
// section.
//
// Default values mirror today's no-customizer behavior — opening
// the modal and clicking "Start" without changing anything yields
// the same attempt the previous one-click "Start full mock" did.

import { useMemo, useState } from "react";
import type { ExamDetail, ExamAttemptCustomizer } from "@axiomic/types";
import { Modal } from "../ui/Modal";

interface Props {
  open: boolean;
  exam: ExamDetail;
  // Initial state. Caller can pre-seed for a "section only" launch.
  initialSections?: Array<{ slug: string; questionCount: number }>;
  onClose: () => void;
  onStart: (customizer: ExamAttemptCustomizer) => void;
  starting?: boolean;
}

const DIFFICULTY_BANDS: Array<{ value: number; label: string }> = [
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
];

export function CustomizerModal({
  open,
  exam,
  initialSections,
  onClose,
  onStart,
  starting,
}: Props) {
  // Per-section enabled + count. Keyed by slug for stable update.
  const defaults = useMemo(() => {
    const seed = initialSections
      ? new Map(initialSections.map((s) => [s.slug, s.questionCount]))
      : null;
    return exam.sections.map((s) => ({
      slug: s.slug,
      title: s.title,
      enabled: seed ? seed.has(s.slug) : true,
      questionCount: seed?.get(s.slug) ?? s.questionCount,
      max: s.questionCount,
    }));
  }, [exam.sections, initialSections]);

  const [sectionRows, setSectionRows] = useState(defaults);
  const [timeMultiplier, setTimeMultiplier] = useState<1 | 1.5 | 2>(1);
  const [difficultyFilter, setDifficultyFilter] = useState<number[]>([]);
  const [shuffle, setShuffle] = useState(true);
  const [calculatorAllowed, setCalculatorAllowed] = useState(true);

  const enabledCount = sectionRows.filter((r) => r.enabled).length;
  const anyZeroCount = sectionRows.some(
    (r) => r.enabled && (!Number.isFinite(r.questionCount) || r.questionCount < 1),
  );
  const valid = enabledCount > 0 && !anyZeroCount;

  function toggleDifficulty(d: number) {
    setDifficultyFilter((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
    );
  }

  function handleStart() {
    if (!valid) return;
    const payload: ExamAttemptCustomizer = {
      sections: sectionRows
        .filter((r) => r.enabled)
        .map((r) => ({ slug: r.slug, questionCount: r.questionCount })),
      timeMultiplier,
      difficultyFilter: difficultyFilter.length > 0 ? difficultyFilter : null,
      shuffle,
      calculatorAllowed,
    };
    onStart(payload);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Configure your attempt"
      description="Tune timing, length, and difficulty before you begin."
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStart}
            disabled={!valid || starting}
            className="text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 font-medium"
            data-testid="customizer-start"
          >
            {starting ? "Starting…" : "Start attempt"}
          </button>
        </div>
      }
    >
      <div className="p-5 space-y-5 text-sm">
        {/* Sections + question counts */}
        <section>
          <h3 className="font-display text-sm font-semibold mb-2">Sections</h3>
          <div className="space-y-2">
            {sectionRows.map((r, i) => (
              <div
                key={r.slug}
                className="rounded-md border border-border bg-card/50 p-3 flex items-center gap-3"
              >
                <input
                  type="checkbox"
                  id={`sec-${r.slug}`}
                  checked={r.enabled}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    setSectionRows((rs) =>
                      rs.map((row, j) =>
                        j === i ? { ...row, enabled } : row,
                      ),
                    );
                  }}
                  className="h-4 w-4"
                />
                <label
                  htmlFor={`sec-${r.slug}`}
                  className="flex-1 font-medium cursor-pointer"
                >
                  {r.title}
                </label>
                <label className="text-xs text-muted-foreground">
                  Questions
                </label>
                <input
                  type="number"
                  min={1}
                  max={r.max}
                  value={r.questionCount}
                  onChange={(e) => {
                    const v = Math.max(
                      1,
                      Math.min(r.max, Number(e.target.value) || 0),
                    );
                    setSectionRows((rs) =>
                      rs.map((row, j) =>
                        j === i ? { ...row, questionCount: v } : row,
                      ),
                    );
                  }}
                  disabled={!r.enabled}
                  aria-label={`${r.title} question count`}
                  className="w-16 px-2 py-1 rounded border border-input bg-background text-sm font-mono text-right disabled:opacity-50"
                />
                <span className="text-[10px] text-muted-foreground">
                  / {r.max}
                </span>
              </div>
            ))}
          </div>
          {!valid && (
            <p className="text-xs text-amber-500 mt-2" data-testid="customizer-error">
              Enable at least one section and set a question count ≥ 1.
            </p>
          )}
        </section>

        {/* Time multiplier — accommodations */}
        <section>
          <h3 className="font-display text-sm font-semibold mb-2">Timing</h3>
          <div className="flex items-center gap-2 flex-wrap">
            {[1, 1.5, 2].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setTimeMultiplier(m as 1 | 1.5 | 2)}
                aria-pressed={timeMultiplier === m}
                className={`text-xs px-3 py-1.5 rounded-md border ${
                  timeMultiplier === m
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-accent/40"
                }`}
              >
                {m}× time
              </button>
            ))}
            <span className="text-xs text-muted-foreground">
              {timeMultiplier === 1
                ? "Standard test timing."
                : `Each section runs ${timeMultiplier}× longer for accommodations.`}
            </span>
          </div>
        </section>

        {/* Difficulty filter */}
        <section>
          <h3 className="font-display text-sm font-semibold mb-2">
            Difficulty filter
          </h3>
          <div className="flex items-center gap-1.5 flex-wrap">
            {DIFFICULTY_BANDS.map((b) => {
              const on = difficultyFilter.includes(b.value);
              return (
                <button
                  key={b.value}
                  type="button"
                  onClick={() => toggleDifficulty(b.value)}
                  aria-pressed={on}
                  className={`text-xs px-2.5 py-1 rounded-md border min-w-[2rem] ${
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-accent/40"
                  }`}
                >
                  {b.label}
                </button>
              );
            })}
            <span className="text-xs text-muted-foreground ml-2">
              {difficultyFilter.length === 0
                ? "All difficulties."
                : `Restricted to band${difficultyFilter.length === 1 ? "" : "s"} ${difficultyFilter.join(", ")}.`}
            </span>
          </div>
        </section>

        {/* Shuffle + calculator */}
        <section className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={shuffle}
              onChange={(e) => setShuffle(e.target.checked)}
              className="h-4 w-4"
            />
            <span>
              Shuffle questions within each section
              <span className="text-xs text-muted-foreground ml-1">
                (off = author order, ascending difficulty)
              </span>
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={calculatorAllowed}
              onChange={(e) => setCalculatorAllowed(e.target.checked)}
              className="h-4 w-4"
            />
            <span>
              Allow the on-screen Desmos calculator
              <span className="text-xs text-muted-foreground ml-1">
                (available on math sections only)
              </span>
            </span>
          </label>
        </section>
      </div>
    </Modal>
  );
}

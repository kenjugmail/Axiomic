// SuperMemo-2 (SM-2) spaced repetition scheduler.
//
// Reference: https://www.supermemo.com/en/blog/application-of-a-computer-to-improve-the-results-obtained-in-working-with-the-supermemo-method
//
// Pure functions only — no DB access. The route handler reads card state,
// calls schedule(), and writes the result back.
//
// Rating semantics (0..5):
//   0..2 — forgot. Reset repetitions; interval to 1 day.
//   3..5 — remembered. Increment repetitions; grow interval by easeFactor.
// In the UI we typically expose only 4 buttons: Again (1) / Hard (3) /
// Good (4) / Easy (5).

export interface SrsCardState {
  easeFactor: number;
  interval: number;       // days; 0 means new
  repetitions: number;
}

export interface SrsResult {
  easeFactor: number;
  interval: number;
  repetitions: number;
  dueAt: string;          // ISO timestamp
}

const MIN_EASE_FACTOR = 1.3;

// Time helper: now + N days, returned as an ISO string. Pulled out so
// tests can override.
function addDaysIso(now: Date, days: number): string {
  const ms = now.getTime() + days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

/**
 * Apply an SM-2 review to a card. Returns the new state (state is
 * stored inline on each row in the DB, so callers persist these fields
 * directly).
 *
 * @param state  the previous state (easeFactor, interval, repetitions)
 * @param rating the user's grade in 0..5
 * @param now    optional clock override for tests
 */
export function schedule(
  state: SrsCardState,
  rating: number,
  now: Date = new Date(),
): SrsResult {
  const r = Math.max(0, Math.min(5, Math.floor(rating)));

  let { easeFactor, interval, repetitions } = state;

  if (r < 3) {
    // Forgot: schedule again tomorrow, reset streak.
    repetitions = 0;
    interval = 1;
  } else {
    // SM-2 ease-factor adjustment.
    easeFactor =
      easeFactor + (0.1 - (5 - r) * (0.08 + (5 - r) * 0.02));
    if (easeFactor < MIN_EASE_FACTOR) easeFactor = MIN_EASE_FACTOR;

    repetitions = repetitions + 1;
    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
  }

  return {
    easeFactor,
    interval,
    repetitions,
    dueAt: addDaysIso(now, interval),
  };
}

// Initial state for a brand-new card before any review.
export function newCardState(): SrsCardState {
  return { easeFactor: 2.5, interval: 0, repetitions: 0 };
}

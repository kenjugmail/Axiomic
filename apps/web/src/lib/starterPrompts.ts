// Sprint 64b-5 — tier-specific starter prompts for the AI tutor.
//
// When the sidebar opens with no messages + no coach suggestions
// applicable, we surface a curated prompt list keyed by the page's
// `tier`. Wiki pages get conceptual prompts; lessons get
// slide-focused; research papers get critique-focused; capstones get
// progress-focused; forum gets thread-summary.
//
// Falls back to a generic 4-prompt list when tier doesn't match.

export const FALLBACK_PROMPTS = [
  "Explain this topic simply",
  "Quiz me on this",
  "What are the prerequisites?",
  "Give me a practice problem",
];

const PROMPTS_BY_TIER: Record<string, string[]> = {
  // Wiki tiers (intro / undergrad / grad) all share the same prompts —
  // the system prompt already adapts to the tier level.
  intro: [
    "Explain this in one paragraph",
    "What's the simplest concrete example?",
    "What's the prerequisite I should brush up on?",
    "Give me a quick check of my understanding",
  ],
  undergrad: [
    "Explain the intuition first, then the math",
    "What's the canonical example?",
    "Quiz me with one calibrated question",
    "Where does this connect to what I learned before?",
  ],
  grad: [
    "Walk me through the derivation",
    "What's the strongest objection to this framing?",
    "Compare to the alternative formulations",
    "What's an open research question here?",
  ],
  lesson: [
    "What's the main idea of this slide?",
    "Help me solve the question on this slide",
    "Connect this slide to the previous one",
    "Quiz me on what I've covered so far",
  ],
  research: [
    "Summarize the contribution in 3 sentences",
    "Steel-man the methodology",
    "What's the strongest critique?",
    "Trace the references that matter most",
  ],
  capstone: [
    "What should I do next on this capstone?",
    "Review my last submission",
    "What's the rubric really asking for?",
    "Show me an example of a strong submission",
  ],
  forum: [
    "Summarize this thread",
    "What's the strongest critique made so far?",
    "Where is the discussion converging vs diverging?",
    "Help me draft a reply",
  ],
  news: [
    "What's the central claim?",
    "What evidence is the strongest?",
    "Trace the references that matter",
    "Steel-man the counter-argument",
  ],
};

export function starterPromptsFor(tier: string): string[] {
  return PROMPTS_BY_TIER[tier] ?? FALLBACK_PROMPTS;
}

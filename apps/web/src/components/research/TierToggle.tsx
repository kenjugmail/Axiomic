import type { ResearchPaperTier } from "@axiomic/types";

interface Props {
  active: ResearchPaperTier;
  available: ResearchPaperTier[];
  onChange: (tier: ResearchPaperTier) => void;
  // Sticky toggles render with a backdrop blur so they stay legible
  // when the article body scrolls behind them. Pages can opt out for
  // inline use (e.g. inside the editor).
  sticky?: boolean;
}

const LABEL: Record<ResearchPaperTier, string> = {
  intro: "Intro",
  undergrad: "Undergrad",
  grad: "Grad",
};

const TIER_DESCRIPTION: Record<ResearchPaperTier, string> = {
  intro: "Plain-English overview, almost no math.",
  undergrad: "Full math, worked examples, the canonical depth.",
  grad: "Research-flavored, terse, links to open questions.",
};

const ALL_TIERS: ResearchPaperTier[] = ["intro", "undergrad", "grad"];

// Sprint 20 — sticky tier toggle for tiered research papers.
// Mirrors the wiki-page pattern but lives at the top of the article
// view so a reader can swap depths without losing scroll position.
export function TierToggle({ active, available, onChange, sticky = false }: Props) {
  return (
    <div
      className={`${
        sticky
          ? "sticky top-14 z-20 bg-background/85 backdrop-blur border-b border-border py-2"
          : ""
      }`}
    >
      <div role="tablist" aria-label="Reading depth" className="inline-flex gap-1 p-1 rounded-md bg-muted text-xs">
        {ALL_TIERS.map((t) => {
          const enabled = available.includes(t);
          const isActive = active === t;
          return (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={isActive}
              disabled={!enabled}
              title={enabled ? TIER_DESCRIPTION[t] : "No content at this tier yet."}
              onClick={() => enabled && onChange(t)}
              className={`px-3 py-1 rounded transition-colors ${
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : enabled
                    ? "text-muted-foreground hover:text-foreground"
                    : "text-muted-foreground/40 cursor-not-allowed line-through"
              }`}
            >
              {LABEL[t]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface TierSwitcherProps {
  tier: string;
  onTierChange: (tier: string) => void;
}

const tiers = [
  { value: "intro", label: "Intro", description: "Plain English, intuition first" },
  { value: "undergrad", label: "Undergrad", description: "Full mathematical treatment" },
  { value: "grad", label: "Graduate", description: "Research-level depth" },
];

export function TierSwitcher({ tier, onTierChange }: TierSwitcherProps) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-lg bg-muted">
      {tiers.map((t) => (
        <button
          key={t.value}
          onClick={() => onTierChange(t.value)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tier === t.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title={t.description}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

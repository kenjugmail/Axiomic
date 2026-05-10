import type { LabDiscipline } from "@axiomic/types";

const DISCIPLINES: Array<{ slug: LabDiscipline; label: string }> = [
  { slug: "biology", label: "Biology" },
  { slug: "chemistry", label: "Chemistry" },
  { slug: "mechanical", label: "Mechanical" },
  { slug: "electrical", label: "Electrical" },
  { slug: "materials", label: "Materials" },
  { slug: "cs-lab", label: "CS lab" },
  { slug: "physics", label: "Physics" },
];

interface Props {
  active: LabDiscipline | null;
  onChange: (next: LabDiscipline | null) => void;
}

export function DisciplineFilterChips({ active, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by discipline">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors duration-fast border ${
          active === null
            ? "bg-foreground text-background border-foreground"
            : "border-border text-muted-foreground hover:text-foreground hover:bg-accent/40"
        }`}
      >
        All
      </button>
      {DISCIPLINES.map((d) => {
        const isActive = active === d.slug;
        return (
          <button
            key={d.slug}
            type="button"
            onClick={() => onChange(isActive ? null : d.slug)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors duration-fast border ${
              isActive
                ? "bg-foreground text-background border-foreground"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-accent/40"
            }`}
            aria-pressed={isActive}
          >
            {d.label}
          </button>
        );
      })}
    </div>
  );
}

export const DISCIPLINE_LABEL: Record<LabDiscipline, string> = {
  biology: "Biology",
  chemistry: "Chemistry",
  mechanical: "Mechanical",
  electrical: "Electrical",
  materials: "Materials",
  "cs-lab": "CS lab",
  physics: "Physics",
};

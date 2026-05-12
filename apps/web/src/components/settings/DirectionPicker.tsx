import { DIRECTION_OPTIONS, useThemeStore, type Direction } from "../../stores/theme";

/**
 * 5-tile picker for the visual design direction.
 * Each tile shows a 3-swatch row (bg, bg-elev, accent) + the display-font
 * label, so users can preview the look before switching.
 */
export function DirectionPicker() {
  const direction = useThemeStore((s) => s.direction);
  const setDirection = useThemeStore((s) => s.setDirection);

  return (
    <div
      role="radiogroup"
      aria-label="Design direction"
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2"
    >
      {DIRECTION_OPTIONS.map((opt) => {
        const active = direction === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setDirection(opt.value)}
            data-testid={`direction-tile-${opt.value}`}
            className={`text-left rounded-md border p-3 transition-all ${
              active
                ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                : "border-input hover:border-foreground/30"
            }`}
          >
            <div
              className="flex items-center gap-1 mb-2"
              aria-hidden="true"
            >
              <Swatch color={opt.preview.bg} title={`${opt.label} bg`} />
              <Swatch color={opt.preview.bgElev} title={`${opt.label} elevated`} />
              <Swatch color={opt.preview.accent} title={`${opt.label} accent`} />
              <Swatch color={opt.preview.ink} title={`${opt.label} ink`} />
            </div>
            <div className="text-sm font-medium leading-tight">{opt.label}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">
              {opt.fontLabel}
            </div>
            <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {opt.description}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Swatch({ color, title }: { color: string; title: string }) {
  return (
    <span
      title={title}
      style={{ background: color }}
      className="inline-block w-4 h-4 rounded-sm border border-black/10"
    />
  );
}

export type { Direction };

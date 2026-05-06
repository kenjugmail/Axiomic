import { cn } from "../../lib/cn";

type Size = "sm" | "md" | "lg" | "xl";

const SIZE: Record<Size, string> = {
  sm: "w-6 h-6 text-xs",
  md: "w-9 h-9 text-sm",
  lg: "w-12 h-12 text-base",
  xl: "w-16 h-16 text-2xl",
};

interface Props {
  name: string;
  size?: Size;
  className?: string;
}

// Simple letter-avatar. Picks a deterministic accent color per name
// so two users don't share the same chip color in a comment thread.
const PALETTES = [
  "bg-accent-indigo/15 text-accent-indigo",
  "bg-accent-emerald/15 text-accent-emerald",
  "bg-accent-rose/15 text-accent-rose",
  "bg-accent-amber/15 text-accent-amber",
  "bg-accent-sky/15 text-accent-sky",
  "bg-accent-violet/15 text-accent-violet",
];

function paletteFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return PALETTES[Math.abs(h) % PALETTES.length];
}

export function Avatar({ name, size = "md", className }: Props) {
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-semibold shrink-0",
        SIZE[size],
        paletteFor(name),
        className,
      )}
      aria-label={name}
      role="img"
    >
      {initial}
    </div>
  );
}

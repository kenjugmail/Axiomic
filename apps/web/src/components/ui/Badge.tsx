import { cn } from "../../lib/cn";

type Tone =
  | "neutral"
  | "primary"
  | "indigo"
  | "emerald"
  | "rose"
  | "amber"
  | "sky"
  | "violet"
  | "destructive";

type Size = "sm" | "md";

const TONE: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-transparent",
  primary: "bg-primary/10 text-primary border-primary/20",
  indigo: "bg-accent-indigo/10 text-accent-indigo border-accent-indigo/25",
  emerald: "bg-accent-emerald/10 text-accent-emerald border-accent-emerald/25",
  rose: "bg-accent-rose/10 text-accent-rose border-accent-rose/25",
  amber: "bg-accent-amber/10 text-accent-amber border-accent-amber/25",
  sky: "bg-accent-sky/10 text-accent-sky border-accent-sky/25",
  violet: "bg-accent-violet/10 text-accent-violet border-accent-violet/25",
  destructive:
    "bg-destructive/10 text-destructive border-destructive/25",
};

const SIZE: Record<Size, string> = {
  sm: "text-[10px] px-1.5 py-0.5 uppercase tracking-wider",
  md: "text-xs px-2 py-0.5",
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  size?: Size;
  pill?: boolean;
}

// Inline status / metadata chip. Replaces the dozens of inline
// `bg-X-500/10 text-X-700 px-2 py-0.5 rounded` strings.
export function Badge({
  tone = "neutral",
  size = "sm",
  pill = true,
  className,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium border",
        TONE[tone],
        SIZE[size],
        pill ? "rounded-full" : "rounded-md",
        className,
      )}
      {...rest}
    />
  );
}

import { cn } from "../../lib/cn";

type Variant = "block" | "text" | "circle" | "card";

const VARIANT: Record<Variant, string> = {
  block: "rounded-md",
  text: "rounded h-4",
  circle: "rounded-full aspect-square",
  card: "rounded-lg",
};

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
}

// One source of truth for loading shapes. Replaces the dozens of
// inline `animate-pulse h-X bg-muted rounded-Y` lines.
export function Skeleton({ variant = "block", className, ...rest }: Props) {
  return (
    <div
      className={cn(
        "animate-pulse bg-muted",
        VARIANT[variant],
        className,
      )}
      aria-hidden
      {...rest}
    />
  );
}

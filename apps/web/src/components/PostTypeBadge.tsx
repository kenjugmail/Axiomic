import type { PostType } from "@axiomic/types";

const STYLES: Record<PostType, string> = {
  claim: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  question: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
  derivation:
    "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30",
  critique: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
  synthesis:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  prediction:
    "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30",
};

export function PostTypeBadge({
  type,
  className = "",
}: {
  type: PostType;
  className?: string;
}) {
  return (
    <span
      className={`inline-block px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium rounded border ${STYLES[type]} ${className}`}
    >
      {type}
    </span>
  );
}

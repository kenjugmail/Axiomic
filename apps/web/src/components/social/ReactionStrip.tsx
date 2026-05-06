import { Link } from "react-router-dom";
import type { NewsReactionKind } from "@axiomic/types";

const REACTIONS: Array<{
  kind: NewsReactionKind;
  emoji: string;
  label: string;
}> = [
  { kind: "thumbs", emoji: "👍", label: "Helpful" },
  { kind: "lightbulb", emoji: "💡", label: "Insightful" },
  { kind: "mind_blown", emoji: "🤯", label: "Mind-blown" },
];

interface Props {
  signedIn: boolean;
  reactionCounts: Record<NewsReactionKind, number>;
  myReactions: Record<NewsReactionKind, boolean> | null;
  onReact: (kind: NewsReactionKind) => void;
  pending?: boolean;
}

// Shared reaction strip used by news articles and forum topics. The host
// owns the data + handler; the strip is presentation-only.
export function ReactionStrip({
  signedIn,
  reactionCounts,
  myReactions,
  onReact,
  pending,
}: Props) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {REACTIONS.map((r) => {
          const count = reactionCounts[r.kind];
          const mine = !!myReactions?.[r.kind];
          return (
            <button
              key={r.kind}
              onClick={() => onReact(r.kind)}
              disabled={!signedIn || !!pending}
              className={`px-3 py-1.5 rounded-full border text-sm transition-colors flex items-center gap-2 ${
                mine
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-accent/40"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title={signedIn ? r.label : "Sign in to react"}
            >
              <span className="text-lg">{r.emoji}</span>
              <span className="font-medium">{r.label}</span>
              {count > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {!signedIn && (
        <p className="text-xs text-muted-foreground mt-2">
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>{" "}
          to react.
        </p>
      )}
    </div>
  );
}

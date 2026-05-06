import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import type { ForumPoll } from "@axiomic/types";

interface Props {
  topicSlug: string;
  poll: ForumPoll;
  signedIn: boolean;
  // Lets the host know the poll updated so it can refresh / merge state.
  onChange: (next: ForumPoll) => void;
}

export function PollEmbed({ poll, signedIn, onChange }: Props) {
  const [voting, setVoting] = useState(false);
  const [showResults, setShowResults] = useState(!!poll.myOptionId);
  const total = Math.max(1, poll.totalVotes);

  const vote = async (optionId: string) => {
    if (!signedIn || voting) return;
    setVoting(true);
    try {
      const res = await api.forum.votePoll(poll.id, optionId);
      onChange({
        id: res.poll.id,
        question: poll.question,
        myOptionId: res.poll.myOptionId,
        totalVotes: res.poll.totalVotes,
        options: res.poll.options,
      });
      setShowResults(true);
    } finally {
      setVoting(false);
    }
  };

  return (
    <div className="rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-500/5 to-transparent p-5 my-4">
      <div className="text-[10px] uppercase tracking-wider text-violet-700 dark:text-violet-300 mb-1">
        Poll
      </div>
      <h3 className="text-base font-semibold mb-3">{poll.question}</h3>
      <ul className="space-y-2">
        {poll.options.map((opt) => {
          const pct = (opt.count / total) * 100;
          const mine = poll.myOptionId === opt.id;
          return (
            <li key={opt.id}>
              <button
                onClick={() => vote(opt.id)}
                disabled={!signedIn || voting}
                className={`relative w-full text-left px-3 py-2 rounded-md border overflow-hidden transition-colors ${
                  mine
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-accent/30"
                } disabled:cursor-not-allowed disabled:opacity-70`}
              >
                {showResults && (
                  <div
                    className={`absolute inset-0 ${
                      mine ? "bg-primary/20" : "bg-muted/60"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                )}
                <div className="relative flex items-center justify-between gap-3">
                  <span className="text-sm font-medium flex items-center gap-2">
                    {mine && <span className="text-primary">✓</span>}
                    {opt.label}
                  </span>
                  {showResults && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {opt.count} · {pct.toFixed(0)}%
                    </span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
        <span>
          {poll.totalVotes} vote{poll.totalVotes === 1 ? "" : "s"}
        </span>
        {!signedIn ? (
          <Link to="/login" className="text-primary hover:underline">
            Sign in to vote →
          </Link>
        ) : (
          <button
            onClick={() => setShowResults((v) => !v)}
            className="hover:text-foreground"
          >
            {showResults ? "Hide results" : "Show results"}
          </button>
        )}
      </div>
    </div>
  );
}

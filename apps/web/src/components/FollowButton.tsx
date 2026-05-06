import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";

interface Props {
  username: string;
  // Optional initial state to avoid a flash. The component re-fetches
  // anyway to stay in sync after the parent's data finishes loading.
  initial?: { following: boolean; followerCount: number };
  // Compact: small button suitable for an article byline. Default false.
  compact?: boolean;
  onChange?: (state: { following: boolean; followerCount: number }) => void;
}

export function FollowButton({ username, initial, compact, onChange }: Props) {
  const me = useAuthStore((s) => s.user);
  const [following, setFollowing] = useState(initial?.following ?? false);
  const [followerCount, setFollowerCount] = useState(
    initial?.followerCount ?? 0,
  );
  const [loaded, setLoaded] = useState(!!initial);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api.social
      .followStats(username)
      .then((r) => {
        setFollowing(r.following);
        setFollowerCount(r.followerCount);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [username]);

  const isMe = !!me && me.username === username;
  if (isMe) return null;

  const toggle = async () => {
    if (!me || pending) return;
    setPending(true);
    try {
      const r = await api.social.toggleFollow(username);
      const nextFollowing = r.following;
      const nextCount = followerCount + (nextFollowing ? 1 : -1);
      setFollowing(nextFollowing);
      setFollowerCount(Math.max(0, nextCount));
      onChange?.({
        following: nextFollowing,
        followerCount: Math.max(0, nextCount),
      });
    } finally {
      setPending(false);
    }
  };

  if (!me) {
    return (
      <Link
        to="/login"
        className={`${compact ? "text-xs px-2 py-0.5" : "text-sm px-3 py-1.5"} rounded-full border border-border hover:bg-accent/40`}
      >
        Follow
      </Link>
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={!loaded || pending}
      className={`${compact ? "text-xs px-2 py-0.5" : "text-sm px-3 py-1.5"} rounded-full border transition-colors disabled:opacity-50 ${
        following
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-rose-500/10 hover:text-rose-700 hover:border-rose-500/40"
          : "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
      }`}
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}

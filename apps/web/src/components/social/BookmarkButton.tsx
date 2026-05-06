interface Props {
  bookmarked: boolean;
  onToggle: () => void;
  pending?: boolean;
}

// "Save for later" toggle. Used on news articles and forum topics.
export function BookmarkButton({ bookmarked, onToggle, pending }: Props) {
  return (
    <button
      onClick={onToggle}
      disabled={!!pending}
      className={`px-3 py-1.5 rounded-full border text-sm transition-colors flex items-center gap-2 ${
        bookmarked
          ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          : "border-border hover:bg-accent/40"
      } disabled:opacity-50`}
      title={bookmarked ? "Remove from bookmarks" : "Save for later"}
    >
      <span className="text-lg">{bookmarked ? "🔖" : "🏷️"}</span>
      <span className="font-medium">{bookmarked ? "Saved" : "Save"}</span>
    </button>
  );
}

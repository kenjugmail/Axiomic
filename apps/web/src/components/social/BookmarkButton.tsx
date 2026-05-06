import { Bookmark, BookmarkPlus } from "lucide-react";
import { Button } from "../ui/Button";

interface Props {
  bookmarked: boolean;
  onToggle: () => void;
  pending?: boolean;
}

// "Save for later" toggle. Used on news articles and forum topics.
export function BookmarkButton({ bookmarked, onToggle, pending }: Props) {
  const Icon = bookmarked ? Bookmark : BookmarkPlus;
  return (
    <Button
      variant={bookmarked ? "secondary" : "outline"}
      size="sm"
      onClick={onToggle}
      disabled={!!pending}
      title={bookmarked ? "Remove from bookmarks" : "Save for later"}
      className="rounded-full"
    >
      <Icon
        className="w-4 h-4"
        strokeWidth={1.8}
        fill={bookmarked ? "currentColor" : "none"}
      />
      <span>{bookmarked ? "Saved" : "Save"}</span>
    </Button>
  );
}

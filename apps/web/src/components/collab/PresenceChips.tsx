// Sprint 40 — Presence chips for the lesson/paper/capstone editor.
//
// The server resolves usernames before broadcasting so this component
// is a pure renderer: filter myself out of the (userIds, usernames)
// pair and show the remaining names.

import { Users } from "lucide-react";
import { useAuthStore } from "../../stores/auth";

interface Props {
  userIds: string[];
  usernames: string[];
}

export function PresenceChips({ userIds, usernames }: Props) {
  const me = useAuthStore((s) => s.user);
  const others: string[] = [];
  for (let i = 0; i < userIds.length; i++) {
    if (userIds[i] === me?.id) continue;
    if (usernames[i] && usernames[i] !== "?") others.push(usernames[i]);
  }
  if (others.length === 0) return null;

  const shown = others.slice(0, 3);
  return (
    <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Users className="w-3.5 h-3.5" strokeWidth={2} />
      <span>
        {shown.map((u) => `@${u}`).join(", ")}
        {others.length > shown.length && ` +${others.length - shown.length}`}{" "}
        {others.length === 1 ? "is" : "are"} editing
      </span>
    </div>
  );
}

// Sprint 65b — per-page conversation history dropdown.
//
// Renders a list of recent sessions for the current page, with the
// first user message as a label. Click → switch to that session.
// "Start new" creates a fresh session.

import { useEffect, useRef, useState } from "react";
import { History, Plus, Trash2 } from "lucide-react";
import {
  previewLabel,
  type ConversationSession,
} from "../../lib/aiSessions";

interface AIConversationHistoryProps {
  sessions: ConversationSession[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

function formatRelative(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function AIConversationHistory({
  sessions,
  currentId,
  onSelect,
  onNew,
  onDelete,
}: AIConversationHistoryProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  // Hide entirely when there are no past sessions to switch to AND
  // no current session to start from. The "New" affordance lives in
  // the input toolbar's "Clear" button anyway, so the dropdown only
  // earns its place when the user has history to navigate.
  const hasHistory = sessions.some((s) => s.messages.length > 0);
  if (!hasHistory) return null;

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Conversation history"
        aria-label="Conversation history"
        aria-haspopup="menu"
        aria-expanded={open}
        className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
      >
        <History className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Past conversations"
          className="absolute right-0 z-[200] mt-1 w-72 rounded-md border border-border bg-popover shadow-elevated text-xs"
        >
          <button
            type="button"
            onClick={() => {
              onNew();
              setOpen(false);
            }}
            className="w-full text-left flex items-center gap-2 px-3 py-2 border-b border-border hover:bg-accent/50 font-medium"
            role="menuitem"
          >
            <Plus className="w-3 h-3" aria-hidden="true" />
            Start new conversation
          </button>
          <ul className="max-h-72 overflow-y-auto py-1">
            {sessions
              .filter((s) => s.messages.length > 0)
              .map((session) => {
                const active = session.id === currentId;
                return (
                  <li key={session.id} role="none">
                    <div
                      className={`flex items-stretch ${
                        active ? "bg-accent/40" : "hover:bg-accent/30"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(session.id);
                          setOpen(false);
                        }}
                        className="flex-1 text-left px-3 py-2 min-w-0"
                        role="menuitem"
                      >
                        <div className="truncate font-medium text-foreground">
                          {previewLabel(session)}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {session.messages.length} message
                          {session.messages.length === 1 ? "" : "s"} ·{" "}
                          {formatRelative(session.updatedAt)}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(session.id);
                        }}
                        title="Delete conversation"
                        aria-label="Delete conversation"
                        className="px-2 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                );
              })}
          </ul>
        </div>
      )}
    </div>
  );
}

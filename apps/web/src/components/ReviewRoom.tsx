// Phase 29B — collaborative review room.
//
// A live discussion thread for a reproduction (or capstone
// submission). Reuses the shared WebSocket via useLiveEvents:
// `room_message` appends in realtime, `room_presence` drives the
// "who's here" chips. Append-only, single-level threads.

import { useEffect, useRef, useState } from "react";
import { Send, Users } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useLiveEvents } from "../hooks/useLiveEvents";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { relativeTime } from "../lib/dates";
import { Skeleton } from "./ui";
import { toast } from "../stores/toast";

type RoomKind = "reproduction" | "capstone_submission";

interface Msg {
  id: string;
  authorId: string;
  authorUsername: string;
  bodyMd: string;
  parentId: string | null;
  createdAt: string;
}

export function ReviewRoom({
  kind,
  roomId,
}: {
  kind: RoomKind;
  roomId: string;
}) {
  const [messages, setMessages] = useState<Msg[] | null>(null);
  const [present, setPresent] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.reviewRooms
      .messages(kind, roomId)
      .then((r) => {
        if (!cancelled) setMessages(r.messages);
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, roomId]);

  useLiveEvents({
    roomChannels: [{ kind, roomId }],
    onEvent: (e) => {
      if (
        (e as { type?: string }).type === "room_message" &&
        (e as { roomId?: string }).roomId === roomId
      ) {
        const m = (e as { message: Msg }).message;
        setMessages((prev) => {
          if (!prev) return [m];
          if (prev.some((x) => x.id === m.id)) return prev;
          return [...prev, m];
        });
      } else if (
        (e as { type?: string }).type === "room_presence" &&
        (e as { roomId?: string }).roomId === roomId
      ) {
        setPresent((e as { usernames: string[] }).usernames ?? []);
      }
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  const send = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await api.reviewRooms.postMessage(kind, roomId, draft.trim());
      setDraft("");
      // The server fans the message back over the socket; if the
      // socket is slow, optimistically refetch.
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border">
        <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
          Live review room
        </h3>
        {present.length > 0 && (
          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
            <Users className="w-3 h-3" />
            {present.join(", ")}
          </span>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto px-4 py-3 space-y-3">
        {messages === null && <Skeleton className="h-16" />}
        {messages && messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No messages yet — start the discussion.
          </p>
        )}
        {messages?.map((m) => (
          <div key={m.id} data-testid="room-message">
            <div className="text-xs text-muted-foreground mb-0.5">
              <strong className="text-foreground">{m.authorUsername}</strong>{" "}
              · {relativeTime(m.createdAt)}
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <MarkdownRenderer content={m.bodyMd} />
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border p-3 flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Discuss the reproduction… (markdown)"
          className="flex-1 text-sm px-3 py-2 rounded-md border border-border bg-background font-mono resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
          }}
        />
        <button
          type="button"
          onClick={send}
          disabled={busy || !draft.trim()}
          className="text-xs px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
        >
          <Send className="w-3 h-3" />
          {busy ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}

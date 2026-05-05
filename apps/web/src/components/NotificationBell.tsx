import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Notification } from "../lib/api";

const POLL_INTERVAL_MS = 60_000;

export function notificationLink(n: Notification): string {
  if (!n.contextSlug) return "/notifications";
  switch (n.subjectType) {
    case "topic":
      return `/forum/t/${n.contextSlug}`;
    case "post":
      return `/forum/t/${n.contextSlug}#post-${n.subjectId}`;
    case "comment":
      return `/wiki/${n.contextSlug}#comment-${n.subjectId}`;
    case "mastery_node":
      return `/paths/${n.contextSlug}`;
    case "news_article":
      return `/news/${n.contextSlug}`;
    case "news_proposal":
      // contextSlug is the article slug; deep-link to the proposals
      // review page (visible to author) or the article (others).
      return `/news/${n.contextSlug}/proposals`;
    default:
      return "/notifications";
  }
}

function kindLabel(kind: Notification["kind"]): string {
  switch (kind) {
    case "mention":
      return "mentioned you";
    case "topic_reply":
      return "replied to your topic";
    case "post_reply":
      return "replied to your post";
    case "comment_reply":
      return "replied to your comment";
    case "mastery_level_up":
      return "you reached a new mastery level";
    case "news_edit_proposed":
      return "proposed an edit to your article";
    case "news_edit_approved":
      return "approved your proposed edit";
    case "news_edit_rejected":
      return "declined your proposed edit";
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.max(0, Math.floor((now - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function NotificationBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  // Poll unread count while document is visible.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      if (document.hidden) return;
      try {
        const r = await api.notifications.unreadCount();
        if (!cancelled) setCount(r.count);
      } catch {
        // network blip — try again next tick
      }
    };

    tick();
    timer = setInterval(tick, POLL_INTERVAL_MS);
    const onVisibility = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", tick);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", tick);
    };
  }, []);

  // Close dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Load most-recent items when opening.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    api.notifications
      .list({ limit: 10 })
      .then((r) => {
        if (!cancelled) setItems(r.notifications);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleClick = async (n: Notification) => {
    setOpen(false);
    navigate(notificationLink(n));
    if (!n.readAt) {
      try {
        await api.notifications.markRead({ ids: [n.id] });
        setCount((c) => Math.max(0, c - 1));
        setItems((arr) =>
          arr.map((i) => (i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i)),
        );
      } catch {
        // ignore
      }
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        title="Notifications"
        aria-label={`Notifications${count > 0 ? ` (${count} unread)` : ""}`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground rounded-full text-[10px] leading-none min-w-[18px] h-[18px] px-1 flex items-center justify-center font-medium">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-[480px] overflow-y-auto rounded-lg border border-border bg-card shadow-lg z-50">
          <div className="px-4 py-2 border-b border-border flex items-center justify-between">
            <span className="text-sm font-medium">Notifications</span>
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs text-primary hover:underline"
            >
              View all
            </Link>
          </div>
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              You're all caught up.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => handleClick(n)}
                    className={`w-full text-left px-4 py-3 hover:bg-accent/40 transition-colors ${
                      !n.readAt ? "bg-primary/5" : ""
                    }`}
                  >
                    <div className="text-sm">
                      {n.actor ? (
                        <>
                          <span className="font-medium">{n.actor.username}</span>{" "}
                          <span className="text-muted-foreground">{kindLabel(n.kind)}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground capitalize">{kindLabel(n.kind)}</span>
                      )}
                    </div>
                    {n.preview && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {n.preview}
                      </p>
                    )}
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {relativeTime(n.createdAt)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

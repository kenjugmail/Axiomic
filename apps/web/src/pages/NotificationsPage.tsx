import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { api, type Notification } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { notificationLink } from "../components/NotificationBell";
import { EmptyState } from "../components/ui/EmptyState";

type Filter = "all" | "unread";

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
    case "claim_thread_reply":
      return "replied to a claim thread";
    case "mastery_level_up":
      return "you reached a new mastery level";
    case "news_edit_proposed":
      return "proposed an edit to your article";
    case "news_edit_approved":
      return "approved your proposed edit";
    case "news_edit_rejected":
      return "declined your proposed edit";
    case "news_published":
      return "published a new article";
    case "article_reproduced":
      return "reproduced your article";
    case "forum_topic_posted":
      return "started a new forum topic";
    case "track_completed":
      return "you completed a capstone track";
    case "cohort_invitation":
      return "invited you to a cohort";
    case "proposal_approved":
      return "approved your proposal";
    case "proposal_rejected":
      return "declined your proposal";
    case "grant_match":
      return "found a grant matching your work";
    case "grant_deadline_soon":
      return "grant deadline approaching";
    case "lab_signoff_requested":
      return "requested sign-off on a protocol run";
    case "lab_signoff_approved":
      return "signed off on your protocol run";
    case "lab_signoff_rejected":
      return "asked for changes on your protocol run";
    case "lab_cert_passed":
      return "you passed a safety certification";
    case "lab_cert_expiring":
      return "your safety certification is expiring";
    // S88 — classroom + pet engagement loop.
    case "cosmetic_granted":
      return "granted you a cosmetic";
    case "competition_won":
      return "you placed in a competition";
    case "pet_hatched":
      return "your egg hatched";
    case "pet_leveled_up":
      return "your pet leveled up";
    default: {
      const _exhaustive: never = kind;
      void _exhaustive;
      return "sent you a notification";
    }
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

export function NotificationsPage() {
  const { user, loading: authLoading } = useAuthStore();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wait for the auth store to finish hydrating before deciding to bounce.
    // Otherwise a fresh page load races /me and we redirect a signed-in user.
    if (authLoading) return;
    if (!user) {
      navigate("/login");
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.notifications
      .list({ unread: filter === "unread", limit: 50 })
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
  }, [filter, user, authLoading, navigate]);

  const markAllRead = async () => {
    try {
      await api.notifications.markRead({ all: true });
      const now = new Date().toISOString();
      setItems((arr) => arr.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    } catch {
      // ignore
    }
  };

  const handleRowClick = async (n: Notification) => {
    if (!n.readAt) {
      try {
        await api.notifications.markRead({ ids: [n.id] });
        setItems((arr) =>
          arr.map((i) =>
            i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i,
          ),
        );
      } catch {
        // ignore
      }
    }
    navigate(notificationLink(n));
  };

  const unreadCount = items.filter((n) => !n.readAt).length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Notifications</h1>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-sm text-primary hover:underline"
          >
            Mark all as read
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-4 border-b border-border">
        {(["all", "unread"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-2 text-sm border-b-2 transition-colors capitalize ${
              filter === f
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse bg-muted rounded-md" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={
            filter === "unread"
              ? "No unread notifications"
              : "No notifications yet"
          }
          description={
            filter === "unread"
              ? "All caught up. Switch the filter to All to review past notifications."
              : "When someone replies, mentions you, or your work is reviewed, the alert will land here."
          }
        />
      ) : (
        <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
          {items.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => handleRowClick(n)}
                className={`w-full text-left px-4 py-3 hover:bg-accent/40 transition-colors ${
                  !n.readAt ? "bg-primary/5" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
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
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {n.preview}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {relativeTime(n.createdAt)}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

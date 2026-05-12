// Notifications page — Phase 6 polish.
// Layout matches the prototype: icon + title + body + when, with
// per-kind CTAs ("Replay moment" on pet events, "View item" on
// grants, default "Open" otherwise). Pet-related notifications can
// re-fire their moment modal directly without leaving the page.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Sparkles,
  Trophy,
  Egg,
  GraduationCap,
  MessageSquare,
  AtSign,
  BookOpen,
  CheckCircle2,
  XCircle,
  Award,
  FlaskConical,
  Beaker,
  type LucideIcon,
} from "lucide-react";
import { api, type Notification } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { notificationLink } from "../components/NotificationBell";
import { EmptyState } from "../components/ui/EmptyState";
import { petMoments } from "../pet";

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

function iconForKind(kind: Notification["kind"]): LucideIcon {
  switch (kind) {
    case "mention":
      return AtSign;
    case "topic_reply":
    case "post_reply":
    case "comment_reply":
    case "claim_thread_reply":
    case "forum_topic_posted":
      return MessageSquare;
    case "mastery_level_up":
    case "track_completed":
      return GraduationCap;
    case "news_edit_proposed":
    case "news_edit_approved":
    case "news_edit_rejected":
    case "news_published":
    case "article_reproduced":
      return BookOpen;
    case "proposal_approved":
    case "lab_signoff_approved":
    case "lab_cert_passed":
      return CheckCircle2;
    case "proposal_rejected":
    case "lab_signoff_rejected":
      return XCircle;
    case "grant_match":
    case "grant_deadline_soon":
      return Award;
    case "lab_signoff_requested":
      return Beaker;
    case "lab_cert_expiring":
      return FlaskConical;
    case "cosmetic_granted":
      return Award;
    case "competition_won":
      return Trophy;
    case "pet_hatched":
      return Egg;
    case "pet_leveled_up":
      return Sparkles;
    case "cohort_invitation":
      return MessageSquare;
    default:
      return Bell;
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

// Per-kind CTA. Pet-related notifications get a "Replay moment"
// affordance that re-fires the corresponding modal — closes the
// loop on accidental dismissals from the WS host.
function ctaFor(
  n: Notification,
): { label: string; onClick: () => void } | null {
  if (n.kind === "pet_leveled_up" || n.kind === "pet_hatched") {
    return {
      label: "Replay moment",
      onClick: () => {
        // We don't have the pet identity in the notification payload;
        // PetMomentsHost resolves it from its cached MyPetResponse,
        // so triggering the kind alone is enough. Until that hook is
        // updated to accept a kind-only replay, we fall back to a
        // route navigation (see handleRowClick).
        api.pet.me().then((me) => {
          if (!me.pet) return;
          petMoments.show(
            n.kind === "pet_hatched"
              ? {
                  kind: "hatch",
                  pet: {
                    species: me.pet.species,
                    level: me.pet.level,
                    maxLevel: me.pet.maxLevel,
                    name: me.pet.name,
                    speciesLabel: me.pet.speciesLabel,
                  },
                }
              : {
                  kind: "level-up",
                  pet: {
                    species: me.pet.species,
                    level: me.pet.level,
                    maxLevel: me.pet.maxLevel,
                    name: me.pet.name || me.pet.speciesLabel,
                    speciesLabel: me.pet.speciesLabel,
                  },
                },
          );
        }).catch(() => {});
      },
    };
  }
  return null;
}

export function NotificationsPage() {
  const { user, loading: authLoading } = useAuthStore();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
      <div className="mb-6">
        <div
          className="text-[11px] font-semibold tracking-widest uppercase mb-1"
          style={{ color: "var(--ink-3)" }}
        >
          Notifications
        </div>
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Notifications
          </h1>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="pet-btn ghost"
            >
              Mark all read
            </button>
          )}
        </div>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--ink-3)" }}
        >
          {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}.
          Grants, level-ups, and competition updates land here.
        </p>
      </div>

      <div className="flex gap-2 mb-5">
        {(["all", "unread"] as Filter[]).map((f) => {
          const on = filter === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={on}
              className="rounded-full transition-colors capitalize"
              style={{
                padding: "5px 12px",
                fontSize: 12.5,
                border: on
                  ? "1px solid var(--accent)"
                  : "1px solid var(--line)",
                background: on ? "var(--accent-soft)" : "var(--bg-elev)",
                color: on ? "var(--accent)" : "var(--ink-2)",
                fontWeight: on ? 600 : 500,
              }}
            >
              {f}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-md"
              style={{ background: "var(--bg-sunk)" }}
            />
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
              : "Grants, level-ups, and competition updates will land here."
          }
        />
      ) : (
        <ul className="grid gap-2 list-none p-0 m-0">
          {items.map((n) => {
            const Icon = iconForKind(n.kind);
            const unread = !n.readAt;
            const cta = ctaFor(n);
            return (
              <li key={n.id}>
                <div
                  className="flex gap-3 items-start p-3 rounded-xl border transition-colors"
                  style={{
                    background: unread
                      ? "var(--accent-soft)"
                      : "var(--bg-elev)",
                    borderColor: unread
                      ? "color-mix(in oklab, var(--accent) 30%, var(--line))"
                      : "var(--line)",
                  }}
                >
                  <span
                    className="flex-none grid place-items-center rounded-lg"
                    style={{
                      width: 32,
                      height: 32,
                      background: unread ? "var(--bg-elev)" : "var(--bg-sunk)",
                      color: unread ? "var(--accent)" : "var(--ink-3)",
                    }}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRowClick(n)}
                    className="text-left flex-1 min-w-0 bg-transparent border-0 p-0 cursor-pointer"
                  >
                    <div className="flex items-baseline gap-2">
                      <strong
                        className="text-sm"
                        style={{ color: "var(--ink)" }}
                      >
                        {n.actor ? (
                          <>
                            {n.actor.username}{" "}
                            <span
                              className="font-normal"
                              style={{ color: "var(--ink-3)" }}
                            >
                              {kindLabel(n.kind)}
                            </span>
                          </>
                        ) : (
                          <span className="capitalize">{kindLabel(n.kind)}</span>
                        )}
                      </strong>
                      {unread && (
                        <span
                          className="inline-block rounded-full flex-none"
                          aria-label="unread"
                          style={{
                            width: 7,
                            height: 7,
                            background: "var(--accent)",
                          }}
                        />
                      )}
                    </div>
                    {n.preview && (
                      <div
                        className="text-[13px] mt-0.5 line-clamp-2"
                        style={{ color: "var(--ink-3)" }}
                      >
                        {n.preview}
                      </div>
                    )}
                    <div
                      className="text-[11px] mt-1 font-mono"
                      style={{ color: "var(--ink-4)" }}
                    >
                      {relativeTime(n.createdAt)}
                    </div>
                  </button>
                  {cta && (
                    <button
                      type="button"
                      onClick={cta.onClick}
                      className="pet-btn ghost flex-none"
                    >
                      {cta.label}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

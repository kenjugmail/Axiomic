// S108 — Reusable empty-state panel for lists/feeds that legitimately
// have 0 items. Used by HomePage, ResearchFeedPage, ForumTopicPage,
// ClassPage, etc. so every page that can show "nothing here" shows
// the same shape instead of an unexplained blank space.

import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  cta?: { to: string; label: string } | { onClick: () => void; label: string };
  className?: string;
}

export function EmptyState({ icon, title, description, cta, className = "" }: EmptyStateProps) {
  return (
    <div
      className={`rounded-lg border border-dashed border-border bg-card/30 p-6 text-center ${className}`}
      role="status"
    >
      {icon && <div className="mx-auto mb-3 text-muted-foreground/60">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground max-w-prose mx-auto">{description}</p>
      )}
      {cta && (
        <div className="mt-4">
          {"to" in cta ? (
            <Link
              to={cta.to}
              className="inline-flex items-center text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
            >
              {cta.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={cta.onClick}
              className="inline-flex items-center text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
            >
              {cta.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

import { Link } from "react-router-dom";
import {
  GraduationCap,
  Newspaper,
  MessageSquare,
  BookOpen,
} from "lucide-react";
import type {
  LinkedNodeSummary,
  LinkedArticleSummary,
  LinkedWikiPageSummary,
  LinkedTopicLite,
} from "@axiomic/types";
import { PostTypeBadge } from "../PostTypeBadge";

// Sprint 16 — generic "related rail" used by wiki, mastery, news, and
// forum pages to surface cross-links into other surfaces. Each rail
// shares the same chrome (uppercase header + horizontal scroll on
// overflow) so the flywheel feels consistent across the site.

type Item =
  | ({ kind: "node" } & LinkedNodeSummary)
  | ({ kind: "article" } & LinkedArticleSummary)
  | ({ kind: "wiki" } & LinkedWikiPageSummary)
  | ({ kind: "topic" } & LinkedTopicLite);

interface Props {
  // Short uppercase label rendered above the rail, e.g. "Practice this"
  // or "Articles citing this".
  title: string;
  // Lucide icon component shown next to the title. Supplies a
  // consistent visual anchor per rail kind.
  icon?: "lesson" | "article" | "wiki" | "topic";
  items: Item[];
  // Optional: shown when the rail is empty + the page is the author's,
  // so they can take action. Pass null to hide entirely on empty.
  emptyHint?: string | null;
}

const ICON_MAP = {
  lesson: GraduationCap,
  article: Newspaper,
  wiki: BookOpen,
  topic: MessageSquare,
} as const;

export function RelatedRail({ title, icon, items, emptyHint }: Props) {
  if (items.length === 0) {
    if (!emptyHint) return null;
    return (
      <section className="mt-8 pt-4 border-t border-border">
        <Header title={title} icon={icon} />
        <p className="text-sm text-muted-foreground italic">{emptyHint}</p>
      </section>
    );
  }

  return (
    <section className="mt-8 pt-4 border-t border-border">
      <Header title={title} icon={icon} count={items.length} />
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
        {items.map((it) => (
          <RelatedCard key={cardKey(it)} item={it} />
        ))}
      </div>
    </section>
  );
}

function Header({
  title,
  icon,
  count,
}: {
  title: string;
  icon?: Props["icon"];
  count?: number;
}) {
  const Icon = icon ? ICON_MAP[icon] : null;
  return (
    <h2 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
      {Icon && <Icon className="w-3 h-3" strokeWidth={2} />}
      {title}
      {count !== undefined && (
        <span className="text-muted-foreground/70">· {count}</span>
      )}
    </h2>
  );
}

function cardKey(it: Item): string {
  switch (it.kind) {
    case "node":
      return `n:${it.nodeId}`;
    case "article":
      return `a:${it.id}`;
    case "wiki":
      return `w:${it.slug}`;
    case "topic":
      return `t:${it.id}`;
  }
}

function RelatedCard({ item }: { item: Item }) {
  const baseClasses =
    "flex-shrink-0 w-64 max-w-[80vw] snap-start p-3 rounded-md border border-border bg-card hover:bg-accent/30 transition-colors duration-fast";

  switch (item.kind) {
    case "node":
      return (
        <Link
          to={`/paths/${item.pathSlug}/lessons/${item.nodeSlug}`}
          className={baseClasses}
        >
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            <GraduationCap className="w-3 h-3" strokeWidth={2} />
            {item.pathTitle} · {item.level}
          </div>
          <div className="text-sm font-medium line-clamp-2">{item.title}</div>
          {item.hasLesson && (
            <div className="text-[10px] uppercase tracking-wider text-primary mt-1">
              Lesson available
            </div>
          )}
        </Link>
      );

    case "article":
      return (
        <Link to={`/news/${item.slug}`} className={baseClasses}>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            <Newspaper className="w-3 h-3" strokeWidth={2} />@
            {item.authorUsername}
          </div>
          <div className="text-sm font-medium line-clamp-2">
            <span className="mr-1">{item.coverEmoji}</span>
            {item.title}
          </div>
          {item.summary && (
            <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
              {item.summary}
            </div>
          )}
        </Link>
      );

    case "wiki":
      return (
        <Link to={`/wiki/${item.slug}`} className={baseClasses}>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            <BookOpen className="w-3 h-3" strokeWidth={2} />
            Concept
          </div>
          <div className="text-sm font-medium line-clamp-2">{item.title}</div>
        </Link>
      );

    case "topic":
      return (
        <Link to={`/forum/topics/${item.slug}`} className={baseClasses}>
          <div className="flex items-center gap-1.5 mb-1">
            <PostTypeBadge type={item.postType as any} />
          </div>
          <div className="text-sm font-medium line-clamp-2">{item.title}</div>
          <div className="text-[10px] text-muted-foreground mt-1">
            @{item.authorUsername}
            {item.postCount > 0 && ` · ${item.postCount} replies`}
          </div>
        </Link>
      );
  }
}
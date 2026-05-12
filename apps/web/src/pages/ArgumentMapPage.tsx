// Sprint 36 — Argument map.
//
// /forum/graph?slug=<topicSlug> renders a forum thread as a DAG.
// Root = topic; children = forum posts via parentId. Layout is a
// hand-rolled hierarchical tidy-tree (no D3 / dagre dep) — assigns
// each subtree a horizontal slot and a y based on depth. Click a node
// to jump to ForumTopicPage scrolled to that post.

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, MessageSquare, Network } from "lucide-react";
import type { ArgumentMapResponse, PostType } from "@axiomic/types";
import { api } from "../lib/api";
import { PostTypeBadge } from "../components/PostTypeBadge";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";

const NODE_W = 200;
const NODE_H = 72;
const H_GAP = 24;
const V_GAP = 36;

interface LaidOutNode {
  id: string;
  parentId: string | null;
  isRoot: boolean;
  label: string;
  authorUsername: string;
  body: string;
  score: number;
  replyCount: number;
  x: number;
  y: number;
  depth: number;
}

// Tidy-tree layout (Reingold-Tilford-ish). For each subtree we assign a
// width = sum of leaf children widths, then center the parent over its
// children. y is fixed by depth.
function layoutTree(
  rootId: string,
  childMap: Map<string, string[]>,
  meta: Map<string, Omit<LaidOutNode, "x" | "y" | "depth">>,
): { nodes: LaidOutNode[]; width: number; height: number } {
  const widths = new Map<string, number>(); // subtree pixel width
  const cols = new Map<string, number>(); // leaf-equivalent column count

  function measure(id: string): number {
    const kids = childMap.get(id) ?? [];
    if (kids.length === 0) {
      cols.set(id, 1);
      widths.set(id, NODE_W);
      return NODE_W;
    }
    let total = 0;
    let kidCols = 0;
    for (const k of kids) {
      total += measure(k);
      kidCols += cols.get(k) ?? 1;
    }
    total += (kids.length - 1) * H_GAP;
    cols.set(id, kidCols);
    const w = Math.max(NODE_W, total);
    widths.set(id, w);
    return w;
  }
  measure(rootId);

  const placed: LaidOutNode[] = [];
  let maxDepth = 0;

  function place(id: string, leftX: number, depth: number) {
    if (depth > maxDepth) maxDepth = depth;
    const m = meta.get(id);
    if (!m) return;
    const subtreeWidth = widths.get(id) ?? NODE_W;
    const cx = leftX + subtreeWidth / 2;
    const x = cx - NODE_W / 2;
    const y = depth * (NODE_H + V_GAP);
    placed.push({ ...m, x, y, depth });

    const kids = childMap.get(id) ?? [];
    let cursor = leftX;
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      const kw = widths.get(k) ?? NODE_W;
      place(k, cursor, depth + 1);
      cursor += kw + H_GAP;
    }
  }
  place(rootId, 0, 0);

  return {
    nodes: placed,
    width: widths.get(rootId) ?? NODE_W,
    height: (maxDepth + 1) * NODE_H + maxDepth * V_GAP,
  };
}

export function ArgumentMapPage() {
  const [searchParams] = useSearchParams();
  const slug = searchParams.get("slug") ?? "";
  const [data, setData] = useState<ArgumentMapResponse | null>(null);
  const [error, setError] = useState("");
  const [hoverId, setHoverId] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    setData(null);
    setError("");
    api.argumentMap
      .topic(slug)
      .then(setData)
      .catch((e: any) => setError(e?.message ?? "Failed to load thread"));
  }, [slug]);

  const layout = useMemo(() => {
    if (!data) return null;
    const childMap = new Map<string, string[]>();
    const meta = new Map<string, Omit<LaidOutNode, "x" | "y" | "depth">>();

    // Root = the topic itself; we synthesize a node for it.
    const rootId = `topic:${data.topic.id}`;
    meta.set(rootId, {
      id: rootId,
      parentId: null,
      isRoot: true,
      label: data.topic.title,
      authorUsername: data.topic.authorUsername,
      body: data.topic.bodySnippet,
      score: 0,
      replyCount: data.posts.filter((p) => !p.parentId).length,
    });

    for (const p of data.posts) {
      meta.set(p.id, {
        id: p.id,
        parentId: p.parentId ?? rootId,
        isRoot: false,
        label: `@${p.authorUsername}`,
        authorUsername: p.authorUsername,
        body: p.bodySnippet,
        score: p.score,
        replyCount: p.replyCount,
      });
    }

    // Build child map; orphan replies (parent missing in fetched set)
    // are reparented onto the root so the visualization stays connected.
    const knownIds = new Set([rootId, ...data.posts.map((p) => p.id)]);
    for (const p of data.posts) {
      const parent =
        !p.parentId || !knownIds.has(p.parentId) ? rootId : p.parentId;
      const list = childMap.get(parent) ?? [];
      list.push(p.id);
      childMap.set(parent, list);
    }
    return layoutTree(rootId, childMap, meta);
  }, [data]);

  if (!slug) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-sm text-muted-foreground">
          Pick a forum topic to view its argument map.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="text-sm text-muted-foreground mb-2">
        <Link
          to={`/forum/t/${slug}`}
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <ArrowLeft className="w-3 h-3" strokeWidth={2} />
          Back to topic
        </Link>
      </div>
      <h1 className="font-display text-2xl font-semibold tracking-tight inline-flex items-center gap-2">
        <Network className="w-5 h-5 text-primary" strokeWidth={2} />
        Argument map
      </h1>
      {data && (
        <p className="text-sm text-muted-foreground mt-1">
          <PostTypeBadge type={data.topic.postType as PostType} /> {data.topic.title} ·{" "}
          <span>
            @{data.topic.authorUsername} · {data.posts.length} repl
            {data.posts.length === 1 ? "y" : "ies"}
          </span>
        </p>
      )}

      {error && (
        <div className="mt-4">
          <ErrorState error={error} />
        </div>
      )}
      {!data && !error && (
        <div className="mt-4">
          <EmptyState title="Loading…" description="Fetching the argument map." />
        </div>
      )}

      {data && layout && (
        <div className="mt-6 rounded-lg border border-border bg-card p-3 overflow-auto">
          <svg
            width={Math.max(layout.width + 24, 320)}
            height={layout.height + 24}
            className="block"
          >
            {/* Edges */}
            {layout.nodes.map((n) => {
              if (!n.parentId) return null;
              const parent = layout.nodes.find((p) => p.id === n.parentId);
              if (!parent) return null;
              const x1 = parent.x + NODE_W / 2;
              const y1 = parent.y + NODE_H;
              const x2 = n.x + NODE_W / 2;
              const y2 = n.y;
              const midY = (y1 + y2) / 2;
              const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
              return (
                <path
                  key={`${parent.id}->${n.id}`}
                  d={path}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.4}
                  className="text-border"
                />
              );
            })}

            {/* Nodes */}
            {layout.nodes.map((n) => {
              const isHover = hoverId === n.id;
              const isRoot = n.isRoot;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x}, ${n.y})`}
                  onMouseEnter={() => setHoverId(n.id)}
                  onMouseLeave={() => setHoverId(null)}
                  className="cursor-pointer"
                >
                  <a
                    href={
                      isRoot
                        ? `/forum/t/${data.topic.slug}`
                        : `/forum/t/${data.topic.slug}#post-${n.id}`
                    }
                  >
                    <rect
                      width={NODE_W}
                      height={NODE_H}
                      rx={10}
                      ry={10}
                      className={
                        isRoot
                          ? "fill-primary/10 stroke-primary"
                          : isHover
                            ? "fill-accent stroke-primary"
                            : "fill-card stroke-border"
                      }
                      strokeWidth={isRoot ? 1.5 : 1}
                    />
                    <text
                      x={10}
                      y={18}
                      className={`text-[10px] uppercase tracking-wider ${
                        isRoot
                          ? "fill-primary"
                          : "fill-muted-foreground"
                      }`}
                    >
                      {isRoot ? `claim · @${n.authorUsername}` : n.label}
                    </text>
                    <text
                      x={10}
                      y={36}
                      className="fill-foreground text-[12px] font-medium"
                    >
                      {n.body.length > 36 ? n.body.slice(0, 36) + "…" : n.body}
                    </text>
                    <text
                      x={10}
                      y={56}
                      className="fill-muted-foreground text-[10px]"
                    >
                      {n.replyCount > 0 && (
                        <>↳ {n.replyCount} repl{n.replyCount === 1 ? "y" : "ies"} · </>
                      )}
                      {n.score !== 0 && <>{n.score >= 0 ? "+" : ""}{n.score} · </>}
                      {new Date(n.id.startsWith("topic:") ? data.topic.createdAt : data.posts.find((p) => p.id === n.id)?.createdAt ?? "").toLocaleDateString()}
                    </text>
                  </a>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {data && data.posts.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground inline-flex items-center gap-2">
          <MessageSquare className="w-4 h-4" strokeWidth={2} />
          No replies yet. The graph shows only the root claim.
        </p>
      )}
    </div>
  );
}


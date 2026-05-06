import { useState, useEffect } from "react";
import type { SortableQuestion as Q } from "@axiomic/types";

interface Props {
  question: Q;
  value: string | undefined;
  onChange: (v: string) => void;
  review?: { correct: boolean };
}

// Drag-to-reorder list. Answer is a JSON array of item ids in the
// user's chosen order. Initial order is shuffled by id-hash so it's
// deterministic and not the answer key.
function shuffle<T>(arr: T[], seed: string): T[] {
  // Cheap deterministic shuffle: hash seed for each item, sort by hash.
  const hashed = arr.map((item, i) => {
    const id = (item as any)?.id ?? String(i);
    let h = 5381;
    const s = seed + ":" + id;
    for (let j = 0; j < s.length; j++) h = ((h << 5) + h + s.charCodeAt(j)) | 0;
    return { item, h };
  });
  hashed.sort((a, b) => a.h - b.h);
  return hashed.map((x) => x.item);
}

export function SortableQuestion({ question, value, onChange, review }: Props) {
  const [order, setOrder] = useState<string[]>(() => {
    if (value) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed) && parsed.length === question.items.length) {
          return parsed;
        }
      } catch {
        // fall through
      }
    }
    return shuffle(question.items, question.id).map((it) => it.id);
  });

  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Push the order back up whenever it changes.
  useEffect(() => {
    onChange(JSON.stringify(order));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  const labelById = new Map(question.items.map((it) => [it.id, it.label]));
  const correctOrder = question.items.map((it) => it.id);

  const handleDragStart = (id: string) => setDraggingId(id);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (targetId: string) => {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null);
      return;
    }
    const next = order.slice();
    const from = next.indexOf(draggingId);
    const to = next.indexOf(targetId);
    if (from === -1 || to === -1) return;
    next.splice(from, 1);
    next.splice(to, 0, draggingId);
    setOrder(next);
    setDraggingId(null);
  };

  return (
    <div className="space-y-2">
      <ol className="space-y-1.5">
        {order.map((id, i) => {
          const correctIdx = correctOrder.indexOf(id);
          const isInPosition = i === correctIdx;
          const showFeedback = !!review;
          return (
            <li key={id}>
              <div
                draggable={!review}
                onDragStart={() => handleDragStart(id)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(id)}
                className={`flex items-center gap-3 px-3 py-2 rounded-md border text-sm bg-card transition-colors ${
                  showFeedback
                    ? isInPosition
                      ? "border-emerald-500/50 bg-emerald-500/5"
                      : "border-rose-500/50 bg-rose-500/5"
                    : "border-border hover:bg-accent/40 cursor-grab active:cursor-grabbing"
                }`}
              >
                <span className="text-xs text-muted-foreground tabular-nums w-5">
                  {i + 1}.
                </span>
                <span className="flex-1">{labelById.get(id) ?? id}</span>
                {!review && (
                  <span className="text-xs text-muted-foreground">⋮⋮</span>
                )}
                {showFeedback && !isInPosition && (
                  <span className="text-[10px] text-rose-600 dark:text-rose-400">
                    should be #{correctIdx + 1}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {!review && (
        <p className="text-xs text-muted-foreground">
          Drag to reorder. Top of the list is position 1.
        </p>
      )}
    </div>
  );
}

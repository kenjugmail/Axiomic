import { useEffect, useMemo, useState } from "react";
import type { DragClassifyQuestion as Q } from "@axiomic/types";

// Answer encoding: JSON-stringified `{ [itemId]: binId | "" }`. Empty
// string means "still in the tray".

const TRAY_ID = "__tray__";

function parseAnswer(value: string | undefined, items: Q["items"]): Record<string, string> {
  if (!value) {
    return Object.fromEntries(items.map((i) => [i.id, ""]));
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

interface Props {
  question: Q;
  value: string | undefined;
  onChange: (v: string) => void;
  review?: { correct: boolean };
}

export function DragClassifyQuestion({ question, value, onChange, review }: Props) {
  const [placement, setPlacement] = useState<Record<string, string>>(() =>
    parseAnswer(value, question.items),
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverBin, setHoverBin] = useState<string | null>(null);

  // Re-sync from outer `value` when it changes externally (e.g. parent
  // resets state).
  useEffect(() => {
    setPlacement(parseAnswer(value, question.items));
  }, [value, question.items]);

  const itemsById = useMemo(
    () => Object.fromEntries(question.items.map((i) => [i.id, i])),
    [question.items],
  );

  const place = (itemId: string, binId: string) => {
    if (review) return;
    const next = { ...placement, [itemId]: binId === TRAY_ID ? "" : binId };
    setPlacement(next);
    onChange(JSON.stringify(next));
  };

  const tray = question.items.filter((i) => !placement[i.id]);
  const itemsInBin = (binId: string) =>
    question.items.filter((i) => placement[i.id] === binId);

  const isCorrectFor = (itemId: string) =>
    placement[itemId] === itemsById[itemId].bin;

  return (
    <div className="space-y-3">
      {/* Tray */}
      <div
        className={`rounded-md border-2 border-dashed p-3 min-h-[60px] flex flex-wrap gap-2 ${
          hoverBin === TRAY_ID ? "border-primary bg-primary/5" : "border-input"
        }`}
        onDragOver={(e) => {
          if (review) return;
          e.preventDefault();
          setHoverBin(TRAY_ID);
        }}
        onDragLeave={() => setHoverBin((b) => (b === TRAY_ID ? null : b))}
        onDrop={(e) => {
          if (review || !draggingId) return;
          e.preventDefault();
          place(draggingId, TRAY_ID);
          setHoverBin(null);
          setDraggingId(null);
        }}
      >
        {tray.length === 0 ? (
          <span className="text-xs text-muted-foreground self-center">
            (all placed)
          </span>
        ) : (
          tray.map((item) => (
            <DraggableItem
              key={item.id}
              label={item.label}
              draggable={!review}
              onDragStart={() => setDraggingId(item.id)}
              onDragEnd={() => setDraggingId(null)}
            />
          ))
        )}
      </div>

      {/* Bins */}
      <div className="grid grid-cols-2 gap-2">
        {question.bins.map((bin) => (
          <div
            key={bin.id}
            className={`rounded-md border-2 p-3 min-h-[100px] transition-colors ${
              hoverBin === bin.id ? "border-primary bg-primary/5" : "border-input"
            }`}
            onDragOver={(e) => {
              if (review) return;
              e.preventDefault();
              setHoverBin(bin.id);
            }}
            onDragLeave={() => setHoverBin((b) => (b === bin.id ? null : b))}
            onDrop={(e) => {
              if (review || !draggingId) return;
              e.preventDefault();
              place(draggingId, bin.id);
              setHoverBin(null);
              setDraggingId(null);
            }}
          >
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
              {bin.label}
            </div>
            <div className="flex flex-wrap gap-2">
              {itemsInBin(bin.id).map((item) => {
                const correct = review ? isCorrectFor(item.id) : null;
                return (
                  <DraggableItem
                    key={item.id}
                    label={item.label}
                    draggable={!review}
                    onDragStart={() => setDraggingId(item.id)}
                    onDragEnd={() => setDraggingId(null)}
                    state={correct === null ? "neutral" : correct ? "correct" : "wrong"}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DraggableItem({
  label,
  draggable,
  onDragStart,
  onDragEnd,
  state = "neutral",
}: {
  label: string;
  draggable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  state?: "neutral" | "correct" | "wrong";
}) {
  const tone =
    state === "correct"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
      : state === "wrong"
        ? "border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-300"
        : "border-input bg-background";
  return (
    <span
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`inline-block px-3 py-1 text-sm font-mono rounded-md border ${tone} ${
        draggable ? "cursor-grab active:cursor-grabbing select-none" : ""
      }`}
    >
      {label}
    </span>
  );
}

import { useEffect, useMemo, useState } from "react";
import type { PuzzleDragBuildQuestion as Q } from "@axiomic/types";

// Answer encoding: JSON-stringified `{ [slotId]: componentId | "" }`.
// Empty string means the slot is empty (component is back in the tray).

const TRAY_ID = "__tray__";

function parseAnswer(value: string | undefined, slots: Q["slots"]): Record<string, string> {
  if (!value) {
    return Object.fromEntries(slots.map((s) => [s.id, ""]));
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

export function PuzzleDragBuildQuestion({ question, value, onChange, review }: Props) {
  const [placement, setPlacement] = useState<Record<string, string>>(() =>
    parseAnswer(value, question.slots),
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverSlot, setHoverSlot] = useState<string | null>(null);

  useEffect(() => {
    setPlacement(parseAnswer(value, question.slots));
  }, [value, question.slots]);

  const componentsById = useMemo(
    () => Object.fromEntries(question.components.map((c) => [c.id, c])),
    [question.components],
  );

  // Components currently in the tray = those not placed in any slot.
  const placedComponentIds = new Set(Object.values(placement).filter(Boolean));
  const tray = question.components.filter((c) => !placedComponentIds.has(c.id));

  const place = (componentId: string, target: string) => {
    if (review) return;
    const next: Record<string, string> = { ...placement };
    // Remove the component from any slot it currently occupies.
    for (const sid of Object.keys(next)) {
      if (next[sid] === componentId) next[sid] = "";
    }
    if (target !== TRAY_ID) {
      // If the destination slot already has a component, swap it back to
      // the tray (i.e., clear it before placing).
      next[target] = componentId;
    }
    setPlacement(next);
    onChange(JSON.stringify(next));
  };

  const slotIsCorrect = (slotId: string) => {
    const cId = placement[slotId];
    if (!cId) return false;
    const slot = question.slots.find((s) => s.id === slotId);
    const comp = componentsById[cId];
    return !!slot && !!comp && comp.type === slot.accepts;
  };

  return (
    <div className="space-y-4">
      {/* Slots — rendered in order */}
      <div className="space-y-2">
        {question.slots.map((slot, idx) => {
          const compId = placement[slot.id];
          const comp = compId ? componentsById[compId] : null;
          const correct = review ? slotIsCorrect(slot.id) : null;
          const tone =
            correct === null
              ? hoverSlot === slot.id
                ? "border-primary bg-primary/5"
                : "border-input"
              : correct
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-rose-500/40 bg-rose-500/10";
          return (
            <div
              key={slot.id}
              onDragOver={(e) => {
                if (review) return;
                e.preventDefault();
                setHoverSlot(slot.id);
              }}
              onDragLeave={() =>
                setHoverSlot((s) => (s === slot.id ? null : s))
              }
              onDrop={(e) => {
                if (review || !draggingId) return;
                e.preventDefault();
                place(draggingId, slot.id);
                setHoverSlot(null);
                setDraggingId(null);
              }}
              className={`flex items-center gap-3 px-3 py-2 rounded-md border-2 transition-colors ${tone}`}
            >
              <span className="text-xs font-mono text-muted-foreground w-6">
                {idx + 1}.
              </span>
              <span className="text-xs uppercase tracking-wider text-muted-foreground w-32">
                {slot.label}
              </span>
              <div className="flex-1 min-h-[28px] flex items-center">
                {comp ? (
                  <DraggableCard
                    label={comp.label}
                    draggable={!review}
                    onDragStart={() => setDraggingId(comp.id)}
                    onDragEnd={() => setDraggingId(null)}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground italic">
                    drop a component here
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tray */}
      <div
        onDragOver={(e) => {
          if (review) return;
          e.preventDefault();
          setHoverSlot(TRAY_ID);
        }}
        onDragLeave={() =>
          setHoverSlot((s) => (s === TRAY_ID ? null : s))
        }
        onDrop={(e) => {
          if (review || !draggingId) return;
          e.preventDefault();
          place(draggingId, TRAY_ID);
          setHoverSlot(null);
          setDraggingId(null);
        }}
        className={`rounded-md border-2 border-dashed p-3 min-h-[60px] flex flex-wrap gap-2 transition-colors ${
          hoverSlot === TRAY_ID ? "border-primary bg-primary/5" : "border-input"
        }`}
      >
        <div className="w-full text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
          Tray
        </div>
        {tray.length === 0 ? (
          <span className="text-xs text-muted-foreground self-center">
            (all placed)
          </span>
        ) : (
          tray.map((c) => (
            <DraggableCard
              key={c.id}
              label={c.label}
              draggable={!review}
              onDragStart={() => setDraggingId(c.id)}
              onDragEnd={() => setDraggingId(null)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function DraggableCard({
  label,
  draggable,
  onDragStart,
  onDragEnd,
}: {
  label: string;
  draggable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <span
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`inline-block px-3 py-1 text-sm font-medium rounded-md border border-border bg-background shadow-sm ${
        draggable ? "cursor-grab active:cursor-grabbing select-none" : ""
      }`}
    >
      {label}
    </span>
  );
}

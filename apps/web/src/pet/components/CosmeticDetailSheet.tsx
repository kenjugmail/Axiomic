// Phase 3 (prototype migration) — CosmeticDetailSheet.
// Right-aligned side drawer showing one cosmetic's art, metadata, and
// equip/unequip controls. Port of extras.jsx:377-439.
//
// We build the drawer inline (translate-x animation, scrim onClick to
// close) rather than reusing the centered Modal because the
// right-aligned slide is a distinctive part of the prototype's UX.

import { useEffect, useRef } from "react";
import { useEscapeStack } from "../../hooks/useEscapeStack";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { X } from "lucide-react";
import type { CosmeticSlot, PetInventoryItem } from "@axiomic/types";
import { PetAvatar, type PetAvatarCosmetic } from "./PetAvatar";
import { CosmeticGlyphSVG } from "./CosmeticGlyphSVG";
import { RarityBadge } from "./RarityBadge";
import { ObtainabilityCallout } from "./ObtainabilityCallout";

const SLOT_LABEL: Record<CosmeticSlot, string> = {
  head: "Head",
  eyes: "Eyes",
  accessory: "Accessory",
};

interface Props {
  open: boolean;
  onClose: () => void;
  item: PetInventoryItem | null;
  // Pet identity for the "on pet" preview in the meta table.
  petSpecies: string;
  petLevel: number;
  // Currently-equipped cosmetics — used to compute the "with this item
  // equipped" preview rather than showing a bare pet.
  equipped: {
    head?: PetAvatarCosmetic | null;
    eyes?: PetAvatarCosmetic | null;
    acc?: PetAvatarCosmetic | null;
  };
  onToggleEquip: (item: PetInventoryItem) => void;
}

export function CosmeticDetailSheet({
  open,
  onClose,
  item,
  petSpecies,
  petLevel,
  equipped,
  onToggleEquip,
}: Props): JSX.Element | null {
  // Phase 12C — auto-focus the primary action when the sheet
  // opens, and trap Tab navigation inside the sheet so keyboard
  // users don't fall through to the page underneath.
  const sheetRef = useRef<HTMLDivElement>(null);
  const equipBtnRef = useRef<HTMLButtonElement>(null);
  // Phase 13D — suppress inline scrim + sheet-in animations under
  // prefers-reduced-motion.
  const reduceMotion = useReducedMotion();

  // Phase 13C — Escape handled by the shared stack so only the
  // top-most open overlay closes per key press.
  useEscapeStack(open, onClose);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const root = sheetRef.current;
      if (!root) return;
      const focusable = root.querySelectorAll<HTMLElement>(
        'button, [href], input, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    // Defer initial focus until after the sheet has rendered.
    const focusTimer = window.setTimeout(() => {
      equipBtnRef.current?.focus();
    }, 50);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(focusTimer);
    };
  }, [open, onClose]);

  if (!open || !item) return null;

  const slotKey = item.slot === "accessory" ? "acc" : item.slot;
  const previewEquipped = {
    ...equipped,
    [slotKey]: { slug: item.slug, rarity: item.rarity, failSmall: item.failSmall },
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`${item.name} details`}
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0"
        style={{
          background: "rgba(0,0,0,.42)",
          animation: reduceMotion ? "none" : "shade .2s ease-out",
        }}
        onClick={onClose}
      />
      <aside
        ref={sheetRef}
        className="relative h-full flex flex-col"
        style={{
          width: "min(440px, 100%)",
          background: "var(--bg)",
          borderLeft: "1px solid var(--line)",
          animation: reduceMotion ? "none" : "sheet-in .28s cubic-bezier(.2,.9,.3,1)",
          boxShadow: "-16px 0 40px rgba(0,0,0,.18)",
        }}
      >
        <header
          className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <div
            className="text-xs uppercase tracking-widest font-semibold"
            style={{ color: "var(--ink-3)" }}
          >
            {SLOT_LABEL[item.slot]}
          </div>
          <button
            type="button"
            className="pet-btn ghost"
            onClick={onClose}
            aria-label="Close"
            style={{ padding: 6 }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className={`detail-art ${item.rarity}`}>
            <CosmeticGlyphSVG slug={item.slug} rarity={item.rarity} size={120} />
          </div>
          <h2
            className="text-2xl mt-4"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {item.name}
          </h2>
          <div className="flex gap-2 mt-2 flex-wrap">
            <RarityBadge rarity={item.rarity} />
            <ObtainabilityCallout
              obtain={item.grantedNote ? "grant" : "xp"}
            />
          </div>
          {item.description && (
            <p
              className="mt-4 text-sm italic leading-relaxed"
              style={{ color: "var(--ink-2)" }}
            >
              “{item.description}”
            </p>
          )}
          <dl
            className="mt-5 grid gap-0"
            style={{ borderTop: "1px solid var(--line)" }}
          >
            <MetaRow label="Source">
              {item.grantedNote
                ? "Granted by an instructor"
                : "XP Shop"}
            </MetaRow>
            <MetaRow label="Slot">{SLOT_LABEL[item.slot]}</MetaRow>
            {item.grantedNote && (
              <MetaRow label="Note">
                <span style={{ color: "var(--ink-2)" }}>
                  “{item.grantedNote}”
                </span>
              </MetaRow>
            )}
            <MetaRow label="On pet">
              <div className="flex items-center gap-3">
                <PetAvatar
                  species={petSpecies}
                  level={petLevel}
                  equipped={previewEquipped}
                  size={80}
                  showCosmetics
                  ariaLabel={`Preview with ${item.name} equipped`}
                />
              </div>
            </MetaRow>
          </dl>
        </div>
        <footer
          className="px-5 py-3 flex justify-end gap-2"
          style={{ borderTop: "1px solid var(--line)", background: "var(--bg-sunk)" }}
        >
          <button type="button" className="pet-btn ghost" onClick={onClose}>
            Close
          </button>
          <button
            ref={equipBtnRef}
            type="button"
            className="pet-btn primary"
            onClick={() => {
              onToggleEquip(item);
              onClose();
            }}
          >
            {item.equipped ? "Unequip" : "Equip"}
          </button>
        </footer>
        <style>{`
          @keyframes sheet-in {
            from { transform: translateX(100%); }
            to   { transform: translateX(0); }
          }
          @keyframes shade {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
        `}</style>
      </aside>
    </div>
  );
}

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div
      className="grid items-center gap-3 py-2.5"
      style={{
        gridTemplateColumns: "90px 1fr",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <dt
        className="text-[12.5px]"
        style={{ color: "var(--ink-3)", margin: 0 }}
      >
        {label}
      </dt>
      <dd className="text-sm" style={{ color: "var(--ink)", margin: 0 }}>
        {children}
      </dd>
    </div>
  );
}

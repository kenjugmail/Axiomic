// Sprint 17 — Inline concept link.
//
// Wraps a `[[slug]]` or `[[slug|display]]` reference in a clickable
// link to /wiki/{slug} with a hover-triggered popover that reveals the
// concept card. The popover positions itself above or below the
// trigger depending on viewport space, so cards near the page bottom
// don't get clipped.

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ConceptCard } from "./ConceptCard";

interface Props {
  slug: string;
  // Optional pipe-delimited display text. Defaults to the slug.
  display?: string;
}

const HOVER_OPEN_DELAY = 250;
const HOVER_CLOSE_DELAY = 200;

export function ConceptLink({ slug, display }: Props) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"above" | "below">("below");
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleOpen = () => {
    cancelClose();
    if (open || openTimer.current) return;
    openTimer.current = window.setTimeout(() => {
      const el = triggerRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        // Card is roughly 200px tall; flip when there's not enough room.
        setPlacement(spaceBelow < 240 && rect.top > 240 ? "above" : "below");
      }
      setOpen(true);
      openTimer.current = null;
    }, HOVER_OPEN_DELAY);
  };

  const scheduleClose = () => {
    if (openTimer.current) {
      window.clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (!open) return;
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      closeTimer.current = null;
    }, HOVER_CLOSE_DELAY);
  };

  useEffect(() => {
    return () => {
      if (openTimer.current) window.clearTimeout(openTimer.current);
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, []);

  return (
    <span
      ref={triggerRef}
      className="relative inline-block"
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
      onFocus={scheduleOpen}
      onBlur={scheduleClose}
    >
      <Link
        to={`/wiki/${slug}`}
        className="text-primary underline decoration-dotted underline-offset-2 hover:decoration-solid"
      >
        {display ?? slug}
      </Link>
      {open && (
        <span
          className={`absolute z-30 left-0 ${
            placement === "above" ? "bottom-full mb-1" : "top-full mt-1"
          }`}
          // Keep the popover open while the user moves their cursor
          // into the card itself.
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <ConceptCard slug={slug} />
        </span>
      )}
    </span>
  );
}

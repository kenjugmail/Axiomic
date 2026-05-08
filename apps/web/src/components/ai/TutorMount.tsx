// Sprint 63h — drop-in wrapper that bundles the AI tutor sidebar +
// floating toggle button + selection-to-chat popover for any content
// surface. Mounting is one line per page:
//
//   <TutorMount pageSlug={slug} pageTitle={title} tier="lesson" articleRef={ref} />
//
// The parent attaches the supplied ref to its article element so the
// SelectionPopover knows where text selection is valid. The toggle
// button floats at the bottom-right of the viewport and follows the
// platform's existing AISidebar chrome.

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { AISidebar } from "../AISidebar";
import { SelectionPopover } from "../SelectionPopover";
import {
  ASK_TUTOR_EVENT,
  askTutorAction,
  type AskTutorEventDetail,
} from "./askTutorAction";
import { useAuthStore } from "../../stores/auth";

interface TutorMountProps {
  pageSlug: string;
  pageTitle: string;
  // Tier label. Use "intro" / "undergrad" / "grad" for wiki; "lesson"
  // / "research" / "capstone" / "forum" / "news" for other surfaces.
  // The string is passed straight into the system prompt.
  tier: string;
  // Element the SelectionPopover watches. The page attaches this ref
  // to its article body. When omitted, selection-to-chat is disabled.
  articleRef?: React.RefObject<HTMLElement | null>;
  // Hide the floating toggle button (e.g., the page renders its own).
  hideButton?: boolean;
}

const SIDEBAR_OPEN_KEY = "axiomic.ai.sidebar.open";

export function TutorMount({
  pageSlug,
  pageTitle,
  tier,
  articleRef,
  hideButton,
}: TutorMountProps) {
  const user = useAuthStore((s) => s.user);
  // Sprint 63h — persist sidebar open state across navigation.
  const [aiOpen, setAiOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(SIDEBAR_OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [seedQuote, setSeedQuote] = useState<string | null>(null);
  const localRef = useRef<HTMLElement | null>(null);
  const ref = articleRef ?? localRef;

  useEffect(() => {
    function handle(event: Event) {
      const detail = (event as CustomEvent<AskTutorEventDetail>).detail;
      if (!detail || !detail.quote) return;
      setSeedQuote(detail.quote);
      setAiOpen(true);
    }
    window.addEventListener(ASK_TUTOR_EVENT, handle);
    return () => window.removeEventListener(ASK_TUTOR_EVENT, handle);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(SIDEBAR_OPEN_KEY, aiOpen ? "1" : "0");
    } catch {
      // ignore
    }
  }, [aiOpen]);

  return (
    <>
      {!hideButton && !aiOpen && (
        <button
          onClick={() => setAiOpen(true)}
          aria-label="Open AI tutor"
          className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-3 rounded-full bg-foreground text-background shadow-floating hover:bg-foreground/90 transition-transform hover:scale-105 min-h-11"
        >
          <Sparkles className="w-4 h-4" strokeWidth={2} />
          <span className="text-sm font-medium">Ask tutor</span>
        </button>
      )}

      {user && (
        <SelectionPopover
          rootRef={ref}
          actions={[askTutorAction({ sourcePageSlug: pageSlug })]}
        />
      )}

      <AISidebar
        pageSlug={pageSlug}
        pageTitle={pageTitle}
        tier={tier}
        isOpen={aiOpen}
        onClose={() => setAiOpen(false)}
        seedQuote={seedQuote}
        onSeedConsumed={() => setSeedQuote(null)}
      />
    </>
  );
}

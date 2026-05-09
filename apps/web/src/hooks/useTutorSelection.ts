// Sprint 63g/63h — shared boilerplate for "selection-to-chat" pages.
//
// Returns the bits of state every content page needs to wire up the
// SelectionPopover + AISidebar combo: the article ref, the open-state
// toggle, the seedQuote pipe, and an effect that listens for the
// global ASK_TUTOR_EVENT.

import { useEffect, useRef, useState } from "react";
import {
  ASK_TUTOR_EVENT,
  type AskTutorEventDetail,
} from "../components/ai/askTutorAction";

export function useTutorSelection<T extends HTMLElement = HTMLElement>() {
  const articleRef = useRef<T | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [seedQuote, setSeedQuote] = useState<string | null>(null);

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

  return {
    articleRef,
    aiOpen,
    setAiOpen,
    seedQuote,
    setSeedQuote,
    onSeedConsumed: () => setSeedQuote(null),
  };
}

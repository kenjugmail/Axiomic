// Sprint 63g — helpers for "Ask tutor about this" selection-to-chat.
//
// The popover lives anywhere on the page; the AISidebar lives somewhere
// else (often a different React tree branch). Communicating via a
// custom window event keeps the two decoupled — neither needs to know
// where the other is mounted.

import { Sparkles } from "lucide-react";
import { createElement } from "react";
import type { TextQuote } from "../../lib/textQuote";
import type { SelectionAction } from "../SelectionPopover";

export interface AskTutorEventDetail {
  quote: string;
  prefix?: string;
  suffix?: string;
  sourcePageSlug?: string;
}

export const ASK_TUTOR_EVENT = "axiomic:tutor:ask-about" as const;

export function dispatchAskTutor(detail: AskTutorEventDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AskTutorEventDetail>(ASK_TUTOR_EVENT, { detail }),
  );
}

interface AskTutorActionOptions {
  sourcePageSlug?: string;
  label?: string;
}

// Convenience builder: returns a SelectionAction wired to the global
// ASK_TUTOR_EVENT. AISidebar listens for the event + opens itself with
// the quote pre-filled in the input.
export function askTutorAction(
  options: AskTutorActionOptions = {},
): SelectionAction {
  return {
    id: "ask-tutor",
    icon: createElement(Sparkles, { className: "w-3.5 h-3.5", strokeWidth: 2 }),
    label: options.label ?? "Ask tutor",
    onSelect: (quote: TextQuote) => {
      dispatchAskTutor({
        quote: quote.exact,
        prefix: quote.prefix,
        suffix: quote.suffix,
        sourcePageSlug: options.sourcePageSlug,
      });
    },
  };
}

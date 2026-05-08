// Sprint 14 — selection popover that lets a signed-in reader start
// a claim-anchored discussion thread on a highlighted passage.
//
// Sprint 64b-6 — refactored to use the generic SelectionPopover
// (S63g) under the hood. Pages that need both this action AND
// "Ask tutor" should use SelectionPopover directly with multiple
// actions; this wrapper preserves the old single-action API for
// callers that haven't migrated.

import { MessageSquarePlus } from "lucide-react";
import type { TextQuote } from "../../lib/textQuote";
import { SelectionPopover } from "../SelectionPopover";

interface Props {
  rootRef: React.RefObject<HTMLElement | null>;
  signedIn: boolean;
  onStart: (quote: TextQuote, range: Range) => void;
}

export function ClaimSelectionPopover({ rootRef, signedIn, onStart }: Props) {
  return (
    <SelectionPopover
      rootRef={rootRef}
      actions={[
        {
          id: "discuss-claim",
          icon: <MessageSquarePlus className="w-3.5 h-3.5" strokeWidth={2} />,
          label: "Discuss this claim",
          onSelect: onStart,
          enabled: signedIn,
        },
      ]}
    />
  );
}

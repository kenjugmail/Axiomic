import type { ScenarioQuestion as Q } from "@axiomic/types";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { AiGradedResponse } from "./AiGradedResponse";

interface Props {
  question: Q;
  value: string | undefined;
  onChange: (v: string) => void;
  review?: { correct: boolean };
}

// Diagnose-the-failure scenario: a situation panel above the same
// AI-graded response box used by free_response.
export function ScenarioQuestion({ question, value, onChange, review }: Props) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-muted/40 p-4 text-sm [&_p]:mb-2 [&_p:last-child]:mb-0">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
          Scenario
        </div>
        <MarkdownRenderer content={question.scenario} />
      </div>
      <AiGradedResponse
        questionText={`${question.scenario}\n\n${question.question}`}
        rubricCriteria={question.rubricCriteria}
        passRatio={question.passRatio}
        value={value}
        onChange={onChange}
        review={review}
      />
    </div>
  );
}

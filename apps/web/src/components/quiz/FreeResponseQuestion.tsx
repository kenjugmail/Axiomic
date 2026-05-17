import type { FreeResponseQuestion as Q } from "@axiomic/types";
import { AiGradedResponse } from "./AiGradedResponse";

interface Props {
  question: Q;
  value: string | undefined;
  onChange: (v: string) => void;
  review?: { correct: boolean };
}

// AI-graded open response. The prompt heading is rendered by the
// host (LessonPage / preview); this renders only the answer box.
export function FreeResponseQuestion({ question, value, onChange, review }: Props) {
  return (
    <AiGradedResponse
      questionText={question.question}
      rubricCriteria={question.rubricCriteria}
      passRatio={question.passRatio}
      value={value}
      onChange={onChange}
      review={review}
    />
  );
}

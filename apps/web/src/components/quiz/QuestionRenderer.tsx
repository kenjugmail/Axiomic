import { assertQuestionKind } from "@axiomic/types";
import type { QuizQuestion } from "@axiomic/types";
import { MultipleChoiceQuestion } from "./MultipleChoiceQuestion";
import { SliderQuestion } from "./SliderQuestion";
import { DragClassifyQuestion } from "./DragClassifyQuestion";
import { CodeQuestion } from "./CodeQuestion";
import { PuzzleDragBuildQuestion } from "./PuzzleDragBuildQuestion";
import { MathExpressionQuestion } from "./MathExpressionQuestion";
import { SortableQuestion } from "./SortableQuestion";
import { CodeCompletionQuestion } from "./CodeCompletionQuestion";

interface Props {
  question: QuizQuestion;
  value: string | undefined;
  onChange: (v: string) => void;
  review?: { correct: boolean };
}

// Single dispatch point for question kinds. Adding a new kind in the
// future is one switch case here.
export function QuestionRenderer({ question, value, onChange, review }: Props) {
  const q = assertQuestionKind(question);
  switch (q.kind) {
    case "multiple_choice":
      return (
        <MultipleChoiceQuestion
          question={q}
          value={value}
          onChange={onChange}
          review={review}
        />
      );
    case "slider":
      return (
        <SliderQuestion question={q} value={value} onChange={onChange} review={review} />
      );
    case "drag_classify":
      return (
        <DragClassifyQuestion
          question={q}
          value={value}
          onChange={onChange}
          review={review}
        />
      );
    case "code":
      return (
        <CodeQuestion question={q} value={value} onChange={onChange} review={review} />
      );
    case "puzzle_drag_build":
      return (
        <PuzzleDragBuildQuestion
          question={q}
          value={value}
          onChange={onChange}
          review={review}
        />
      );
    case "math_expression":
      return (
        <MathExpressionQuestion
          question={q}
          value={value}
          onChange={onChange}
          review={review}
        />
      );
    case "sortable":
      return (
        <SortableQuestion
          question={q}
          value={value}
          onChange={onChange}
          review={review}
        />
      );
    case "code_completion":
      return (
        <CodeCompletionQuestion
          question={q}
          value={value}
          onChange={onChange}
          review={review}
        />
      );
  }
}

// Has the user supplied an answer that's at least minimally complete?
// Used by the modal to enable / disable Submit.
export function isAnswered(question: QuizQuestion, value: string | undefined): boolean {
  const q = assertQuestionKind(question);
  if (value === undefined || value === null || value === "") {
    // Slider always has a default, so absence of `value` is acceptable.
    return q.kind === "slider";
  }
  if (q.kind === "drag_classify") {
    try {
      const map = JSON.parse(value) as Record<string, string>;
      return q.items.every((i) => map[i.id] && map[i.id].length > 0);
    } catch {
      return false;
    }
  }
  if (q.kind === "puzzle_drag_build") {
    try {
      const map = JSON.parse(value) as Record<string, string>;
      return q.slots.every((s) => map[s.id] && map[s.id].length > 0);
    } catch {
      return false;
    }
  }
  if (q.kind === "code") {
    // Answered iff the user has run the tests at least once. We don't
    // require all-passing to "advance" — but the host's submit step
    // grades on actual pass count.
    try {
      const r = JSON.parse(value) as { passed: number; total: number };
      return typeof r.passed === "number" && typeof r.total === "number";
    } catch {
      return false;
    }
  }
  if (q.kind === "sortable") {
    try {
      const arr = JSON.parse(value) as string[];
      return Array.isArray(arr) && arr.length === q.items.length;
    } catch {
      return false;
    }
  }
  if (q.kind === "code_completion") {
    try {
      const map = JSON.parse(value) as Record<string, string>;
      return q.blanks.every(
        (b) => typeof map[b.id] === "string" && map[b.id].trim().length > 0,
      );
    } catch {
      return false;
    }
  }
  if (q.kind === "math_expression") {
    return value.trim().length > 0;
  }
  return true;
}

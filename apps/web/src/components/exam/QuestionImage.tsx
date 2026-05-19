// Digital-SAT-parity: optional figure rendered above the prompt.
// Lives under apps/web/public/exam-assets/ so it ships with the
// app (no CSP / offline issues).

interface Props {
  src: string;
  alt?: string;
}

export function QuestionImage({ src, alt }: Props) {
  return (
    <figure className="mb-4">
      <img
        src={src}
        alt={alt ?? "Figure for this question"}
        loading="lazy"
        className="max-h-72 w-auto rounded-md border border-border bg-card"
      />
    </figure>
  );
}

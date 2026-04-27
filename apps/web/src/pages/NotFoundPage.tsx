import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-24 text-center">
      <h1 className="text-6xl font-bold text-muted-foreground/30 mb-4">404</h1>
      <p className="text-xl text-muted-foreground mb-8">
        This page doesn't exist yet — but maybe it should.
      </p>
      <Link
        to="/"
        className="inline-flex items-center px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
      >
        Back to Home
      </Link>
    </div>
  );
}

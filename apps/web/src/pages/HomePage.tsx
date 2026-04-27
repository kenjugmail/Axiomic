export function HomePage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 sm:py-24">
      <div className="text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6">
          Deep Knowledge,<br />Beautifully Structured
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-12">
          An open educational platform combining interactive wiki, discourse, AI-powered learning,
          and structured mastery paths — starting with modern machine learning.
        </p>
        <div className="flex gap-4 justify-center">
          <a
            href="/wiki"
            className="inline-flex items-center px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            Explore the Wiki
          </a>
          <a
            href="/paths"
            className="inline-flex items-center px-6 py-3 bg-secondary text-secondary-foreground rounded-lg font-medium hover:bg-secondary/80 transition-colors"
          >
            Start a Mastery Path
          </a>
        </div>
      </div>
    </div>
  );
}

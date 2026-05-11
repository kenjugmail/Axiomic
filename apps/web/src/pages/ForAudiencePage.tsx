import { Link, Navigate, useParams } from "react-router-dom";
import { getAudience } from "../marketing/audiences";
import { usePageTitle } from "../hooks/usePageTitle";

export function ForAudiencePage() {
  const { audienceId } = useParams<{ audienceId: string }>();
  const audience = audienceId ? getAudience(audienceId) : null;

  usePageTitle(audience ? `Axiomic | ${audience.title}` : "Axiomic");

  if (!audience) return <Navigate to="/" replace />;

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 sm:py-16">
      <section className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-soft">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {audience.pillar} pillar
        </div>
        <h1 className="mt-2 font-display text-3xl sm:text-4xl font-semibold tracking-tight">
          {audience.title}
        </h1>
        <p className="mt-3 text-muted-foreground text-lg max-w-3xl">
          {audience.tagline}
        </p>
        <p className="mt-5 text-sm sm:text-base text-muted-foreground max-w-3xl leading-relaxed">
          {audience.problem}
        </p>
      </section>

      <section className="mt-8 grid gap-8 lg:grid-cols-[1.15fr,0.85fr]">
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-soft">
          <h2 className="text-xl font-semibold">Workflow</h2>
          <ol className="mt-4 space-y-4">
            {audience.workflow.map((step, idx) => (
              <li key={step} className="flex items-start gap-3">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                  {idx + 1}
                </span>
                <span className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                  {step}
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-6 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {audience.proofLine}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              to={audience.primaryCta.to}
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {audience.primaryCta.label}
            </Link>
            {audience.secondaryCtas?.map((cta) => (
              <Link
                key={cta.to}
                to={cta.to}
                className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent/40"
              >
                {cta.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-soft">
            <h2 className="text-xl font-semibold">Related links</h2>
            <div className="mt-4 grid gap-3">
              {audience.relatedLinks.map((item) => (
                <Link
                  key={`${item.label}:${item.to}`}
                  to={item.to}
                  className="block rounded-xl border border-border bg-background px-4 py-3 hover:bg-accent/30 transition-colors"
                >
                  <div className="text-sm font-medium">{item.label}</div>
                  {item.description && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {item.description}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/30 p-6 sm:p-8 shadow-soft">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Pricing
            </div>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Team, classroom, and lab pricing plans are being refreshed for the
              hub-and-spoke launch. Start with the free product flows today.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

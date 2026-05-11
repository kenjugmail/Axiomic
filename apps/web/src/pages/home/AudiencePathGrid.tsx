import { Link } from "react-router-dom";
import { AUDIENCE_IDS, AUDIENCES } from "../../marketing/audiences";
import { HOME_COPY } from "../../marketing/home-copy";

export function AudiencePathGrid() {
  return (
    <section className="border-t border-border bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 py-14 sm:py-16">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {HOME_COPY.audienceSectionEyebrow}
          </div>
          <h2 className="mt-2 text-2xl sm:text-3xl font-semibold font-display tracking-tight">
            {HOME_COPY.audienceSectionTitle}
          </h2>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            {HOME_COPY.audienceSectionSubhead}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AUDIENCE_IDS.map((id) => {
            const audience = AUDIENCES[id];
            return (
              <Link
                key={id}
                to={`/for/${id}`}
                className="rounded-xl border border-border bg-card p-5 shadow-soft hover:bg-accent/30 transition-colors"
              >
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  {audience.pillar}
                </div>
                <h3 className="mt-2 text-lg font-semibold">{audience.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground line-clamp-3">
                  {audience.tagline}
                </p>
                <div className="mt-4 text-sm font-medium text-primary">
                  Open pathway →
                </div>
              </Link>
            );
          })}
        </div>
        <p className="mt-10 text-center text-sm text-muted-foreground">
          <Link
            to={HOME_COPY.competencyLoopTourTo}
            className="text-primary font-medium hover:underline"
          >
            {HOME_COPY.competencyLoopTourLabel}
          </Link>
          <span className="mx-1.5">·</span>
          {HOME_COPY.competencyLoopTourHint}
        </p>
      </div>
    </section>
  );
}

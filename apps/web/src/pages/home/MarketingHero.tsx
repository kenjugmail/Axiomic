import { Link } from "react-router-dom";
import { HOME_COPY } from "../../marketing/home-copy";

type MarketingHeroProps = {
  defaultPathTo: string;
};

export function MarketingHero({ defaultPathTo }: MarketingHeroProps) {
  return (
    <section>
      <div className="max-w-4xl mx-auto px-4 py-16 sm:py-20 text-center">
        <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.05] mb-5">
          {HOME_COPY.heroHeadline}
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed">
          {HOME_COPY.heroSubhead}
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <Link
            to={HOME_COPY.heroPrimaryCta.to}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors duration-fast text-sm"
          >
            {HOME_COPY.heroPrimaryCta.label}
          </Link>
          <Link
            to={HOME_COPY.heroSecondaryCta.to}
            className="inline-flex items-center px-5 py-2.5 border border-border text-foreground rounded-md font-medium hover:bg-accent/40 transition-colors duration-fast text-sm"
          >
            {HOME_COPY.heroSecondaryCta.label}
          </Link>
          <Link
            to={defaultPathTo}
            className="inline-flex items-center px-5 py-2.5 border border-border text-foreground rounded-md font-medium hover:bg-accent/40 transition-colors duration-fast text-sm"
          >
            Start learning
          </Link>
        </div>
        <p className="text-sm text-muted-foreground mt-6 max-w-xl mx-auto leading-relaxed">
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

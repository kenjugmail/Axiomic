import { Link, Navigate, useParams } from "react-router-dom";
import { getHub } from "../marketing/hubs";
import { usePageTitle } from "../hooks/usePageTitle";

export function HubPage() {
  const { pillarId } = useParams<{ pillarId: string }>();
  const hub = pillarId ? getHub(pillarId) : null;

  usePageTitle(hub ? `Axiomic | ${hub.label} Hub` : "Axiomic");

  if (!hub) return <Navigate to="/" replace />;

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 sm:py-16">
      <section className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-soft">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {hub.kicker}
        </div>
        <h1 className="mt-2 font-display text-3xl sm:text-4xl font-semibold tracking-tight">
          {hub.label}
        </h1>
        <p className="mt-3 text-muted-foreground max-w-3xl">{hub.description}</p>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {hub.links.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="rounded-xl border border-border bg-card p-5 shadow-soft hover:bg-accent/30 transition-colors"
          >
            <div className="text-sm font-semibold">{item.label}</div>
            <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}

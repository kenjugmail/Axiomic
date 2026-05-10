import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Play } from "lucide-react";
import type {
  ProtocolDetailResponse,
  ProtocolReagent,
} from "@axiomic/types";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { HazardCallout } from "../components/lab/HazardCallout";
import { StepList } from "../components/lab/StepList";
import { DISCIPLINE_LABEL } from "../components/lab/DisciplineFilterChips";

type Tier = "intro" | "undergrad" | "grad";

function isReagent(value: unknown): value is ProtocolReagent {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as ProtocolReagent).name === "string"
  );
}

export function ProtocolDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [data, setData] = useState<ProtocolDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tier, setTier] = useState<Tier>("undergrad");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [missingCerts, setMissingCerts] = useState<string[] | null>(null);

  const handleStartRun = async () => {
    if (!slug) return;
    setStartError(null);
    setMissingCerts(null);
    setStarting(true);
    try {
      const res = await api.lab.runs.start(slug);
      navigate(`/lab/runs/${res.runId}`);
    } catch (err) {
      const msg = (err as Error)?.message ?? "Failed to start run";
      // The 412 error body is `{ error, missingCerts }` — the api
      // helper surfaces the JSON via `.message` containing the JSON.
      try {
        const parsed = JSON.parse(msg);
        if (Array.isArray(parsed?.missingCerts)) {
          setMissingCerts(parsed.missingCerts as string[]);
          setStartError(parsed.error ?? msg);
        } else {
          setStartError(msg);
        }
      } catch {
        setStartError(msg);
      }
      setStarting(false);
    }
  };

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setData(null);
    setError(null);
    api.lab.protocols
      .get(slug)
      .then((res) => {
        if (cancelled) return;
        setData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message ?? "Failed to load protocol");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link to="/lab/protocols" className="text-sm text-muted-foreground">
          ← Back to protocols
        </Link>
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-3">
        <div className="animate-pulse h-10 bg-muted rounded-md w-2/3" />
        <div className="animate-pulse h-32 bg-muted rounded-xl" />
        <div className="animate-pulse h-32 bg-muted rounded-xl" />
      </div>
    );
  }

  const { protocol, steps } = data;
  const isAuthor = !!user && user.id === protocol.authorId;
  const reagents: ProtocolReagent[] = (protocol.reagents ?? []).filter(
    isReagent,
  );
  const bodyByTier: Record<Tier, string> = {
    intro: protocol.contentIntro,
    undergrad: protocol.contentUndergrad,
    grad: protocol.contentGrad,
  };
  const availableTiers: Tier[] = (
    ["intro", "undergrad", "grad"] as const
  ).filter((t) => bodyByTier[t].trim().length > 0);
  const activeTier: Tier =
    availableTiers.find((t) => t === tier) ??
    availableTiers[0] ??
    "undergrad";
  const body = bodyByTier[activeTier] ?? "";

  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <Link
        to="/lab/protocols"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} />
        Protocols
      </Link>

      <header className="mt-3 mb-4">
        <div className="flex flex-wrap items-center gap-2 mb-2 text-xs text-muted-foreground">
          <span className="px-2 py-0.5 rounded-full bg-muted text-foreground font-medium">
            {DISCIPLINE_LABEL[protocol.discipline]}
          </span>
          {protocol.category && <span>· {protocol.category}</span>}
          {protocol.estimatedMinutes && (
            <span>· ~{protocol.estimatedMinutes} min</span>
          )}
          <span>· v{protocol.version}</span>
          {protocol.status === "draft" && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-medium">
              Draft
            </span>
          )}
        </div>
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {protocol.title}
          </h1>
          <div className="flex items-center gap-2 shrink-0">
            {user && protocol.status === "published" && (
              <button
                type="button"
                onClick={handleStartRun}
                disabled={starting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" strokeWidth={2} />
                {starting ? "Starting…" : "Start run"}
              </button>
            )}
            {isAuthor && (
              <Link
                to={`/lab/protocols/${protocol.slug}/edit`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent/40 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" strokeWidth={2} />
                Edit
              </Link>
            )}
          </div>
        </div>
        {missingCerts !== null && missingCerts.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
            <div className="font-semibold text-foreground mb-1">
              You need {missingCerts.length} more safety cert
              {missingCerts.length === 1 ? "" : "s"} to start this run.
            </div>
            <ul className="space-y-1 mt-2">
              {missingCerts.map((slug) => (
                <li key={slug}>
                  <Link
                    to={`/lab/safety-certs/${slug}`}
                    className="text-primary hover:underline font-mono text-xs"
                  >
                    {slug}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {startError && missingCerts === null && (
          <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {startError}
          </div>
        )}
        {protocol.summary && (
          <p className="text-muted-foreground mt-2">{protocol.summary}</p>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          Authored by{" "}
          {protocol.authorUsername ? (
            <Link
              to={`/authors/${protocol.authorUsername}`}
              className="text-foreground hover:underline"
            >
              {protocol.authorDisplayName ?? protocol.authorUsername}
            </Link>
          ) : (
            "anonymous"
          )}
        </p>
      </header>

      <HazardCallout
        hazardsMd={protocol.hazardsMd}
        biosafetyLevel={protocol.biosafetyLevel}
      />

      {(protocol.requiredCerts.length > 0 ||
        protocol.equipmentRequired.length > 0 ||
        reagents.length > 0) && (
        <section className="grid sm:grid-cols-3 gap-3 my-5">
          {protocol.requiredCerts.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Required certs
              </h3>
              <ul className="text-sm space-y-1">
                {protocol.requiredCerts.map((c) => (
                  <li key={c} className="font-mono text-xs">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {protocol.equipmentRequired.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Equipment
              </h3>
              <ul className="text-sm space-y-1">
                {protocol.equipmentRequired.map((slug) => (
                  <li key={slug}>
                    <Link
                      to={`/lab/equipment/${slug}`}
                      className="text-foreground hover:underline"
                    >
                      {slug}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {reagents.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Reagents
              </h3>
              <ul className="text-sm space-y-1">
                {reagents.map((r, i) => (
                  <li key={`${r.name}-${i}`}>
                    <span className="text-foreground">{r.name}</span>
                    {r.amount && (
                      <span className="text-muted-foreground">
                        {" "}
                        — {r.amount}
                        {r.unit ? ` ${r.unit}` : ""}
                      </span>
                    )}
                    {r.hazardClass && (
                      <span className="ml-1 px-1 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                        {r.hazardClass}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {availableTiers.length > 1 && (
        <div className="flex items-center gap-1 my-4 text-xs">
          {availableTiers.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTier(t)}
              className={`px-3 py-1 rounded-md border transition-colors duration-fast ${
                activeTier === t
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-accent/40"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {body.trim().length > 0 && (
        <section className="prose-invert mb-8">
          <MarkdownRenderer content={body} />
        </section>
      )}

      <section className="mt-6">
        <h2 className="font-display text-xl font-semibold tracking-tight mb-3">
          Procedure
        </h2>
        <StepList steps={steps} storageKey={`protocol:${protocol.slug}`} />
      </section>
    </article>
  );
}

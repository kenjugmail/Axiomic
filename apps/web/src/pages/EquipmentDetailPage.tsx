import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Wrench, AlertCircle, ListChecks, Activity } from "lucide-react";
import type {
  EquipmentDetailResponse,
  EquipmentOperationKind,
} from "@axiomic/types";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { HazardCallout } from "../components/lab/HazardCallout";
import { DISCIPLINE_LABEL } from "../components/lab/DisciplineFilterChips";

const KIND_LABEL: Record<EquipmentOperationKind, string> = {
  calibration: "Calibration",
  "daily-check": "Daily check",
  "common-fault": "Common fault",
  "post-use": "Post-use",
};

const KIND_ICON: Record<EquipmentOperationKind, typeof Wrench> = {
  calibration: Wrench,
  "daily-check": ListChecks,
  "common-fault": AlertCircle,
  "post-use": Activity,
};

export function EquipmentDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuthStore();
  const [data, setData] = useState<EquipmentDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setData(null);
    setError(null);
    api.lab.equipment
      .get(slug)
      .then((res) => {
        if (cancelled) return;
        setData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message ?? "Failed to load equipment");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link to="/lab/equipment" className="text-sm text-muted-foreground">
          ← Back to equipment
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
      </div>
    );
  }

  const { equipment: eq, operations } = data;
  const isAuthor = !!user && user.id === eq.authorId;

  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <Link
        to="/lab/equipment"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} />
        Equipment
      </Link>

      <header className="mt-3 mb-4">
        <div className="flex flex-wrap items-center gap-2 mb-2 text-xs text-muted-foreground">
          <span className="px-2 py-0.5 rounded-full bg-muted text-foreground font-medium">
            {DISCIPLINE_LABEL[eq.discipline]}
          </span>
          {eq.manufacturer && <span>· {eq.manufacturer}</span>}
          {eq.model && <span>· {eq.model}</span>}
          {eq.status === "retired" && (
            <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border font-medium">
              Retired
            </span>
          )}
        </div>
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {eq.title}
          </h1>
          {isAuthor && (
            <Link
              to={`/lab/equipment/${eq.slug}/edit`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent/40 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" strokeWidth={2} />
              Edit
            </Link>
          )}
        </div>
        <div className="mt-2 grid sm:grid-cols-3 gap-3">
          {eq.locationHint && (
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Location
              </div>
              <div className="text-sm text-foreground">{eq.locationHint}</div>
            </div>
          )}
          {eq.trainingCertSlug && (
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Training cert
              </div>
              <div className="text-sm font-mono text-foreground">
                {eq.trainingCertSlug}
              </div>
            </div>
          )}
          <div className="rounded-lg border border-border bg-card px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Booking
            </div>
            <div className="text-sm text-foreground">{eq.bookingPolicy}</div>
          </div>
        </div>
      </header>

      <HazardCallout hazardsMd={eq.hazardsMd} />

      {eq.manualMd.trim().length > 0 && (
        <section className="my-6">
          <h2 className="font-display text-xl font-semibold tracking-tight mb-3">
            Manual
          </h2>
          <MarkdownRenderer content={eq.manualMd} />
        </section>
      )}

      {operations.length > 0 && (
        <section className="my-6">
          <h2 className="font-display text-xl font-semibold tracking-tight mb-3">
            Common operations
          </h2>
          <ul className="space-y-3">
            {operations.map((op) => {
              const Icon = KIND_ICON[op.kind] ?? Wrench;
              return (
                <li
                  key={op.id}
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon
                      className="w-4 h-4 text-muted-foreground"
                      strokeWidth={2}
                    />
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      {KIND_LABEL[op.kind] ?? op.kind}
                    </span>
                    <h3 className="text-sm font-semibold text-foreground">
                      {op.title}
                    </h3>
                  </div>
                  <MarkdownRenderer
                    content={op.bodyMd}
                    className="text-sm [&_p]:mb-2"
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </article>
  );
}

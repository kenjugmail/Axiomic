import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Cpu, Plus } from "lucide-react";
import type { EquipmentSummary, LabDiscipline } from "@axiomic/types";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import {
  DisciplineFilterChips,
  DISCIPLINE_LABEL,
} from "../components/lab/DisciplineFilterChips";

export function EquipmentListPage() {
  const { user } = useAuthStore();
  const [items, setItems] = useState<EquipmentSummary[] | null>(null);
  const [discipline, setDiscipline] = useState<LabDiscipline | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    api.lab.equipment
      .list(discipline ? { discipline } : undefined)
      .then((res) => {
        if (cancelled) return;
        setItems(res.equipment);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message ?? "Failed to load equipment");
      });
    return () => {
      cancelled = true;
    };
  }, [discipline]);

  const grouped = useMemo(() => {
    if (!items) return null;
    const out = new Map<string, EquipmentSummary[]>();
    for (const e of items) {
      const arr = out.get(e.discipline) ?? [];
      arr.push(e);
      out.set(e.discipline, arr);
    }
    return out;
  }, [items]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Cpu className="w-7 h-7 text-primary" strokeWidth={1.75} />
            Equipment manuals
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            One canonical manual per instrument. Booking and post-use
            checklists ship with the next sprint.
          </p>
        </div>
        {user && (
          <div className="flex items-center gap-2">
            <Link
              to="/lab/protocols"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Protocols →
            </Link>
            <Link
              to="/lab/equipment/new"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" strokeWidth={2} />
              New equipment
            </Link>
          </div>
        )}
      </div>

      <div className="my-5">
        <DisciplineFilterChips active={discipline} onChange={setDiscipline} />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {items === null ? (
        <div className="space-y-3">
          <div className="animate-pulse h-20 bg-muted rounded-xl" />
          <div className="animate-pulse h-20 bg-muted rounded-xl" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No equipment manuals
          {discipline ? ` for ${DISCIPLINE_LABEL[discipline]}` : ""} yet.
        </p>
      ) : (
        Array.from(grouped!.entries()).map(([disc, list]) => (
          <section key={disc} className="mb-8">
            <h2 className="font-display text-xl font-semibold tracking-tight mb-3">
              {DISCIPLINE_LABEL[disc as LabDiscipline] ?? disc}
            </h2>
            <ul className="grid sm:grid-cols-2 gap-2">
              {list.map((e) => (
                <li key={e.id}>
                  <Link
                    to={`/lab/equipment/${e.slug}`}
                    className="block rounded-lg border border-border bg-card hover:bg-accent/40 transition-colors duration-fast p-4"
                  >
                    <h3 className="font-semibold text-foreground">
                      {e.title}
                    </h3>
                    <div className="text-xs text-muted-foreground mt-1">
                      {[e.manufacturer, e.model].filter(Boolean).join(" · ") ||
                        "Manual"}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      {e.locationHint && <span>📍 {e.locationHint}</span>}
                      {e.trainingCertSlug && (
                        <span className="font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                          cert: {e.trainingCertSlug}
                        </span>
                      )}
                      <span>policy: {e.bookingPolicy}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

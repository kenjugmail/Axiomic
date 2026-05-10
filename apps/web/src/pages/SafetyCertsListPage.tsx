import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import type {
  LabDiscipline,
  SafetyCertSummary,
  UserSafetyCertEntry,
} from "@axiomic/types";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import {
  DisciplineFilterChips,
  DISCIPLINE_LABEL,
} from "../components/lab/DisciplineFilterChips";
import { CertExpiryBadge } from "../components/lab/CertExpiryBadge";

export function SafetyCertsListPage() {
  const { user } = useAuthStore();
  const [certs, setCerts] = useState<SafetyCertSummary[] | null>(null);
  const [mine, setMine] = useState<UserSafetyCertEntry[]>([]);
  const [discipline, setDiscipline] = useState<LabDiscipline | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCerts(null);
    setError(null);
    api.lab.safetyCerts
      .list(discipline ? { discipline } : undefined)
      .then((res) => {
        if (cancelled) return;
        setCerts(res.certs);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message ?? "Failed to load safety certifications");
      });
    return () => {
      cancelled = true;
    };
  }, [discipline]);

  useEffect(() => {
    if (!user) {
      setMine([]);
      return;
    }
    let cancelled = false;
    api.lab.safetyCerts
      .mine()
      .then((res) => {
        if (cancelled) return;
        setMine(res.certs);
      })
      .catch(() => {
        // best-effort
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const heldBySlug = useMemo(() => {
    const map = new Map<string, UserSafetyCertEntry>();
    for (const m of mine) map.set(m.certSlug, m);
    return map;
  }, [mine]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-primary" strokeWidth={1.75} />
            Safety certifications
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Required to start protocol runs that touch hazardous work.
            Take the quiz to earn a cert; some expire and need renewal.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/lab/protocols"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Protocols →
          </Link>
          {user && (
            <Link
              to="/me/lab"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              My lab →
            </Link>
          )}
        </div>
      </div>

      <div className="my-5">
        <DisciplineFilterChips active={discipline} onChange={setDiscipline} />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {certs === null ? (
        <div className="space-y-3">
          <div className="animate-pulse h-20 bg-muted rounded-xl" />
          <div className="animate-pulse h-20 bg-muted rounded-xl" />
        </div>
      ) : certs.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No certifications
          {discipline ? ` for ${DISCIPLINE_LABEL[discipline]}` : ""} yet.
        </p>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-3">
          {certs.map((c) => {
            const held = heldBySlug.get(c.slug);
            return (
              <li key={c.id}>
                <Link
                  to={`/lab/safety-certs/${c.slug}`}
                  className="block rounded-lg border border-border bg-card hover:bg-accent/40 transition-colors duration-fast p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground">
                        {c.title}
                      </h3>
                      <div className="text-xs text-muted-foreground mt-1">
                        {DISCIPLINE_LABEL[c.discipline]}
                        {c.validityDays
                          ? ` · expires after ${c.validityDays}d`
                          : " · no expiry"}
                      </div>
                      {c.description && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                          {c.description}
                        </p>
                      )}
                    </div>
                    {held && <CertExpiryBadge expiresAt={held.expiresAt} />}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

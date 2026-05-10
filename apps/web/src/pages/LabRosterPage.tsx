import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Users, Inbox, Plus, Check, X } from "lucide-react";
import type { LabRosterResponse } from "@axiomic/types";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { DISCIPLINE_LABEL } from "../components/lab/DisciplineFilterChips";

type AssignKind = "protocol" | "cert" | "path";

interface AssignDraft {
  kind: AssignKind;
  targetSlug: string;
  dueAt: string;
  notes: string;
  selected: Set<string>;
}

const DEFAULT_DRAFT: AssignDraft = {
  kind: "protocol",
  targetSlug: "",
  dueAt: "",
  notes: "",
  selected: new Set(),
};

export function LabRosterPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuthStore();
  const [data, setData] = useState<LabRosterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<AssignDraft>(DEFAULT_DRAFT);
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignToast, setAssignToast] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setData(null);
    setError(null);
    api.lab
      .roster(slug)
      .then((res) => {
        if (cancelled) return;
        setData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message ?? "Failed to load roster");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <p className="text-muted-foreground">
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>{" "}
          to view this roster.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link to="/cohorts" className="text-sm text-muted-foreground">
          ← Back to cohorts
        </Link>
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }

  if (!data || !slug) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-3">
        <div className="animate-pulse h-10 bg-muted rounded-md w-2/3" />
        <div className="animate-pulse h-32 bg-muted rounded-xl" />
      </div>
    );
  }

  const interns = data.members.filter((m) => m.role === "member");
  const mentors = data.members.filter((m) => m.role !== "member");

  const toggleSelected = (userId: string) => {
    setDraft((prev) => {
      const next = new Set(prev.selected);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return { ...prev, selected: next };
    });
  };

  const submitAssign = async () => {
    if (!draft.targetSlug.trim()) {
      setAssignError("Pick a target slug.");
      return;
    }
    if (draft.selected.size === 0) {
      setAssignError("Select at least one intern.");
      return;
    }
    setAssignError(null);
    setAssigning(true);
    try {
      const body: any = {
        assignedToUserIds: [...draft.selected],
        dueAt: draft.dueAt ? new Date(draft.dueAt).toISOString() : null,
        notesMd: draft.notes || undefined,
      };
      if (draft.kind === "protocol") body.protocolSlug = draft.targetSlug;
      if (draft.kind === "cert") body.certSlug = draft.targetSlug;
      if (draft.kind === "path") body.masteryPathSlug = draft.targetSlug;
      await api.lab.assign(slug, body);
      setDraft(DEFAULT_DRAFT);
      setAssignToast(`Assigned to ${draft.selected.size} intern(s).`);
      setTimeout(() => setAssignToast(null), 3000);
    } catch (err) {
      setAssignError((err as Error)?.message ?? "Assign failed");
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <Link
        to={`/cohorts/${slug}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} />
        Cohort
      </Link>

      <header className="mt-3 mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight flex items-center gap-2">
          <Users className="w-7 h-7 text-primary" strokeWidth={1.75} />
          {data.cohort.name} · Roster
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {data.cohort.discipline
            ? `${DISCIPLINE_LABEL[data.cohort.discipline as keyof typeof DISCIPLINE_LABEL] ?? data.cohort.discipline} · `
            : ""}
          {interns.length} intern{interns.length === 1 ? "" : "s"} ·{" "}
          {mentors.length} mentor/organizer
          {mentors.length === 1 ? "" : "s"}
        </p>
      </header>

      <div className="grid lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2">
          <h2 className="font-display text-xl font-semibold tracking-tight mb-3">
            Interns
          </h2>
          {interns.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No interns yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {interns.map((m) => {
                const checked = draft.selected.has(m.userId);
                return (
                  <li key={m.userId}>
                    <div className="rounded-lg border border-border bg-card p-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelected(m.userId)}
                          aria-label={`Select ${m.username}`}
                          className="shrink-0"
                        />
                        <Link
                          to={`/authors/${m.username}`}
                          className="text-sm font-medium text-foreground hover:underline truncate"
                        >
                          {m.displayName ?? m.username}
                        </Link>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                        <span>
                          {m.signedOffRunCount} run
                          {m.signedOffRunCount === 1 ? "" : "s"}
                        </span>
                        <span>
                          {m.activeCertCount} cert
                          {m.activeCertCount === 1 ? "" : "s"}
                        </span>
                        <span>
                          {m.assignments.completed}/
                          {m.assignments.completed +
                            m.assignments.pending +
                            m.assignments.overdue}{" "}
                          assigned
                        </span>
                        {m.assignments.overdue > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-destructive/15 text-destructive border border-destructive/30 font-medium">
                            {m.assignments.overdue} overdue
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-8">
            <h2 className="font-display text-xl font-semibold tracking-tight mb-3 flex items-center gap-2">
              <Inbox className="w-5 h-5 text-amber-500" strokeWidth={2} />
              Awaiting sign-off
            </h2>
            {data.awaitingSignoffQueue.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                Queue is empty.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.awaitingSignoffQueue.map((q) => (
                  <li key={q.id}>
                    <Link
                      to={`/lab/runs/${q.id}`}
                      className="block rounded-lg border border-border bg-card hover:bg-accent/40 transition-colors duration-fast p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-foreground truncate">
                            {q.protocolTitle}
                          </h3>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            started{" "}
                            {new Date(q.startedAt).toLocaleString()}
                          </div>
                        </div>
                        <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                          Review →
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <aside>
          <h2 className="font-display text-xl font-semibold tracking-tight mb-3 flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" strokeWidth={2} />
            Assign work
          </h2>
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Kind
              </label>
              <div className="flex gap-1 text-xs">
                {(["protocol", "cert", "path"] as AssignKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() =>
                      setDraft((p) => ({
                        ...p,
                        kind: k,
                        targetSlug: "",
                      }))
                    }
                    className={`px-3 py-1 rounded-md border transition-colors ${
                      draft.kind === k
                        ? "bg-foreground text-background border-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Target slug
              </label>
              <input
                type="text"
                value={draft.targetSlug}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    targetSlug: e.target.value.toLowerCase(),
                  }))
                }
                placeholder={
                  draft.kind === "protocol"
                    ? "agarose-gel"
                    : draft.kind === "cert"
                      ? "bsl-2"
                      : "bio-lab-onboarding"
                }
                className="w-full px-2 py-1.5 rounded-md border border-input bg-background text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Due (optional)
              </label>
              <input
                type="datetime-local"
                value={draft.dueAt}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, dueAt: e.target.value }))
                }
                className="w-full px-2 py-1.5 rounded-md border border-input bg-background text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Notes (optional)
              </label>
              <textarea
                value={draft.notes}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, notes: e.target.value }))
                }
                rows={3}
                placeholder="Visible to the intern."
                className="w-full px-2 py-1.5 rounded-md border border-input bg-background text-sm font-mono"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {draft.selected.size} intern
              {draft.selected.size === 1 ? "" : "s"} selected
            </div>
            {assignError && (
              <div className="flex items-center gap-1 text-sm text-destructive">
                <X className="w-3.5 h-3.5" strokeWidth={2} />
                {assignError}
              </div>
            )}
            {assignToast && (
              <div className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                <Check className="w-3.5 h-3.5" strokeWidth={2} />
                {assignToast}
              </div>
            )}
            <button
              type="button"
              disabled={
                assigning ||
                draft.selected.size === 0 ||
                !draft.targetSlug.trim()
              }
              onClick={submitAssign}
              className="w-full inline-flex items-center justify-center px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {assigning ? "Assigning…" : "Assign"}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

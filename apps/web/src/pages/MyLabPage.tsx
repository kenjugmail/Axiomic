import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Beaker, ClipboardList, Sparkles, ShieldCheck, Inbox } from "lucide-react";
import type {
  LabPlaybookResponse,
  ProtocolRunSummary,
  UserSafetyCertEntry,
} from "@axiomic/types";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { CertExpiryBadge } from "../components/lab/CertExpiryBadge";
import { DISCIPLINE_LABEL } from "../components/lab/DisciplineFilterChips";
import { TroubleshootRail } from "../components/lab/TroubleshootRail";

function relativeDue(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.ceil((Date.parse(iso) - Date.now()) / 86400_000);
  if (days < 0) return `overdue ${Math.abs(days)}d`;
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days}d`;
}

const STATUS_LABEL: Record<string, string> = {
  in_progress: "In progress",
  awaiting_signoff: "Awaiting sign-off",
  signed_off: "Signed off",
  rejected: "Sent back",
};

const STATUS_TONE: Record<string, string> = {
  in_progress: "text-sky-600 dark:text-sky-400",
  awaiting_signoff: "text-amber-600 dark:text-amber-400",
  signed_off: "text-emerald-600 dark:text-emerald-400",
  rejected: "text-destructive",
};

function RunRow({ run }: { run: ProtocolRunSummary }) {
  const tone = STATUS_TONE[run.status] ?? "text-muted-foreground";
  return (
    <li>
      <Link
        to={`/lab/runs/${run.id}`}
        className="block rounded-lg border border-border bg-card hover:bg-accent/40 transition-colors duration-fast p-3"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-foreground truncate">
              {run.protocolTitle}
            </h3>
            <div className="text-xs text-muted-foreground mt-0.5">
              v{run.protocolVersion} ·{" "}
              {new Date(run.startedAt).toLocaleDateString()}
              {run.signedOffAt
                ? ` · signed ${new Date(run.signedOffAt).toLocaleDateString()}`
                : ""}
            </div>
          </div>
          <span className={`text-xs font-medium ${tone}`}>
            {STATUS_LABEL[run.status] ?? run.status}
          </span>
        </div>
      </Link>
    </li>
  );
}

export function MyLabPage() {
  const { user } = useAuthStore();
  const [myRuns, setMyRuns] = useState<ProtocolRunSummary[] | null>(null);
  const [reviewQueue, setReviewQueue] = useState<ProtocolRunSummary[] | null>(
    null,
  );
  const [certs, setCerts] = useState<UserSafetyCertEntry[] | null>(null);
  const [playbook, setPlaybook] = useState<LabPlaybookResponse | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api.lab.runs.mine().then((res) => {
      if (cancelled) return;
      setMyRuns(res.runs);
    });
    api.lab.runs.awaitingSignoff().then((res) => {
      if (cancelled) return;
      setReviewQueue(res.runs);
    });
    api.lab.safetyCerts.mine().then((res) => {
      if (cancelled) return;
      setCerts(res.certs);
    });
    api.lab.playbook().then((res) => {
      if (cancelled) return;
      setPlaybook(res);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const grouped = useMemo(() => {
    if (!myRuns) return null;
    const out = {
      active: [] as ProtocolRunSummary[],
      awaiting: [] as ProtocolRunSummary[],
      done: [] as ProtocolRunSummary[],
    };
    for (const r of myRuns) {
      if (r.status === "in_progress" || r.status === "rejected") {
        out.active.push(r);
      } else if (r.status === "awaiting_signoff") {
        out.awaiting.push(r);
      } else {
        out.done.push(r);
      }
    }
    return out;
  }, [myRuns]);

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <p className="text-muted-foreground">
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>{" "}
          to see your lab dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Beaker className="w-7 h-7 text-primary" strokeWidth={1.75} />
            My lab
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Active runs, sign-off queue, and safety certifications.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link
            to="/lab/protocols"
            className="text-muted-foreground hover:text-foreground"
          >
            Protocols →
          </Link>
          <Link
            to="/lab/safety-certs"
            className="text-muted-foreground hover:text-foreground"
          >
            Certifications →
          </Link>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 space-y-6">
          {playbook && playbook.assignments.length > 0 && (
            <div>
              <h2 className="font-display text-xl font-semibold tracking-tight mb-3 flex items-center gap-2">
                <ClipboardList
                  className="w-5 h-5 text-primary"
                  strokeWidth={2}
                />
                Assigned to you
              </h2>
              <ul className="space-y-2">
                {playbook.assignments.map((a) => {
                  const due = relativeDue(a.dueAt);
                  const tone =
                    a.status === "completed"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : a.status === "overdue"
                        ? "text-destructive"
                        : "text-muted-foreground";
                  const href =
                    a.kind === "protocol" && a.targetSlug
                      ? `/lab/protocols/${a.targetSlug}`
                      : a.kind === "cert" && a.targetSlug
                        ? `/lab/safety-certs/${a.targetSlug}`
                        : a.kind === "path" && a.targetSlug
                          ? `/paths/${a.targetSlug}`
                          : "/me/lab";
                  return (
                    <li key={a.id}>
                      <Link
                        to={href}
                        className="block rounded-lg border border-border bg-card hover:bg-accent/40 transition-colors duration-fast p-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-medium text-foreground truncate">
                              {a.targetTitle}
                            </h3>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {a.cohortName} ·{" "}
                              <span className="capitalize">{a.kind}</span>
                              {a.assignedByUsername
                                ? ` · assigned by @${a.assignedByUsername}`
                                : ""}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {due && (
                              <span className={`text-xs font-medium ${tone}`}>
                                {due}
                              </span>
                            )}
                            <span className={`text-xs font-medium ${tone} capitalize`}>
                              {a.status.replace("_", " ")}
                            </span>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {playbook && playbook.recommended.length > 0 && (
            <div>
              <h2 className="font-display text-xl font-semibold tracking-tight mb-3 flex items-center gap-2">
                <Sparkles
                  className="w-5 h-5 text-amber-500"
                  strokeWidth={2}
                />
                Recommended next
              </h2>
              <ul className="grid sm:grid-cols-3 gap-2">
                {playbook.recommended.map((r) => (
                  <li key={r.slug}>
                    <Link
                      to={`/lab/protocols/${r.slug}`}
                      className="block rounded-lg border border-border bg-card hover:bg-accent/40 transition-colors duration-fast p-3"
                    >
                      <h3 className="text-sm font-medium text-foreground truncate">
                        {r.title}
                      </h3>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {DISCIPLINE_LABEL[
                          r.discipline as keyof typeof DISCIPLINE_LABEL
                        ] ?? r.discipline}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight mb-3">
              Active runs
            </h2>
            {!grouped ? (
              <div className="animate-pulse h-20 bg-muted rounded-xl" />
            ) : grouped.active.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No runs in progress. Start one from any{" "}
                <Link to="/lab/protocols" className="hover:underline">
                  published protocol
                </Link>
                .
              </p>
            ) : (
              <ul className="space-y-2">
                {grouped.active.map((r) => (
                  <RunRow key={r.id} run={r} />
                ))}
              </ul>
            )}
          </div>

          {grouped && grouped.awaiting.length > 0 && (
            <div>
              <h2 className="font-display text-xl font-semibold tracking-tight mb-3">
                Awaiting sign-off
              </h2>
              <ul className="space-y-2">
                {grouped.awaiting.map((r) => (
                  <RunRow key={r.id} run={r} />
                ))}
              </ul>
            </div>
          )}

          {grouped && grouped.done.length > 0 && (
            <div>
              <h2 className="font-display text-xl font-semibold tracking-tight mb-3">
                Completed
              </h2>
              <ul className="space-y-2">
                {grouped.done.slice(0, 12).map((r) => (
                  <RunRow key={r.id} run={r} />
                ))}
              </ul>
            </div>
          )}

          {reviewQueue && reviewQueue.length > 0 && (
            <div>
              <h2 className="font-display text-xl font-semibold tracking-tight mb-3 flex items-center gap-2">
                <Inbox className="w-5 h-5 text-amber-500" strokeWidth={2} />
                Sign-off queue
              </h2>
              <ul className="space-y-2">
                {reviewQueue.map((r) => (
                  <RunRow key={r.id} run={r} />
                ))}
              </ul>
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <TroubleshootRail compact />
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight mb-3 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" strokeWidth={2} />
              Certifications
            </h2>
            {certs === null ? (
              <div className="animate-pulse h-20 bg-muted rounded-xl" />
            ) : certs.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No certs yet. Browse the{" "}
                <Link
                  to="/lab/safety-certs"
                  className="hover:underline"
                >
                  catalog
                </Link>
                .
              </p>
            ) : (
              <ul className="space-y-2">
                {certs.map((c) => (
                  <li key={c.id}>
                    <Link
                      to={`/lab/safety-certs/${c.certSlug}`}
                      className="block rounded-lg border border-border bg-card hover:bg-accent/40 transition-colors duration-fast p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground truncate">
                          {c.certTitle ?? c.certSlug}
                        </span>
                        <CertExpiryBadge expiresAt={c.expiresAt} />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Passed{" "}
                        {new Date(c.passedAt).toLocaleDateString()}
                        {c.score !== null
                          ? ` · ${(c.score * 100).toFixed(0)}%`
                          : ""}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

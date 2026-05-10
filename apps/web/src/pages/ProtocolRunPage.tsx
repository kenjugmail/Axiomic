import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Beaker, Send } from "lucide-react";
import type {
  ProtocolRunDetailResponse,
  StepUpdateRequest,
} from "@axiomic/types";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { RunStepRunner } from "../components/lab/RunStepRunner";
import { SignOffModal } from "../components/lab/SignOffModal";
import { MarkdownRenderer } from "../components/MarkdownRenderer";

const STATUS_LABEL: Record<string, string> = {
  in_progress: "In progress",
  awaiting_signoff: "Awaiting sign-off",
  signed_off: "Signed off",
  rejected: "Sent back for changes",
};

const STATUS_TONE: Record<string, string> = {
  in_progress: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  awaiting_signoff:
    "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  signed_off:
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  rejected:
    "bg-destructive/15 text-destructive border-destructive/30",
};

export function ProtocolRunPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const [data, setData] = useState<ProtocolRunDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [modal, setModal] = useState<"approve" | "reject" | null>(null);

  const reload = async () => {
    if (!id) return;
    try {
      const res = await api.lab.runs.get(id);
      setData(res);
    } catch (err) {
      setError((err as Error)?.message ?? "Failed to load run");
    }
  };

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setData(null);
    setError(null);
    api.lab.runs
      .get(id)
      .then((res) => {
        if (cancelled) return;
        setData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message ?? "Failed to load run");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link to="/me/lab" className="text-sm text-muted-foreground">
          ← Back to my lab
        </Link>
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }

  if (!data || !id) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-3">
        <div className="animate-pulse h-10 bg-muted rounded-md w-2/3" />
        <div className="animate-pulse h-32 bg-muted rounded-xl" />
      </div>
    );
  }

  const { run, steps, canSignOff } = data;
  const isOwner = !!user && user.id === run.userId;
  const editable =
    isOwner && (run.status === "in_progress" || run.status === "rejected");

  const handleStepUpdate = async (
    ordinal: number,
    body: StepUpdateRequest,
  ) => {
    await api.lab.runs.updateStep(run.id, ordinal, body);
    await reload();
  };

  const handleRequestSignoff = async () => {
    setActionError(null);
    setRequesting(true);
    try {
      await api.lab.runs.requestSignoff(run.id);
      await reload();
    } catch (err) {
      setActionError((err as Error)?.message ?? "Request failed");
    } finally {
      setRequesting(false);
    }
  };

  const handleApprove = async (notesMd: string) => {
    await api.lab.runs.signOff(run.id, { notesMd: notesMd || undefined });
    setModal(null);
    await reload();
  };

  const handleReject = async (notesMd: string) => {
    await api.lab.runs.reject(run.id, { notesMd });
    setModal(null);
    await reload();
  };

  const doneCount = Object.values(run.stepState).filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <Link
        to="/me/lab"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} />
        My lab
      </Link>

      <header className="mt-3 mb-5">
        <div className="flex flex-wrap items-center gap-2 mb-2 text-xs text-muted-foreground">
          <span
            className={`px-2 py-0.5 rounded-full border font-medium ${STATUS_TONE[run.status] ?? "border-border"}`}
          >
            {STATUS_LABEL[run.status] ?? run.status}
          </span>
          <span>· v{run.protocolVersion}</span>
          <span>· started {new Date(run.startedAt).toLocaleString()}</span>
          {run.signedOffAt && (
            <span>
              · signed off {new Date(run.signedOffAt).toLocaleString()}
            </span>
          )}
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-3xl font-semibold tracking-tight flex items-center gap-2">
              <Beaker className="w-7 h-7 text-primary" strokeWidth={1.75} />
              <Link
                to={`/lab/protocols/${run.protocolSlug}`}
                className="hover:underline"
              >
                {run.protocolTitle}
              </Link>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Intern:{" "}
              <Link
                to={`/authors/${run.internUsername}`}
                className="text-foreground hover:underline"
              >
                {run.internDisplayName ?? run.internUsername}
              </Link>
            </p>
          </div>
        </div>
      </header>

      {actionError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 mb-4 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {run.signOffNotesMd && (
        <section
          className={`rounded-lg border p-4 mb-5 ${
            run.status === "rejected"
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-emerald-500/30 bg-emerald-500/5"
          }`}
        >
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            {run.status === "rejected" ? "Mentor feedback" : "Sign-off notes"}
          </h2>
          <MarkdownRenderer
            content={run.signOffNotesMd}
            className="text-sm [&_p]:mb-1"
          />
        </section>
      )}

      <RunStepRunner
        steps={steps}
        stepState={run.stepState}
        editable={editable}
        onUpdate={handleStepUpdate}
      />

      {isOwner && (run.status === "in_progress" || run.status === "rejected") && (
        <div className="mt-6 flex items-center justify-end gap-2 pt-4 border-t border-border">
          <span className="text-xs text-muted-foreground mr-auto">
            {doneCount} / {steps.length} steps done
            {!allDone && doneCount > 0 ? " (partial sign-off allowed)" : ""}
          </span>
          <button
            type="button"
            disabled={requesting || doneCount === 0}
            onClick={handleRequestSignoff}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
          >
            <Send className="w-4 h-4" strokeWidth={2} />
            {requesting ? "Sending…" : "Request sign-off"}
          </button>
        </div>
      )}

      {canSignOff && run.status === "awaiting_signoff" && (
        <div className="mt-6 flex items-center justify-end gap-2 pt-4 border-t border-border">
          <button
            type="button"
            onClick={() => setModal("reject")}
            className="px-4 py-2 rounded-md border border-amber-500/40 text-amber-700 dark:text-amber-300 text-sm hover:bg-amber-500/10"
          >
            Send back
          </button>
          <button
            type="button"
            onClick={() => setModal("approve")}
            className="px-4 py-2 rounded-md bg-emerald-500 text-white text-sm hover:bg-emerald-600"
          >
            Sign off
          </button>
        </div>
      )}

      <SignOffModal
        open={modal !== null}
        mode={modal ?? "approve"}
        protocolTitle={run.protocolTitle}
        internName={run.internDisplayName ?? run.internUsername}
        onCancel={() => setModal(null)}
        onSubmit={modal === "reject" ? handleReject : handleApprove}
      />
    </article>
  );
}

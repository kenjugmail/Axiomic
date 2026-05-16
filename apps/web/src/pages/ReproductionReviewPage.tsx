// Phase 28B — reproduction peer-review queue.
//
// Successful reproductions the caller didn't author and hasn't
// reviewed. Each row expands to show the evidence + a verdict
// form. Two independent "confirmed" verdicts mint the
// reproducer a signed credential (server-side).

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FlaskConical, ExternalLink } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";
import { EmptyState } from "../components/ui/EmptyState";
import { ReviewRoom } from "../components/ReviewRoom";
import { toast } from "../stores/toast";

type QueueItem = {
  id: string;
  targetKind: string;
  targetId: string;
  status: string;
  notes: string | null;
  evidenceUrl: string | null;
  createdAt: string;
  reproducerName: string;
};

export function ReproductionReviewPage() {
  const user = useAuthStore((s) => s.user);
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);

  const reload = () => {
    api.reproductions
      .reviewQueue()
      .then((r) => setItems(r.reproductions))
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : "Failed to load");
        setItems([]);
      });
  };

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api.reproductions
      .reviewQueue()
      .then((r) => {
        if (!cancelled) setItems(r.reproductions);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load");
          setItems([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <FlaskConical
          className="w-10 h-10 mx-auto mb-3 text-muted-foreground"
          strokeWidth={1.5}
        />
        <h1 className="font-display text-2xl font-semibold tracking-tight mb-2">
          Reproduction review
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          Sign in to help peer-verify reproductions.
        </p>
        <Link
          to="/login"
          className="inline-block text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
          <FlaskConical className="w-7 h-7 text-primary" />
          Reproduction review
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-prose">
          Independently check someone's reproduction of a paper or
          article. Two confirmations mint them a signed "Verified
          reproduction" credential. You can't review your own.
        </p>
      </header>

      {error && (
        <p className="text-sm text-rose-600 dark:text-rose-400 mb-3">
          {error}
        </p>
      )}

      {items === null && (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      )}

      {items && items.length === 0 && (
        <EmptyState
          icon={FlaskConical}
          title="Nothing to review right now"
          description="Successful reproductions you didn't author show up here. Check back later."
        />
      )}

      {items && items.length > 0 && (
        <ul className="space-y-3">
          {items.map((it) => (
            <li
              key={it.id}
              className="rounded-lg border border-border bg-card p-4"
              data-testid="repro-queue-row"
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h2 className="text-sm font-semibold">
                  {it.reproducerName} reproduced a {it.targetKind}
                </h2>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {new Date(it.createdAt).toLocaleDateString()}
                </span>
              </div>
              {it.notes && (
                <p className="text-sm text-muted-foreground mt-1.5 whitespace-pre-wrap">
                  {it.notes}
                </p>
              )}
              {it.evidenceUrl && (
                <a
                  href={it.evidenceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Evidence <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <div className="mt-3">
                {openId === it.id ? (
                  <VerdictForm
                    id={it.id}
                    onDone={() => {
                      setOpenId(null);
                      reload();
                    }}
                    onCancel={() => setOpenId(null)}
                  />
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setOpenId(it.id)}
                      className="text-xs px-3 py-1.5 rounded-md border border-primary/40 text-primary hover:bg-primary/10"
                    >
                      Review this
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setRoomId(roomId === it.id ? null : it.id)
                      }
                      className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
                    >
                      {roomId === it.id ? "Hide room" : "Discuss live"}
                    </button>
                  </div>
                )}
              </div>
              {roomId === it.id && (
                <div className="mt-3">
                  <ReviewRoom kind="reproduction" roomId={it.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VerdictForm({
  id,
  onDone,
  onCancel,
}: {
  id: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [verdict, setVerdict] = useState<
    "confirmed" | "refuted" | "inconclusive"
  >("confirmed");
  const [notesMd, setNotesMd] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api.reproductions.review(id, verdict, notesMd);
      toast.success("Verdict recorded.");
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Review failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-border bg-background p-3 space-y-2">
      <div className="flex gap-3 flex-wrap text-sm">
        {(["confirmed", "refuted", "inconclusive"] as const).map((v) => (
          <label key={v} className="inline-flex items-center gap-1.5">
            <input
              type="radio"
              name={`verdict-${id}`}
              checked={verdict === v}
              onChange={() => setVerdict(v)}
            />
            {v}
          </label>
        ))}
      </div>
      <textarea
        value={notesMd}
        onChange={(e) => setNotesMd(e.target.value)}
        rows={3}
        placeholder="Notes (optional) — what you checked, what you saw."
        className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? "Recording…" : "Submit verdict"}
        </button>
      </div>
    </div>
  );
}

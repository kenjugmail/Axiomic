import { useEffect, useState } from "react";
import { confirm } from "../stores/confirm";
import { Link, useSearchParams } from "react-router-dom";
import { Flag, RotateCcw, Sparkles, FileEdit } from "lucide-react";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";
import { EmptyState } from "../components/ui/EmptyState";
import { ReportEditModal } from "../components/lesson/ReportEditModal";
import { toast } from "../stores/toast";
import { relativeTime } from "../lib/dates";

interface Edit {
  versionId: string;
  nodeId: string;
  version: number;
  editorId: string | null;
  editorUsername: string | null;
  editMessage: string | null;
  createdAt: string;
  nodeSlug: string;
  nodeTitle: string;
  pathSlug: string;
  currentLessonVersion: number;
}

export function LessonEditsFeed() {
  const [searchParams] = useSearchParams();
  const usernameFilter = searchParams.get("username") ?? undefined;
  const user = useAuthStore((s) => s.user);

  const [edits, setEdits] = useState<Edit[] | null>(null);
  const [reverting, setReverting] = useState<string | null>(null);
  const [reporting, setReporting] = useState<{
    nodeId: string;
    version: number;
  } | null>(null);

  const load = () => {
    setEdits(null);
    api.mastery
      .lessonEditsFeed({ username: usernameFilter, limit: 30 })
      .then((r) => setEdits(r.edits))
      .catch(() => setEdits([]));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usernameFilter]);

  const revertTo = async (e: Edit) => {
    if (reverting) return;
    if (e.version <= 1) {
      toast.error("There's no earlier version to revert to.");
      return;
    }
    if (
      !(await confirm({
        title: `Revert ${e.nodeTitle}?`,
        body: `From v${e.version} back to v${e.version - 1}. A new version is created.`,
      }))
    ) {
      return;
    }
    setReverting(e.versionId);
    try {
      await api.mastery.restoreLessonVersion(e.nodeId, e.version - 1);
      toast.success(`Reverted ${e.nodeTitle} to v${e.version - 1}`);
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Revert failed");
    } finally {
      setReverting(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5 mb-1">
        <Sparkles className="w-3 h-3" strokeWidth={2} />
        Community
      </div>
      <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight leading-tight mb-1">
        Lesson edits
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Every recent change to a lesson, newest first. Anyone can revert an
        edit; everyone signed in can flag one for review.
        {usernameFilter && (
          <>
            {" "}Filtered to{" "}
            <Link
              to={`/profile/${usernameFilter}`}
              className="text-primary hover:underline"
            >
              @{usernameFilter}
            </Link>{" "}
            (
            <Link to="/lesson-edits" className="text-primary hover:underline">
              clear
            </Link>
            ).
          </>
        )}
      </p>

      {edits === null ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : edits.length === 0 ? (
        <EmptyState
          icon={FileEdit}
          title="No lesson edits yet"
          description="When community contributors edit a lesson, the change shows up here for review."
        />
      ) : (
        <ul className="space-y-2">
          {edits.map((e) => {
            const isCurrent = e.version === e.currentLessonVersion;
            return (
              <li
                key={e.versionId}
                className="rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <Link
                        to={`/paths/${e.pathSlug}/lessons/${e.nodeSlug}`}
                        className="font-semibold text-sm hover:underline"
                      >
                        {e.nodeTitle}
                      </Link>
                      <span className="font-mono text-muted-foreground">
                        v{e.version}
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-px rounded bg-primary/10 text-primary">
                          current
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {e.editMessage || (
                        <span className="italic">no edit message</span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {e.editorUsername ? (
                        <>
                          by{" "}
                          <Link
                            to={`/profile/${e.editorUsername}`}
                            className="hover:text-foreground"
                          >
                            @{e.editorUsername}
                          </Link>{" "}
                          ·{" "}
                        </>
                      ) : (
                        <>by deleted user · </>
                      )}
                      {relativeTime(e.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {user && e.version > 1 && (
                      <button
                        onClick={() => revertTo(e)}
                        disabled={reverting === e.versionId}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border hover:bg-accent/40 disabled:opacity-50"
                        title={`Revert to v${e.version - 1}`}
                      >
                        <RotateCcw className="w-3 h-3" strokeWidth={2} />
                        Revert
                      </button>
                    )}
                    {user && (
                      <button
                        onClick={() =>
                          setReporting({ nodeId: e.nodeId, version: e.version })
                        }
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md text-muted-foreground hover:text-destructive"
                        title="Report this edit"
                      >
                        <Flag className="w-3 h-3" strokeWidth={2} />
                        Report
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {reporting && (
        <ReportEditModal
          nodeId={reporting.nodeId}
          version={reporting.version}
          onClose={() => setReporting(null)}
        />
      )}
    </div>
  );
}

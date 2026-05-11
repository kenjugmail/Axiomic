// Sprint 31 — PrereqXray.
//
// Generic X-ray of the current user's mastery state across a set of
// concepts. Drops in above any surface that declares prerequisites
// (capstone brief, research paper, lesson preview). Reads
// /me/prereq-status which colors each concept green / yellow / red
// based on user_progress.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { PrereqXrayEntry } from "@axiomic/types";
import { api } from "../../lib/api";
import { useAuthStore } from "../../stores/auth";

interface Props {
  wikiSlugs: string[];
  className?: string;
}

const STATUS_LABEL: Record<PrereqXrayEntry["status"], string> = {
  mastered: "Mastered",
  in_progress: "Started",
  untouched: "New",
};

const STATUS_CHIP: Record<PrereqXrayEntry["status"], string> = {
  mastered: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  in_progress: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
  untouched: "bg-muted text-muted-foreground border-border",
};

export function PrereqXray({ wikiSlugs, className }: Props) {
  const { user } = useAuthStore();
  const [entries, setEntries] = useState<PrereqXrayEntry[] | null>(null);

  // Extract the join into its own value so the effect's dep array
  // is a simple list, satisfying react-hooks/exhaustive-deps.
  const wikiSlugsKey = wikiSlugs.join(",");

  useEffect(() => {
    if (!user || wikiSlugs.length === 0) {
      setEntries(null);
      return;
    }
    api.me
      .prereqStatus(wikiSlugs)
      .then((r) => setEntries(r.entries))
      .catch(() => setEntries(null));
    // wikiSlugs is the actual data we depend on; wikiSlugsKey is a
    // stable string fingerprint to keep the dep array statically
    // checkable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, wikiSlugsKey]);

  if (wikiSlugs.length === 0) return null;

  return (
    <div className={`rounded-md border border-border p-3 ${className ?? ""}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
        Prerequisite X-ray
      </div>
      {!user ? (
        <p className="text-xs text-muted-foreground">
          Sign in to see your mastery on these concepts.
        </p>
      ) : entries == null ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {entries.map((e) => (
            <li key={e.conceptSlug}>
              <Link
                to={`/wiki/${e.conceptSlug}`}
                className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border ${STATUS_CHIP[e.status]} hover:opacity-80`}
              >
                <span>{e.conceptTitle ?? e.conceptSlug}</span>
                <span className="text-[9px] uppercase tracking-wider opacity-70">
                  {STATUS_LABEL[e.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

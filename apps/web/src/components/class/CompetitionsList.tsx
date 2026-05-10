// S87 — Competitions tab content.

import { useEffect, useState } from "react";
import { Plus, Trophy } from "lucide-react";
import type { ClassRole, CompetitionSummary } from "@axiomic/types";
import { api } from "../../lib/api";
import { Skeleton } from "../ui";
import { CompetitionCard } from "./CompetitionCard";
import { CreateCompetitionDialog } from "./CreateCompetitionDialog";

interface CompetitionsListProps {
  classSlug: string;
  myRole: ClassRole;
}

export function CompetitionsList({ classSlug, myRole }: CompetitionsListProps) {
  const [items, setItems] = useState<CompetitionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const isStaff = myRole === "instructor" || myRole === "ta";

  const reload = async () => {
    try {
      const r = await api.classes.listCompetitions(classSlug);
      setItems(r.competitions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classSlug]);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (items === null) return <Skeleton variant="card" className="h-32" />;

  return (
    <div>
      {isStaff && (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            New competition
          </button>
        </div>
      )}
      {items.length === 0 ? (
        <div className="text-center py-8">
          <Trophy className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            No competitions yet. Run a sprint event with a prize cosmetic for the top finishers.
          </p>
        </div>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-3">
          {items.map((c) => (
            <li key={c.id}>
              <CompetitionCard classSlug={classSlug} competition={c} />
            </li>
          ))}
        </ul>
      )}
      {creating && (
        <CreateCompetitionDialog
          classSlug={classSlug}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

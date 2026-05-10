// S86 — Instructor-facing dialog: pick a cosmetic + write a note +
// grant it to a class member. Used from the leaderboard / roster.

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { PetCosmeticDef } from "@axiomic/types";
import { api, ApiError } from "../../lib/api";
import { CosmeticChip } from "./CosmeticChip";
import { toast } from "../../stores/toast";

interface GrantCosmeticDialogProps {
  classSlug: string;
  recipient: { userId: string; username: string; displayName: string | null };
  onClose: () => void;
  onGranted?: () => void;
}

export function GrantCosmeticDialog({
  classSlug,
  recipient,
  onClose,
  onGranted,
}: GrantCosmeticDialogProps) {
  const [catalog, setCatalog] = useState<PetCosmeticDef[] | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.pet.catalog().then((r) => setCatalog(r.cosmetics));
  }, []);

  const grant = async () => {
    if (!selectedSlug) return;
    setSubmitting(true);
    try {
      const res = await api.classes.grantCosmetic(classSlug, {
        userId: recipient.userId,
        cosmeticSlug: selectedSlug,
        note: note.trim() || undefined,
      });
      if (res.alreadyOwned) {
        toast.info(`${recipient.username} already owned that — note updated.`);
      } else {
        toast.success(`Granted to ${recipient.username}`);
      }
      onGranted?.();
      onClose();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Grant failed";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg border border-border w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">
            Grant cosmetic to{" "}
            <span className="text-foreground">{recipient.displayName || recipient.username}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent/40"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 flex-1">
          {catalog === null ? (
            <p className="text-sm text-muted-foreground">Loading catalog…</p>
          ) : catalog.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cosmetics in the catalog yet.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {catalog.map((c) => (
                <CosmeticChip
                  key={c.slug}
                  slug={c.slug}
                  name={c.name}
                  emoji={c.emoji}
                  slot={c.slot}
                  rarity={c.rarity}
                  description={c.description}
                  selected={selectedSlug === c.slug}
                  onClick={() => setSelectedSlug(c.slug)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border p-4 space-y-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Optional note (e.g. 'Best presentation this week')"
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={grant}
              disabled={!selectedSlug || submitting}
              className="text-xs px-4 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {submitting ? "Granting…" : "Grant"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

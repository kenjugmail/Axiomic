// S87 — Create-competition modal.
// Picks: title, dates, prize cosmetic from catalog, top-N count.

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { PetCosmeticDef } from "@axiomic/types";
import { api, ApiError } from "../../lib/api";
import { CosmeticChip } from "../pet/CosmeticChip";
import { toast } from "../../stores/toast";

interface CreateCompetitionDialogProps {
  classSlug: string;
  onClose: () => void;
  onCreated: () => void;
}

function todayLocalIso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export function CreateCompetitionDialog({ classSlug, onClose, onCreated }: CreateCompetitionDialogProps) {
  const [catalog, setCatalog] = useState<PetCosmeticDef[] | null>(null);
  const [title, setTitle] = useState("");
  const [descriptionMd, setDescriptionMd] = useState("");
  const [startsAtDate, setStartsAtDate] = useState(todayLocalIso(0));
  const [endsAtDate, setEndsAtDate] = useState(todayLocalIso(7));
  const [prizeCosmeticSlug, setPrizeCosmeticSlug] = useState<string | null>(null);
  const [prizeWinnerCount, setPrizeWinnerCount] = useState(3);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.pet.catalog().then((r) => setCatalog(r.cosmetics));
  }, []);

  const canSubmit = useMemo(
    () =>
      title.trim().length > 0 &&
      !!prizeCosmeticSlug &&
      startsAtDate &&
      endsAtDate &&
      Date.parse(`${startsAtDate}T00:00:00Z`) < Date.parse(`${endsAtDate}T23:59:59Z`),
    [title, prizeCosmeticSlug, startsAtDate, endsAtDate],
  );

  const submit = async () => {
    if (!canSubmit || !prizeCosmeticSlug) return;
    setSubmitting(true);
    try {
      await api.classes.createCompetition(classSlug, {
        title: title.trim(),
        descriptionMd: descriptionMd.trim(),
        startsAt: new Date(`${startsAtDate}T00:00:00`).toISOString(),
        endsAt: new Date(`${endsAtDate}T23:59:59`).toISOString(),
        prizeCosmeticSlug,
        prizeWinnerCount,
      });
      toast.success("Draft created. Publish to start the event.");
      onCreated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg border border-border w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">New competition</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent/40"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 flex-1 space-y-3">
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Spring Sprint Challenge"
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts">
              <input
                type="date"
                value={startsAtDate}
                onChange={(e) => setStartsAtDate(e.target.value)}
                className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
              />
            </Field>
            <Field label="Ends">
              <input
                type="date"
                value={endsAtDate}
                onChange={(e) => setEndsAtDate(e.target.value)}
                className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
              />
            </Field>
          </div>
          <Field label="Description (markdown, optional)">
            <textarea
              value={descriptionMd}
              onChange={(e) => setDescriptionMd(e.target.value)}
              rows={3}
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
            />
          </Field>
          <Field label="Top-N winners">
            <input
              type="number"
              min={1}
              max={20}
              value={prizeWinnerCount}
              onChange={(e) => setPrizeWinnerCount(parseInt(e.target.value, 10) || 3)}
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
            />
          </Field>
          <Field label="Prize cosmetic (each winner gets one)">
            <div className="grid sm:grid-cols-2 gap-2 mt-1">
              {catalog === null ? (
                <p className="text-xs text-muted-foreground">Loading catalog…</p>
              ) : (
                catalog.map((c) => (
                  <CosmeticChip
                    key={c.slug}
                    slug={c.slug}
                    name={c.name}
                    emoji={c.emoji}
                    slot={c.slot}
                    rarity={c.rarity}
                    description={c.description}
                    selected={prizeCosmeticSlug === c.slug}
                    onClick={() => setPrizeCosmeticSlug(c.slug)}
                  />
                ))
              )}
            </div>
          </Field>
        </div>

        <div className="border-t border-border p-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit || submitting}
            className="text-xs px-4 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting ? "Creating…" : "Create draft"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
        {label}
      </span>
      {children}
    </label>
  );
}

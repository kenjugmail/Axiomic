// Phase 28C — post a research bounty. Single short form; the
// poster reviews + accepts submissions on the detail page.

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, Target } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { toast } from "../stores/toast";

const KINDS: Array<{
  value: "reproduce" | "extend" | "analyze" | "other";
  label: string;
  hint: string;
}> = [
  {
    value: "reproduce",
    label: "Reproduce",
    hint: "Re-run an experiment and confirm (or refute) a result.",
  },
  {
    value: "extend",
    label: "Extend",
    hint: "Build on a method — new dataset, ablation, variant.",
  },
  {
    value: "analyze",
    label: "Analyze",
    hint: "Dig into data / a paper and surface an insight.",
  },
  { value: "other", label: "Other", hint: "Anything else research-y." },
];

export function BountyNewPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [descriptionMd, setDescriptionMd] = useState("");
  const [kind, setKind] = useState<
    "reproduce" | "extend" | "analyze" | "other"
  >("reproduce");
  const [rewardXp, setRewardXp] = useState(150);
  const [rewardBadgeSlug, setRewardBadgeSlug] = useState("");
  const [maxClaimants, setMaxClaimants] = useState(1);
  const [deadlineAt, setDeadlineAt] = useState("");
  const [busy, setBusy] = useState(false);

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Sign in to post a research bounty.
        </p>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug.trim() || !title.trim()) return;
    setBusy(true);
    try {
      const r = await api.bounties.create({
        slug: slug.trim(),
        title: title.trim(),
        descriptionMd,
        kind,
        rewardXp,
        rewardBadgeSlug: rewardBadgeSlug.trim() || null,
        maxClaimants,
        deadlineAt: deadlineAt ? new Date(deadlineAt).toISOString() : null,
      });
      toast.success("Bounty posted.");
      navigate(`/bounties/${r.slug}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link
        to="/bounties"
        className="text-sm text-primary hover:underline inline-flex items-center gap-1"
      >
        <ChevronLeft className="w-3 h-3" /> Back to bounties
      </Link>
      <h1 className="mt-3 mb-6 font-display text-2xl font-semibold tracking-tight inline-flex items-center gap-2">
        <Target className="w-6 h-6 text-primary" />
        Post a research bounty
      </h1>

      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Slug (kebab-case, unique)">
            <input
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="reproduce-attention-2017"
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
            />
          </Field>
          <Field label="Reward XP">
            <input
              type="number"
              min={0}
              max={5000}
              value={rewardXp}
              onChange={(e) =>
                setRewardXp(
                  Math.max(0, Math.min(5000, parseInt(e.target.value, 10) || 0)),
                )
              }
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
            />
          </Field>
        </div>

        <Field label="Title">
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Reproduce the headline result from 'Attention is all you need'"
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
          />
        </Field>

        <fieldset className="space-y-2 border border-border rounded-md p-3">
          <legend className="text-[10px] uppercase tracking-wider text-muted-foreground px-1">
            Kind of work
          </legend>
          {KINDS.map((k) => (
            <label key={k.value} className="block text-sm">
              <input
                type="radio"
                name="kind"
                value={k.value}
                checked={kind === k.value}
                onChange={() => setKind(k.value)}
                className="mr-2"
              />
              <strong>{k.label}</strong>
              <span className="text-muted-foreground"> — {k.hint}</span>
            </label>
          ))}
        </fieldset>

        <Field label="Description (markdown) — what success looks like">
          <textarea
            value={descriptionMd}
            onChange={(e) => setDescriptionMd(e.target.value)}
            rows={7}
            placeholder={
              "Link the paper / dataset. Spell out the exact deliverable: what to produce, what counts as done, what evidence you expect (a notebook, a plot, a writeup)."
            }
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Max claimants">
            <input
              type="number"
              min={1}
              max={20}
              value={maxClaimants}
              onChange={(e) =>
                setMaxClaimants(
                  Math.max(
                    1,
                    Math.min(20, parseInt(e.target.value, 10) || 1),
                  ),
                )
              }
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
            />
          </Field>
          <Field label="Badge slug (optional)">
            <input
              value={rewardBadgeSlug}
              onChange={(e) => setRewardBadgeSlug(e.target.value)}
              placeholder="reproducer"
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
            />
          </Field>
          <Field label="Deadline (optional)">
            <input
              type="datetime-local"
              value={deadlineAt}
              onChange={(e) => setDeadlineAt(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
            />
          </Field>
        </div>

        <div className="text-xs text-muted-foreground bg-muted/30 border border-border rounded-md p-3">
          <strong>Next:</strong> claimants submit a writeup + artifact
          links on the bounty page. You review and accept — accepting
          mints them a signed "Bounty completed" credential plus XP and
          the optional badge.
        </div>

        <div className="flex justify-end gap-2">
          <Link
            to="/bounties"
            className="text-sm px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={busy || !slug.trim() || !title.trim()}
            className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Posting…" : "Post bounty"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

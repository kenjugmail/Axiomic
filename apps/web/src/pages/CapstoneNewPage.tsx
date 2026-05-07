// Sprint 26 — Create a new capstone (form scaffolding only).
// The detailed milestone + rubric editor lives on the edit page.

import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { CreateCapstoneRequest } from "@axiomic/types";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";

export function CapstoneNewPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [data, setData] = useState<CreateCapstoneRequest>({
    slug: "",
    title: "",
    summary: "",
    contentUndergrad: "",
    estimatedWeeks: 6,
    coverEmoji: "🎓",
    accentColor: "violet",
    canonicalTier: "undergrad",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">Sign in to author a capstone.</p>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.capstones.create(data);
      navigate(`/capstones/${res.slug}/edit`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create capstone";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="font-display text-2xl font-semibold tracking-tight mb-1">
        New capstone
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Start with the brief; you'll add milestones + rubrics on the edit page.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Slug">
          <input
            value={data.slug}
            onChange={(e) => setData({ ...data, slug: e.target.value })}
            required
            pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
            placeholder="transformer-from-scratch"
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
          />
        </Field>
        <Field label="Title">
          <input
            value={data.title}
            onChange={(e) => setData({ ...data, title: e.target.value })}
            required
            placeholder="Build a transformer from scratch"
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
          />
        </Field>
        <Field label="One-line summary">
          <input
            value={data.summary ?? ""}
            onChange={(e) => setData({ ...data, summary: e.target.value })}
            placeholder="Implement a 2-layer transformer end-to-end."
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
          />
        </Field>
        <Field label="Brief (undergrad tier)">
          <textarea
            value={data.contentUndergrad ?? ""}
            onChange={(e) => setData({ ...data, contentUndergrad: e.target.value })}
            rows={8}
            required
            placeholder="## What you'll build\n\nDescribe the project, what it teaches, and why it matters."
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Estimated weeks">
            <input
              type="number"
              value={data.estimatedWeeks ?? 6}
              min={1}
              max={52}
              onChange={(e) =>
                setData({ ...data, estimatedWeeks: parseInt(e.target.value, 10) || 6 })
              }
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
            />
          </Field>
          <Field label="Cover emoji">
            <input
              value={data.coverEmoji ?? "🎓"}
              onChange={(e) => setData({ ...data, coverEmoji: e.target.value })}
              maxLength={4}
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
            />
          </Field>
        </div>

        {error && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting ? "Creating…" : "Create capstone"}
          </button>
        </div>
      </form>
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

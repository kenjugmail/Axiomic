// S86 — "My classes": split between teaching + enrolled, plus a
// join-by-code form. The single entry point for the gamification
// loop from the global nav.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GraduationCap, Plus, KeyRound, BookOpen } from "lucide-react";
import type { ClassSummary } from "@axiomic/types";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";
import { toast } from "../stores/toast";

export function ClassesListPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [teaching, setTeaching] = useState<ClassSummary[] | null>(null);
  const [enrolled, setEnrolled] = useState<ClassSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.classes
      .list()
      .then((r) => {
        setTeaching(r.teaching);
        setEnrolled(r.enrolled);
      })
      .catch((e) => setError(e?.message ?? "Failed to load classes"));
  }, [user]);

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">Sign in to use classes.</p>
        <Link
          to="/login?redirect=/classes"
          className="text-sm text-primary hover:underline mt-4 inline-block"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Classes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            College classes you teach or are enrolled in. Earn XP, hatch a pet,
            climb the leaderboard.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            to="/classes/discover"
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 inline-flex items-center gap-1.5"
          >
            Discover
          </Link>
          <button
            type="button"
            onClick={() => setJoinOpen(true)}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 inline-flex items-center gap-1.5"
          >
            <KeyRound className="w-3.5 h-3.5" />
            Join by code
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 font-medium"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            New class
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm mb-4">
          {error}
        </div>
      )}

      {teaching === null || enrolled === null ? (
        <div className="grid sm:grid-cols-2 gap-3">
          <Skeleton variant="card" className="h-32" />
          <Skeleton variant="card" className="h-32" />
        </div>
      ) : (
        <>
          <Section title="Teaching" emptyText="You're not teaching anything yet." classes={teaching} />
          <Section
            title="Enrolled"
            emptyText="You're not enrolled in any classes yet — join one with a code from your professor."
            classes={enrolled}
          />
        </>
      )}

      <p className="text-xs text-muted-foreground mt-10">
        Pets live at <Link to="/me/pet" className="text-primary hover:underline">/me/pet</Link>.
      </p>

      {createOpen && (
        <CreateClassDialog
          onClose={() => setCreateOpen(false)}
          onCreated={(slug) => navigate(`/classes/${slug}`)}
        />
      )}
      {joinOpen && (
        <JoinClassDialog
          onClose={() => setJoinOpen(false)}
          onJoined={(slug) => navigate(`/classes/${slug}`)}
        />
      )}
    </div>
  );
}

function Section({
  title,
  emptyText,
  classes,
}: {
  title: string;
  emptyText: string;
  classes: ClassSummary[];
}) {
  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold mb-3 inline-flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-primary" />
        {title}
      </h2>
      {classes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-3">
          {classes.map((c) => (
            <li key={c.id}>
              <Link
                to={`/classes/${c.slug}`}
                className="block p-4 rounded-md border border-border hover:shadow-soft transition-shadow"
              >
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  <span>{c.role}</span>
                  {c.term && <span>· {c.term}</span>}
                  {c.status === "archived" && <span className="text-amber-500">· archived</span>}
                </div>
                <h3 className="text-sm font-medium leading-snug">{c.title}</h3>
                {c.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {c.description}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CreateClassDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (slug: string) => void;
}) {
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [term, setTerm] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!slug.trim() || !title.trim()) return;
    setSubmitting(true);
    try {
      const res = await api.classes.create({
        slug: slug.trim(),
        title: title.trim(),
        term: term.trim(),
        description: description.trim(),
      });
      toast.success(`Class created. Join code: ${res.joinCode}`, undefined, 8000);
      onCreated(res.slug);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Create failed";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Create a class" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Slug (URL-friendly identifier)">
          <input
            value={slug}
            onChange={(e) =>
              setSlug(
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9-]/g, "-")
                  .replace(/-+/g, "-"),
              )
            }
            placeholder="cs101-fall-2026"
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
          />
        </Field>
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Intro to Machine Learning"
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
          />
        </Field>
        <Field label="Term">
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Fall 2026"
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
          />
        </Field>
        <Field label="One-line description (optional)">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
          />
        </Field>
      </div>
      <DialogActions
        onCancel={onClose}
        onConfirm={submit}
        confirmLabel={submitting ? "Creating…" : "Create"}
        confirmDisabled={!slug.trim() || !title.trim() || submitting}
      />
    </Modal>
  );
}

function JoinClassDialog({
  onClose,
  onJoined,
}: {
  onClose: () => void;
  onJoined: (slug: string) => void;
}) {
  const [slug, setSlug] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!slug.trim() || !joinCode.trim()) return;
    setSubmitting(true);
    try {
      await api.classes.enroll(slug.trim(), joinCode.trim());
      toast.success("Joined!");
      onJoined(slug.trim());
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Join failed";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Join a class" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Class slug (from your professor)">
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            placeholder="cs101-fall-2026"
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
          />
        </Field>
        <Field label="Join code">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="ABC23DEF"
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
          />
        </Field>
      </div>
      <DialogActions
        onCancel={onClose}
        onConfirm={submit}
        confirmLabel={submitting ? "Joining…" : "Join"}
        confirmDisabled={!slug.trim() || !joinCode.trim() || submitting}
      />
    </Modal>
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

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg border border-border w-full max-w-md">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold inline-flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-primary" />
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function DialogActions({
  onCancel,
  onConfirm,
  confirmLabel,
  confirmDisabled,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirmDisabled?: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 mt-4">
      <button
        type="button"
        onClick={onCancel}
        className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={confirmDisabled}
        className="text-xs px-4 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {confirmLabel}
      </button>
    </div>
  );
}

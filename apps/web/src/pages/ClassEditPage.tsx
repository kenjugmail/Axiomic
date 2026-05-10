// S86 — Class metadata + syllabus editor + join-code rotation.

import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import type { ClassDetailResponse, ClassStatus } from "@axiomic/types";
import { api, ApiError } from "../lib/api";
import { Skeleton } from "../components/ui";
import { toast } from "../stores/toast";

export function ClassEditPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<ClassDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [term, setTerm] = useState("");
  const [description, setDescription] = useState("");
  const [syllabusMd, setSyllabusMd] = useState("");
  const [welcomeMessageMd, setWelcomeMessageMd] = useState("");
  const [discoverable, setDiscoverable] = useState(false);
  const [status, setStatus] = useState<ClassStatus>("active");
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    api.classes
      .get(slug)
      .then((r) => {
        setData(r);
        setTitle(r.class.title);
        setTerm(r.class.term);
        setDescription(r.class.description);
        setSyllabusMd(r.class.syllabusMd);
        setWelcomeMessageMd(r.class.welcomeMessageMd ?? "");
        setDiscoverable(!!r.class.discoverable);
        setStatus(r.class.status);
      })
      .catch((e) => setError(e?.message ?? "Failed to load class"));
  }, [slug]);

  const save = async () => {
    setSaving(true);
    try {
      await api.classes.update(slug, {
        title,
        term,
        description,
        syllabusMd,
        welcomeMessageMd,
        discoverable,
        status,
      });
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const rotate = async () => {
    if (!confirm("Generate a new join code? The old one stops working immediately.")) return;
    setRotating(true);
    try {
      const r = await api.classes.rotateCode(slug);
      toast.success(`New join code: ${r.joinCode}`, undefined, 8000);
      const fresh = await api.classes.get(slug);
      setData(fresh);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Rotate failed");
    } finally {
      setRotating(false);
    }
  };

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Skeleton variant="card" className="h-32 mb-6" />
        <Skeleton variant="card" className="h-72" />
      </div>
    );
  }

  if (data.myRole !== "instructor") {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">Only the instructor can edit this class.</p>
        <Link
          to={`/classes/${slug}`}
          className="text-sm text-primary hover:underline mt-4 inline-block"
        >
          Back to class
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="text-xs text-muted-foreground mb-3">
        <Link to="/classes" className="hover:text-foreground">Classes</Link>
        {" / "}
        <Link to={`/classes/${slug}`} className="hover:text-foreground">{data.class.title}</Link>
        {" / edit"}
      </div>
      <h1 className="font-display text-2xl font-semibold tracking-tight mb-6">Edit class</h1>

      <section className="space-y-3 mb-6">
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Term">
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Fall 2026"
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
            />
          </Field>
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ClassStatus)}
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={discoverable}
            onChange={(e) => setDiscoverable(e.target.checked)}
            className="rounded border-border"
          />
          <span>List this class on the public directory at <code className="text-xs">/classes/discover</code></span>
        </label>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
          />
        </Field>
        <Field label="Welcome message (markdown, shown to all members at the top of the class page)">
          <textarea
            value={welcomeMessageMd}
            onChange={(e) => setWelcomeMessageMd(e.target.value)}
            rows={4}
            placeholder="Welcome to the class! …"
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
          />
        </Field>
        <Field label="Syllabus (markdown)">
          <textarea
            value={syllabusMd}
            onChange={(e) => setSyllabusMd(e.target.value)}
            rows={12}
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
          />
        </Field>
      </section>

      <section className="rounded-md border border-border p-3 mb-6 bg-muted/20">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-medium">Join code</div>
            <div className="text-[11px] text-muted-foreground">
              Share with students so they can enroll. Rotating it invalidates the old code.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm bg-background border border-border px-3 py-1.5 rounded">
              {data.class.joinCode || "—"}
            </span>
            <button
              type="button"
              onClick={rotate}
              disabled={rotating}
              className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {rotating ? "Rotating…" : "Rotate"}
            </button>
          </div>
        </div>
      </section>

      <div className="flex justify-between">
        <button
          type="button"
          onClick={() => navigate(`/classes/${slug}`)}
          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
        >
          Back
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
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

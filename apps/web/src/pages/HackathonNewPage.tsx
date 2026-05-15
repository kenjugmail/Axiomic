// Phase 27D — host a hackathon. Single-page form covering
// basics → host mode → schedule → judging. Prizes are managed
// on the detail page after create so the form stays short. AI
// rubric configuration is also deferred to the detail page; v1
// create supports manual judging out of the box.

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, Trophy } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { toast } from "../stores/toast";

const FIELD_SUGGESTIONS = [
  "cs",
  "ml",
  "math",
  "physics",
  "bio",
  "design",
  "robotics",
  "embedded",
  "data-science",
  "other",
];

export function HackathonNewPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [descriptionMd, setDescriptionMd] = useState("");
  const [rulesMd, setRulesMd] = useState("");
  const [fieldTag, setFieldTag] = useState("cs");
  const [coverEmoji, setCoverEmoji] = useState("🏆");
  const [hostMode, setHostMode] = useState<"public" | "class" | "cohort">(
    "public",
  );
  const [hostClassSlug, setHostClassSlug] = useState("");
  const [hostCohortSlug, setHostCohortSlug] = useState("");
  const [maxTeamSize, setMaxTeamSize] = useState(4);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Sign in to host a hackathon.
        </p>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug.trim() || !title.trim()) return;
    setBusy(true);
    try {
      const r = await api.hackathons.create({
        slug: slug.trim(),
        title: title.trim(),
        descriptionMd,
        rulesMd,
        fieldTag,
        coverEmoji,
        hostMode,
        hostClassSlug: hostMode === "class" ? hostClassSlug.trim() : null,
        hostCohortSlug: hostMode === "cohort" ? hostCohortSlug.trim() : null,
        maxTeamSize,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      });
      toast.success("Hackathon created — add prizes next.");
      navigate(`/hackathons/${r.slug}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link
        to="/hackathons"
        className="text-sm text-primary hover:underline inline-flex items-center gap-1"
      >
        <ChevronLeft className="w-3 h-3" /> Back to hackathons
      </Link>
      <h1 className="mt-3 mb-6 font-display text-2xl font-semibold tracking-tight inline-flex items-center gap-2">
        <Trophy className="w-6 h-6 text-primary" />
        Host a hackathon
      </h1>

      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Slug (kebab-case, unique)">
            <input
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="ml-fall-2026"
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
            />
          </Field>
          <Field label="Cover emoji">
            <input
              value={coverEmoji}
              onChange={(e) => setCoverEmoji(e.target.value.slice(0, 4))}
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
            />
          </Field>
        </div>

        <Field label="Title">
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Build a transformer from scratch — Fall 2026"
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
          />
        </Field>

        <Field label="Field">
          <input
            list="field-suggestions"
            value={fieldTag}
            onChange={(e) => setFieldTag(e.target.value)}
            placeholder="cs, math, bio, design, …"
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
          />
          <datalist id="field-suggestions">
            {FIELD_SUGGESTIONS.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
          <span className="text-[10px] text-muted-foreground mt-1 block">
            Free-form. The above are suggestions; type anything.
          </span>
        </Field>

        <Field label="Description (markdown)">
          <textarea
            value={descriptionMd}
            onChange={(e) => setDescriptionMd(e.target.value)}
            rows={5}
            placeholder="What the hackathon's about, who it's for, what success looks like."
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
          />
        </Field>

        <Field label="Rules (markdown, optional)">
          <textarea
            value={rulesMd}
            onChange={(e) => setRulesMd(e.target.value)}
            rows={3}
            placeholder="Eligibility, allowed libraries, code-of-conduct, etc."
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
          />
        </Field>

        <fieldset className="space-y-2 border border-border rounded-md p-3">
          <legend className="text-[10px] uppercase tracking-wider text-muted-foreground px-1">
            Who can join
          </legend>
          <label className="block text-sm">
            <input
              type="radio"
              name="hostMode"
              value="public"
              checked={hostMode === "public"}
              onChange={() => setHostMode("public")}
              className="mr-2"
            />
            Public — anyone with the link or via /hackathons/discover.
          </label>
          <label className="block text-sm">
            <input
              type="radio"
              name="hostMode"
              value="class"
              checked={hostMode === "class"}
              onChange={() => setHostMode("class")}
              className="mr-2"
            />
            One of my classes (instructor only)
          </label>
          {hostMode === "class" && (
            <input
              value={hostClassSlug}
              onChange={(e) => setHostClassSlug(e.target.value)}
              placeholder="class slug (you must be the instructor)"
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono ml-6"
              style={{ width: "calc(100% - 1.5rem)" }}
            />
          )}
          <label className="block text-sm">
            <input
              type="radio"
              name="hostMode"
              value="cohort"
              checked={hostMode === "cohort"}
              onChange={() => setHostMode("cohort")}
              className="mr-2"
            />
            One of my cohorts (organizer only)
          </label>
          {hostMode === "cohort" && (
            <input
              value={hostCohortSlug}
              onChange={(e) => setHostCohortSlug(e.target.value)}
              placeholder="cohort slug (you must be the creator)"
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono ml-6"
              style={{ width: "calc(100% - 1.5rem)" }}
            />
          )}
        </fieldset>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Max team size (1 = solo only)">
            <input
              type="number"
              min={1}
              max={10}
              value={maxTeamSize}
              onChange={(e) =>
                setMaxTeamSize(
                  Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)),
                )
              }
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
            />
          </Field>
          <Field label="Starts at">
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
            />
          </Field>
          <Field label="Ends at">
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
            />
          </Field>
        </div>

        <div className="text-xs text-muted-foreground bg-muted/30 border border-border rounded-md p-3">
          <strong>Next:</strong> after you create the hackathon, you'll
          land on its detail page where you can add prize tiers
          (XP + pet cosmetics/skins + badges) and publish it.
        </div>

        <div className="flex justify-end gap-2">
          <Link
            to="/hackathons"
            className="text-sm px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={busy || !slug.trim() || !title.trim()}
            className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Creating…" : "Create draft"}
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

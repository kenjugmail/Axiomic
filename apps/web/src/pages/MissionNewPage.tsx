// Phase 39 — create a "Goodness" mission.
//
// Any signed-in user can frame a problem. The creator is auto-
// joined as the organizer (server-side). Links + writeups only —
// no uploads — so there is no file affordance here.

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Globe } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { toast } from "../stores/toast";

export function MissionNewPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [theme, setTheme] = useState("climate");
  const [summaryMd, setSummaryMd] = useState("");
  const [problemMd, setProblemMd] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <Globe
          className="w-10 h-10 mx-auto mb-3 text-muted-foreground"
          strokeWidth={1.5}
        />
        <h1 className="font-display text-2xl font-semibold tracking-tight mb-2">
          Start a mission
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          Sign in to frame a problem worth solving together.
        </p>
        <Link
          to="/login"
          className="inline-block text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const topicTags = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 12);
      const r = await api.missions.create({
        title: title.trim(),
        theme: theme.trim() || "other",
        summaryMd: summaryMd.trim(),
        problemMd: problemMd.trim(),
        topicTags,
      });
      toast.success("Mission created.");
      navigate(`/missions/${r.slug}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
          <Globe className="w-7 h-7 text-primary" />
          Start a mission
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-prose">
          Frame a big real-world problem and decompose it into
          sub-problems. Missions are open — anyone can join and
          contribute. You'll be the organizer.
        </p>
      </header>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            minLength={4}
            maxLength={160}
            placeholder="e.g. Cut smallholder post-harvest loss in the Sahel"
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Theme</label>
          <input
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            maxLength={60}
            placeholder="climate · poverty · health · hunger · other"
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            One-line summary
          </label>
          <input
            value={summaryMd}
            onChange={(e) => setSummaryMd(e.target.value)}
            maxLength={4000}
            placeholder="The short pitch shown in the mission list."
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            The problem (markdown)
          </label>
          <textarea
            value={problemMd}
            onChange={(e) => setProblemMd(e.target.value)}
            rows={8}
            maxLength={20000}
            placeholder="Describe the problem, why it matters, what good evidence looks like, and how contributions get verified."
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Topic tags (comma-separated)
          </label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="agriculture, supply-chain, remote-sensing"
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Link
            to="/missions"
            className="text-sm px-4 py-2 rounded-md border border-border hover:bg-accent/40"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={busy || title.trim().length < 4}
            className="text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create mission"}
          </button>
        </div>
      </form>
    </div>
  );
}

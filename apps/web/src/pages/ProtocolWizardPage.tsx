import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, Square } from "lucide-react";
import type { LabDiscipline } from "@axiomic/types";
import { useAuthStore } from "../stores/auth";
import { streamTokens } from "../lib/streamTokens";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { DISCIPLINE_LABEL } from "../components/lab/DisciplineFilterChips";

const DISCIPLINES: LabDiscipline[] = [
  "biology",
  "chemistry",
  "mechanical",
  "electrical",
  "materials",
  "cs-lab",
  "physics",
];

// A draft body looks like:
//   "<summary paragraph>\n\n## Hazards\n... \n\n## Steps\n1. <Title>\n<body>\n*verify:*\n2. ..."
// We try to parse it into protocol fields the editor can pre-fill.
interface ParsedDraft {
  summary: string;
  hazardsMd: string;
  bodyMd: string;
  steps: Array<{ title: string; instructionMd: string; verificationMd: string }>;
}

function parseDraft(text: string): ParsedDraft {
  const lines = text.split("\n");
  let summary = "";
  let hazardsMd = "";
  let stepsBlock = "";
  let phase: "summary" | "hazards" | "steps" | "other" = "summary";
  for (const line of lines) {
    const lower = line.trim().toLowerCase();
    if (lower.startsWith("## hazards")) {
      phase = "hazards";
      continue;
    }
    if (lower.startsWith("## steps") || lower.startsWith("## procedure")) {
      phase = "steps";
      continue;
    }
    if (lower.startsWith("## ")) {
      phase = "other";
      continue;
    }
    if (phase === "summary") {
      summary += (summary ? "\n" : "") + line;
    } else if (phase === "hazards") {
      hazardsMd += (hazardsMd ? "\n" : "") + line;
    } else if (phase === "steps") {
      stepsBlock += (stepsBlock ? "\n" : "") + line;
    }
  }
  // Parse step block: split on lines starting with "<n>." or "**<n>."
  const stepRegex = /^\s*(?:\*\*)?(\d+)\.\s+(.+?)\*?\*?\s*$/;
  const rawSteps: Array<{ title: string; body: string[] }> = [];
  let current: { title: string; body: string[] } | null = null;
  for (const line of stepsBlock.split("\n")) {
    const m = line.match(stepRegex);
    if (m) {
      if (current) rawSteps.push(current);
      current = { title: m[2].trim(), body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) rawSteps.push(current);

  const steps = rawSteps.map((s) => {
    const verifyIdx = s.body.findIndex((b) =>
      /^\s*\*?\*?verify:?/i.test(b),
    );
    let body: string[];
    let verify = "";
    if (verifyIdx >= 0) {
      body = s.body.slice(0, verifyIdx);
      verify = s.body
        .slice(verifyIdx)
        .join(" ")
        .replace(/\*?\*?verify:?\*?\*?/i, "")
        .trim();
    } else {
      body = s.body;
    }
    return {
      title: s.title,
      instructionMd: body.join("\n").trim(),
      verificationMd: verify,
    };
  });

  return {
    summary: summary.trim().slice(0, 500),
    hazardsMd: hazardsMd.trim(),
    bodyMd: text,
    steps,
  };
}

export function ProtocolWizardPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [spec, setSpec] = useState("");
  const [discipline, setDiscipline] = useState<LabDiscipline>("biology");
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleStream = async () => {
    if (!spec.trim()) return;
    setError(null);
    setDraft("");
    setStreaming(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const result = await streamTokens({
        url: "/api/v1/ai/lab/draft-protocol",
        body: { spec, discipline },
        signal: ctrl.signal,
        onToken: (_, acc) => setDraft(acc),
      });
      if (!result.ok && result.error) {
        setError(result.error);
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        setError((err as Error)?.message ?? "Stream failed");
      }
    } finally {
      setStreaming(false);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  const handleUseDraft = () => {
    const parsed = parseDraft(draft);
    navigate("/lab/protocols/new", {
      state: {
        prefill: {
          discipline,
          summary: parsed.summary,
          hazardsMd: parsed.hazardsMd,
          contentUndergrad: parsed.bodyMd,
          steps: parsed.steps,
        },
      },
    });
  };

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <p className="text-muted-foreground">
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>{" "}
          to draft a protocol with AI.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <Link
        to="/lab/protocols"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} />
        Protocols
      </Link>

      <header className="mt-3 mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight flex items-center gap-2">
          <Sparkles
            className="w-7 h-7 text-amber-500"
            strokeWidth={1.75}
          />
          Draft a protocol with AI
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Give the model a one-line spec ("agarose gel for restriction
          digest"). It returns a 5-step draft you can edit before
          publishing. Always review the safety section before saving.
        </p>
      </header>

      <div className="space-y-3 mb-5">
        <div className="grid sm:grid-cols-[1fr_auto] gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              One-line spec
            </label>
            <input
              type="text"
              value={spec}
              onChange={(e) => setSpec(e.target.value)}
              disabled={streaming}
              placeholder="agarose gel for restriction digest"
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Discipline
            </label>
            <select
              value={discipline}
              onChange={(e) =>
                setDiscipline(e.target.value as LabDiscipline)
              }
              disabled={streaming}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            >
              {DISCIPLINES.map((d) => (
                <option key={d} value={d}>
                  {DISCIPLINE_LABEL[d]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {streaming ? (
            <button
              type="button"
              onClick={handleStop}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent/40"
            >
              <Square className="w-3.5 h-3.5" strokeWidth={2} />
              Stop
            </button>
          ) : (
            <button
              type="button"
              disabled={!spec.trim()}
              onClick={handleStream}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
              Draft
            </button>
          )}
          {draft && !streaming && (
            <button
              type="button"
              onClick={handleUseDraft}
              className="px-3 py-1.5 rounded-md border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 text-sm hover:bg-emerald-500/10"
            >
              Use this draft → editor
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>

      {(draft || streaming) && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Draft preview
          </h2>
          <div className="rounded-lg border border-border bg-card p-4 min-h-[16rem]">
            {draft ? (
              <MarkdownRenderer content={draft} />
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Streaming…
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

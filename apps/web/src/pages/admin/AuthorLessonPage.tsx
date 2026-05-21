import { useEffect, useMemo, useState } from "react";
import { Sparkles, AlertTriangle, Check, Copy, Save } from "lucide-react";
import { api, type MasteryPath } from "../../lib/api";
import { PreviewViz } from "../../components/lesson/PreviewViz";

// AI-assisted lesson authoring. Author enters a node slug + topic +
// objectives; the server calls the configured AI provider, generates
// a lesson JSON, validates against the canonical schema, and returns
// it. We render the raw JSON + a live PreviewViz for any embedded viz.
// "Save to file" is left as a copy-paste step (writing arbitrary files
// from a web route would need explicit admin auth + an allowlist).

interface AuthorResponse {
  lesson?: unknown;
  warnings?: string[];
  valid?: boolean;
  error?: string;
  rawOutput?: string;
}

export function AuthorLessonPage() {
  const [paths, setPaths] = useState<MasteryPath[]>([]);
  const [pathSlug, setPathSlug] = useState("");
  const [nodeSlug, setNodeSlug] = useState("");
  const [topic, setTopic] = useState("");
  const [objectivesText, setObjectivesText] = useState("");
  const [difficulty, setDifficulty] = useState<"intro" | "intermediate" | "advanced" | "expert">("advanced");
  const [timeMinutes, setTimeMinutes] = useState(22);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AuthorResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [partial, setPartial] = useState("");

  useEffect(() => {
    api.mastery.getPaths().then((d) => setPaths(d.paths)).catch(() => undefined);
  }, []);

  const objectives = useMemo(
    () =>
      objectivesText
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    [objectivesText],
  );

  const canSubmit =
    nodeSlug.match(/^[a-z][a-z0-9-]*$/) &&
    topic.length >= 10 &&
    objectives.length >= 1 &&
    objectives.length <= 8 &&
    !busy;

  async function generate() {
    setBusy(true);
    setResult(null);
    setPartial("");
    const body = JSON.stringify({
      nodeSlug,
      pathSlug: pathSlug || undefined,
      topic,
      objectives,
      difficulty,
      timeMinutes,
    });
    try {
      if (streaming) {
        const res = await fetch("/api/v1/authoring/lesson/stream", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        });
        if (!res.body) throw new Error("stream not supported in this browser");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let acc = "";
        // SSE frames are delimited by \n\n; each frame starts with "data: "
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const line = frame.trim();
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice("data: ".length);
            try {
              const parsed = JSON.parse(payload);
              if (parsed.token) {
                acc += parsed.token;
                setPartial(acc);
              } else if (parsed.done) {
                setResult({
                  lesson: parsed.lesson,
                  warnings: parsed.warnings,
                  valid: parsed.valid,
                });
              } else if (parsed.error) {
                setResult({ error: parsed.error, rawOutput: parsed.rawOutput });
              }
            } catch {
              void 0;
            }
          }
        }
      } else {
        const res = await fetch("/api/v1/authoring/lesson", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        });
        const data = (await res.json()) as AuthorResponse;
        setResult(data);
      }
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "request failed" });
    } finally {
      setBusy(false);
    }
  }

  const lessonJSON = useMemo(() => {
    if (!result?.lesson) return "";
    return JSON.stringify(result.lesson, null, 2);
  }, [result]);

  // If the generated lesson embeds a viz on any text slide, surface
  // the first one for live preview.
  const previewViz = useMemo(() => {
    if (!result?.lesson || typeof result.lesson !== "object") return null;
    const lesson = result.lesson as { slides?: Array<{ kind?: string; viz?: string; vizProps?: Record<string, unknown> }> };
    const slide = lesson.slides?.find((s) => s.viz);
    if (!slide) return null;
    return { name: slide.viz!, props: slide.vizProps };
  }, [result]);

  function copy() {
    if (lessonJSON) void navigator.clipboard?.writeText(lessonJSON);
  }

  async function saveToFile(overwrite = false) {
    if (!result?.lesson || !result.valid) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/v1/authoring/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nodeSlug, lesson: result.lesson, overwrite }),
      });
      const data = await res.json();
      if (res.ok) {
        setSaveMsg({ kind: "ok", text: `Wrote ${data.path} (${data.bytes} bytes)` });
      } else if (res.status === 409) {
        if (window.confirm(`${data.error} Overwrite?`)) {
          await saveToFile(true);
          return;
        }
      } else {
        setSaveMsg({ kind: "err", text: data.error ?? `HTTP ${res.status}` });
      }
    } catch (err) {
      setSaveMsg({ kind: "err", text: err instanceof Error ? err.message : "request failed" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" /> Author a lesson
        </h1>
        <p className="text-muted-foreground">
          Generate a canonical-schema lesson JSON from a topic + objectives. The output is validated against the same schema that gates every lesson in seed-content/lessons/. Copy the JSON to a new file once it looks right.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: form */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Path (optional)</label>
            <select
              value={pathSlug}
              onChange={(e) => setPathSlug(e.target.value)}
              className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
            >
              <option value="">— none —</option>
              {paths.map((p) => (
                <option key={p.id} value={p.slug}>{p.title} ({p.slug})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Node slug *</label>
            <input
              type="text"
              value={nodeSlug}
              onChange={(e) => setNodeSlug(e.target.value)}
              placeholder="e.g. transformer-attention-deep-dive"
              className="w-full px-3 py-2 rounded border border-border bg-background text-sm font-mono"
            />
            <div className="text-xs text-muted-foreground mt-1">lowercase letters + digits + hyphens; matches the eventual JSON filename</div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Topic *</label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="One paragraph describing what this lesson covers and why it matters."
              rows={3}
              className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Learning objectives * (one per line, 1-8)</label>
            <textarea
              value={objectivesText}
              onChange={(e) => setObjectivesText(e.target.value)}
              placeholder={"Derive the softmax-attention formula\nExplain the role of the scaling factor 1/√d_k\nIdentify when self vs cross attention applies"}
              rows={5}
              className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
            />
            <div className="text-xs text-muted-foreground mt-1">{objectives.length} objective{objectives.length === 1 ? "" : "s"}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Difficulty</label>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)} className="w-full px-3 py-2 rounded border border-border bg-background text-sm">
                <option value="intro">intro</option>
                <option value="intermediate">intermediate</option>
                <option value="advanced">advanced</option>
                <option value="expert">expert</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Time (min)</label>
              <input type="number" min={5} max={60} value={timeMinutes} onChange={(e) => setTimeMinutes(parseInt(e.target.value) || 22)} className="w-full px-3 py-2 rounded border border-border bg-background text-sm" />
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-xs">
            <input type="checkbox" checked={streaming} onChange={(e) => setStreaming(e.target.checked)} />
            <span>Stream tokens (live partial output)</span>
          </label>
          <button
            onClick={generate}
            disabled={!canSubmit}
            className="w-full py-2.5 rounded bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Sparkles className="h-4 w-4" /> {busy ? "Generating…" : "Generate lesson"}
          </button>
        </div>

        {/* Right: result */}
        <div className="space-y-3">
          {result === null && !busy && (
            <div className="text-sm text-muted-foreground border border-dashed border-border rounded p-6 text-center">
              Fill the form on the left + hit generate. The output will appear here.
            </div>
          )}
          {busy && (
            <div className="text-sm text-muted-foreground border border-border rounded p-3">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 animate-pulse" />
                {streaming && partial.length > 0 ? `Streaming… ${partial.length} chars` : "Calling the AI provider… (10-60s)"}
              </div>
              {streaming && partial.length > 0 && (
                <pre className="text-[10px] font-mono bg-muted/30 rounded p-2 max-h-64 overflow-auto whitespace-pre-wrap">{partial}</pre>
              )}
            </div>
          )}
          {result?.error && (
            <div className="rounded border border-destructive/40 bg-destructive/10 p-4 text-sm">
              <div className="font-semibold flex items-center gap-2 text-destructive mb-1"><AlertTriangle className="h-4 w-4" /> {result.error}</div>
              {result.rawOutput && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-muted-foreground">raw provider output (first 2KB)</summary>
                  <pre className="mt-2 overflow-auto whitespace-pre-wrap font-mono">{result.rawOutput}</pre>
                </details>
              )}
            </div>
          )}
          {!!result?.lesson && (
            <>
              <div className={`rounded border p-3 text-xs flex items-center gap-2 ${result.valid ? "border-green-500/40 bg-green-500/10" : "border-amber-500/40 bg-amber-500/10"}`}>
                {result.valid ? <Check className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                <span>{result.valid ? "Valid against canonical schema" : `${result.warnings?.length ?? 0} schema warning${(result.warnings?.length ?? 0) === 1 ? "" : "s"}`}</span>
              </div>
              {result.warnings && result.warnings.length > 0 && (
                <ul className="text-xs text-muted-foreground space-y-1 ml-1">
                  {result.warnings.map((w, i) => (
                    <li key={i}>• {w}</li>
                  ))}
                </ul>
              )}
              {previewViz && (
                <div className="border border-border rounded">
                  <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border">embedded viz: {previewViz.name}</div>
                  <div className="p-2">
                    <PreviewViz name={previewViz.name} props={previewViz.props} />
                  </div>
                </div>
              )}
              <div className="relative">
                <div className="absolute top-2 right-2 flex gap-1">
                  {result.valid && (
                    <button onClick={() => saveToFile(false)} disabled={saving} className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:opacity-80 disabled:opacity-50 flex items-center gap-1">
                      <Save className="h-3 w-3" /> {saving ? "saving…" : "save"}
                    </button>
                  )}
                  <button onClick={copy} className="text-xs px-2 py-1 rounded bg-muted hover:bg-accent flex items-center gap-1">
                    <Copy className="h-3 w-3" /> copy
                  </button>
                </div>
                <pre className="overflow-auto bg-muted/30 border border-border rounded p-3 text-xs font-mono max-h-[600px]">{lessonJSON}</pre>
              </div>
              {saveMsg && (
                <div className={`text-xs px-3 py-2 rounded ${saveMsg.kind === "ok" ? "bg-green-500/10 border border-green-500/40 text-green-600" : "bg-destructive/10 border border-destructive/40 text-destructive"}`}>
                  {saveMsg.kind === "ok" ? <Check className="h-3 w-3 inline mr-1" /> : <AlertTriangle className="h-3 w-3 inline mr-1" />}
                  {saveMsg.text}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

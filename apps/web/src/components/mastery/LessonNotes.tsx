import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

interface Props {
  nodeId: string;
}

// A persistent per-node scratchpad. Auto-saves a second after the
// last keystroke. Quietly no-ops for signed-out users (the API
// requires auth — failures are swallowed).
export function LessonNotes({ nodeId }: Props) {
  const [body, setBody] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.mastery
      .getLessonNotes(nodeId)
      .then((r) => {
        if (cancelled) return;
        setBody(r.body);
        setSavedAt(r.updatedAt);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [nodeId]);

  useEffect(() => {
    if (!loaded) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        const r = await api.mastery.saveLessonNotes(nodeId, body);
        setSavedAt(r.updatedAt);
      } catch {
        // ignore — likely signed-out
      } finally {
        setSaving(false);
      }
    }, 1000);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, loaded]);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-xs font-medium">📝 Notes</span>
        <span className="text-[10px] text-muted-foreground">
          {saving
            ? "Saving…"
            : savedAt
              ? `Saved ${new Date(savedAt).toLocaleTimeString()}`
              : "Unsaved"}
        </span>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        placeholder="Jot something for your future self…"
        className="w-full p-3 text-sm font-mono bg-background resize-y focus:outline-none"
      />
    </div>
  );
}

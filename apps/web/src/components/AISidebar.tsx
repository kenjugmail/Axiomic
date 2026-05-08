import { useState, useRef, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Sparkles } from "lucide-react";
import type { CoachSuggestion, TutorMode } from "@axiomic/types";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { CoachSuggestionCard } from "./ai/CoachSuggestionCard";

interface AISidebarProps {
  pageSlug: string;
  pageTitle: string;
  tier: string;
  isOpen: boolean;
  onClose: () => void;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function AISidebar({ pageSlug, pageTitle, tier, isOpen, onClose }: AISidebarProps) {
  const user = useAuthStore((s) => s.user);
  const [searchParams] = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  // Sprint 18 — proactive coach suggestions + due-flashcards CTA. The
  // sidebar fetches both on open (signed-in only); failed loads stay
  // silent so the chat behavior degrades cleanly to the older form.
  const [suggestions, setSuggestions] = useState<CoachSuggestion[] | null>(null);
  const [dueCards, setDueCards] = useState<number>(0);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  // Sprint 30 — tutor mode + per-mode context. URL params `aiMode` +
  // `diagnosisId` / `forumTopicId` auto-pick a mode (e.g. clicking
  // "Coach me" on /me/weak-concepts deep-links into misconception mode).
  const urlMode = searchParams.get("aiMode") as TutorMode | null;
  const [mode, setMode] = useState<TutorMode>(
    urlMode && ["socratic", "misconception", "bridge", "debate", "contribution"].includes(urlMode)
      ? urlMode
      : "socratic",
  );
  const urlDiagnosisId = searchParams.get("diagnosisId") ?? undefined;
  const forumTopicId = searchParams.get("forumTopicId") ?? undefined;
  // Sprint 32 — when no explicit ?aiMode is set, the sidebar can
  // auto-pick a mode from page context. We resolve a diagnosisId from
  // the user's active misconceptions matching pageSlug, and fall back
  // to bridge mode when prerequisite gaps exist. Manual chip clicks
  // still override.
  const [autoDiagnosisId, setAutoDiagnosisId] = useState<string | undefined>(
    undefined,
  );
  const diagnosisId = urlDiagnosisId ?? autoDiagnosisId;
  const [hasAutoSelected, setHasAutoSelected] = useState(false);

  // Reset auto-selection state when the page changes so a fresh
  // surface re-evaluates which mode to pick.
  useEffect(() => {
    setHasAutoSelected(false);
    setAutoDiagnosisId(undefined);
  }, [pageSlug]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // Fetch coach context + ranked suggestions on open. We collapse them
  // into a single API call each — buildCoachContext on the server is
  // cheap, and the data is only valuable while the sidebar is open.
  useEffect(() => {
    if (!isOpen || !user) return;
    let cancelled = false;
    Promise.all([
      api.ai.coachContext(pageSlug),
      api.ai.coachSuggest(pageSlug),
      // Sprint 32 — pull active diagnoses so we can auto-route into
      // misconception mode when this page maps to one of them.
      urlMode || hasAutoSelected
        ? Promise.resolve(null)
        : api.me.weakConcepts().catch(() => null),
    ])
      .then(([ctx, sug, weak]) => {
        if (cancelled) return;
        setDueCards(ctx.dueFlashcards);
        setSuggestions(sug.suggestions);

        // Auto-mode-routing — runs once per sidebar open, only when the
        // URL didn't pin a mode.
        if (!urlMode && !hasAutoSelected) {
          const activeDiagnoses = weak?.diagnoses?.filter(
            (d) => d.status === "active" || d.status === "coached",
          );
          const match = activeDiagnoses?.find(
            (d) => d.conceptSlug === pageSlug,
          );
          if (match) {
            setMode("misconception");
            setAutoDiagnosisId(match.id);
          } else if (ctx.prerequisiteGaps && ctx.prerequisiteGaps.length > 0) {
            setMode("bridge");
          }
          setHasAutoSelected(true);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, user, pageSlug, urlMode, hasAutoSelected]);

  const handleSend = async () => {
    if (!input.trim() || streaming) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);

    // Add empty assistant message for streaming
    setMessages([...newMessages, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/v1/ai/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageSlug,
          tier,
          messages: newMessages,
          mode,
          modeContext: { diagnosisId, forumTopicId, pageSlug },
        }),
      });

      if (!res.ok || !res.body) throw new Error("Stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.token) {
              fullContent += parsed.token;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: fullContent };
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
        };
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  };

  // Static fallback prompts, used when there's no proactive suggestion
  // (e.g. signed-out viewers, or signed-in users with no mistakes /
  // weak concepts yet). The proactive set takes precedence when
  // present.
  const fallbackPrompts = [
    "Explain this topic simply",
    "Quiz me on this",
    "What are the prerequisites?",
    "Give me a practice problem",
  ];

  // Visible suggestions = ranked set minus anything the user dismissed
  // this session. Memoize-light: cheap enough to recompute on render.
  const visibleSuggestions = (suggestions ?? []).filter(
    (_, i) => !dismissed.has(i),
  );

  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-14 bottom-0 w-96 bg-card flex flex-col z-40 shadow-elevated animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h3 className="font-semibold text-sm">AI Tutor</h3>
          <p className="text-xs text-muted-foreground">{pageTitle} &middot; {tier}</p>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-accent rounded">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Sprint 30 — tutor mode picker */}
      <TutorModePicker
        mode={mode}
        onChange={setMode}
        canMisconception={!!diagnosisId}
        canDebate={!!forumTopicId}
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Sprint 18 — proactive "Quick checks" header. Renders above
            the empty-state prompt list so the user sees what to do
            next before they have to type. Suggestions are ranked by
            buildCoachContext / rankSuggestions on the server. */}
        {messages.length === 0 && user && visibleSuggestions.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-primary">
              <Sparkles className="w-3 h-3" strokeWidth={2} />
              Quick checks for you
            </div>
            <div className="space-y-1.5">
              {visibleSuggestions.map((s, i) => (
                <CoachSuggestionCard
                  key={`${s.kind}-${i}`}
                  suggestion={s}
                  onDismiss={() =>
                    setDismissed((prev) => {
                      const next = new Set(prev);
                      next.add(suggestions!.indexOf(s));
                      return next;
                    })
                  }
                />
              ))}
            </div>
            {dueCards > 0 && (
              <Link
                to="/flashcards"
                className="block text-center text-xs px-3 py-2 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
              >
                ⏰ Review {dueCards} due card{dueCards === 1 ? "" : "s"} (~5 min)
              </Link>
            )}
          </div>
        )}

        {messages.length === 0 && (
          <div className="text-center py-4">
            <p className="text-muted-foreground text-sm mb-4">
              Ask me anything about <strong>{pageTitle}</strong>
            </p>
            <div className="space-y-2">
              {fallbackPrompts.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setInput(s);
                    setTimeout(() => handleSend(), 0);
                  }}
                  className="block w-full text-left px-3 py-2 text-sm rounded-lg border border-border hover:bg-accent/50 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={msg.role === "user" ? "flex justify-end" : ""}>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              }`}
            >
              {msg.role === "assistant" ? (
                <MarkdownRenderer content={msg.content} className="text-sm [&_p]:mb-2 [&_p]:text-sm" />
              ) : (
                <p>{msg.content}</p>
              )}
              {msg.role === "assistant" && streaming && i === messages.length - 1 && (
                <span className="inline-block w-1.5 h-4 bg-foreground/50 animate-pulse ml-0.5" />
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-3">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask a question..."
            rows={2}
            className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={handleSend}
            disabled={streaming || !input.trim()}
            className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors self-end"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

const MODE_LABELS: Record<TutorMode, string> = {
  socratic: "Socratic",
  misconception: "Misconception",
  bridge: "Bridge",
  debate: "Debate",
  contribution: "Contribute",
};

const MODE_HINTS: Record<TutorMode, string> = {
  socratic: "Asks one question first.",
  misconception: "Probes a diagnosed misunderstanding.",
  bridge: "Anchors to what you already know.",
  debate: "Argues the opposite to stress-test you.",
  contribution: "Suggests where you could write.",
};

function TutorModePicker({
  mode,
  onChange,
  canMisconception,
  canDebate,
}: {
  mode: TutorMode;
  onChange: (m: TutorMode) => void;
  canMisconception: boolean;
  canDebate: boolean;
}) {
  const all: TutorMode[] = ["socratic", "misconception", "bridge", "debate", "contribution"];
  return (
    <div className="px-4 py-2 border-b border-border bg-muted/20">
      <div className="flex gap-1 flex-wrap">
        {all.map((m) => {
          const enabled =
            (m === "misconception" ? canMisconception : true) &&
            (m === "debate" ? canDebate : true);
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              disabled={!enabled}
              onClick={() => enabled && onChange(m)}
              title={MODE_HINTS[m]}
              className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border transition-colors ${
                active
                  ? "border-primary bg-primary/15 text-primary"
                  : enabled
                    ? "border-border text-muted-foreground hover:text-foreground"
                    : "border-border/40 text-muted-foreground/40 cursor-not-allowed"
              }`}
            >
              {MODE_LABELS[m]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

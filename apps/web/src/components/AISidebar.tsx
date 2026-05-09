import { useState, useRef, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Sparkles } from "lucide-react";
import type { CoachSuggestion, TutorMode } from "@axiomic/types";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { CoachSuggestionCard } from "./ai/CoachSuggestionCard";
import { AIModelPicker, type ModelOption } from "./ai/AIModelPicker";
import { AITutorModeSelector } from "./ai/AITutorModeSelector";
import { AITutorSettings } from "./ai/AITutorSettings";
import { AIConversationHistory } from "./ai/AIConversationHistory";
import { starterPromptsFor } from "../lib/starterPrompts";
import {
  loadAISettings,
  saveAISettings,
  type AITutorSettings as AITutorSettingsValue,
} from "../lib/aiSettings";
import {
  clearCurrentSession,
  listSessions,
  loadCurrentSession,
  loadPageState,
  persistMessages,
  setCurrentSession as setCurrentSessionStorage,
  startNewSession,
  type ConversationSession,
} from "../lib/aiSessions";

// Sprint 63f — localStorage key for the per-user model preference.
const MODEL_STORAGE_KEY = "axiomic.ai.model";

interface AISidebarProps {
  pageSlug: string;
  pageTitle: string;
  tier: string;
  isOpen: boolean;
  onClose: () => void;
  // Sprint 63g — when the sidebar opens via the selection-to-chat
  // flow, the page passes the highlighted text via this prop. The
  // sidebar prefills it as a quoted block in the input + auto-focuses.
  // Calls `onSeedConsumed` once the quote has been moved into the
  // input so the page can clear its state.
  seedQuote?: string | null;
  onSeedConsumed?: () => void;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function AISidebar({
  pageSlug,
  pageTitle,
  tier,
  isOpen,
  onClose,
  seedQuote,
  onSeedConsumed,
}: AISidebarProps) {
  const user = useAuthStore((s) => s.user);
  const [searchParams] = useSearchParams();
  // Sprint 65b — multi-session conversation history per page. We hold
  // a current sessionId in state; the messages list comes from the
  // currently-selected session.
  const [sessionId, setSessionId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    const current = loadCurrentSession(pageSlug);
    if (current) return current.id;
    return startNewSession(pageSlug).id;
  });
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === "undefined") return [];
    const current = loadCurrentSession(pageSlug);
    return current?.messages ?? [];
  });
  // Mirror the current page's session list into state so the history
  // dropdown re-renders on save.
  const [sessions, setSessions] = useState<ConversationSession[]>(() => {
    if (typeof window === "undefined") return [];
    return listSessions(pageSlug).sessions;
  });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  // Sprint 18 — proactive coach suggestions + due-flashcards CTA. The
  // sidebar fetches both on open (signed-in only); failed loads stay
  // silent so the chat behavior degrades cleanly to the older form.
  const [suggestions, setSuggestions] = useState<CoachSuggestion[] | null>(null);
  const [dueCards, setDueCards] = useState<number>(0);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  // Sprint 65a — user-controlled tutor settings. Live in localStorage;
  // changes apply immediately. Defaults match the pre-S65 behavior.
  const [settings, setSettings] = useState<AITutorSettingsValue>(() =>
    loadAISettings(),
  );
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

  // Sprint 63f — model picker state. Loaded once per sidebar mount;
  // selection persists in localStorage so the next session keeps it.
  const [models, setModels] = useState<ModelOption[]>([]);
  const [providerName, setProviderName] = useState<string | undefined>(
    undefined,
  );
  const [model, setModel] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(MODEL_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  // Reset auto-selection state when the page changes so a fresh
  // surface re-evaluates which mode to pick.
  useEffect(() => {
    setHasAutoSelected(false);
    setAutoDiagnosisId(undefined);
    // Sprint 65b — restore the per-page sessions when the page slug
    // changes (e.g., user navigates from /wiki/attention to
    // /wiki/softmax with the sidebar staying open).
    const state = loadPageState(pageSlug);
    setSessions(state.sessions);
    if (state.currentId) {
      setSessionId(state.currentId);
      const current = state.sessions.find((s) => s.id === state.currentId);
      setMessages(current?.messages ?? []);
    } else {
      const fresh = startNewSession(pageSlug);
      setSessionId(fresh.id);
      setMessages([]);
      setSessions(listSessions(pageSlug).sessions);
    }
  }, [pageSlug]);

  // Sprint 65b — persist conversation to the active session on every
  // change.
  useEffect(() => {
    if (!sessionId) return;
    persistMessages(pageSlug, sessionId, messages);
    setSessions(listSessions(pageSlug).sessions);
  }, [pageSlug, sessionId, messages]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // Sprint 63f — fetch available models when the sidebar opens. Cached
  // server-side for 5 minutes; cheap to re-fetch.
  useEffect(() => {
    if (!isOpen || models.length > 0) return;
    let cancelled = false;
    fetch("/api/v1/ai/models", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const list: ModelOption[] = Array.isArray(data.available)
          ? data.available.filter((m: any) => m && typeof m.id === "string")
          : [];
        setModels(list);
        setProviderName(typeof data.provider === "string" ? data.provider : undefined);
        // Lock in a default if the user hasn't chosen one or chose a
        // model the provider no longer offers.
        const ids = new Set(list.map((m) => m.id));
        if (!model || !ids.has(model)) {
          const fallback =
            typeof data.default === "string" && ids.has(data.default)
              ? data.default
              : list[0]?.id ?? null;
          if (fallback) setModel(fallback);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, models.length, model]);

  // Persist model selection.
  useEffect(() => {
    if (typeof window === "undefined" || !model) return;
    try {
      window.localStorage.setItem(MODEL_STORAGE_KEY, model);
    } catch {
      // localStorage may be unavailable (private mode); silent fallback.
    }
  }, [model]);

  // Sprint 63g — consume incoming seedQuote (from selection-to-chat).
  // Prepend it as a quoted block to the input + auto-focus. The page
  // sets seedQuote -> sidebar opens -> we copy + ack so the page can
  // clear its state.
  useEffect(() => {
    if (!isOpen || !seedQuote) return;
    const trimmed = seedQuote.trim();
    if (!trimmed) {
      onSeedConsumed?.();
      return;
    }
    // Render as a markdown blockquote so the user message displays
    // distinctly + the LLM sees the structure.
    const block = trimmed
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    setInput((prev) => {
      const next = prev.trim().length === 0 ? `${block}\n\n` : `${block}\n\n${prev}`;
      return next;
    });
    onSeedConsumed?.();
    // Defer focus so the textarea has rendered + the value is set.
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [isOpen, seedQuote, onSeedConsumed]);

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
      // Sprint 65a — gated by the autoSelectMode setting; when off,
      // skip the weak-concepts fetch entirely.
      urlMode || hasAutoSelected || !settings.autoSelectMode
        ? Promise.resolve(null)
        : api.me.weakConcepts().catch(() => null),
    ])
      .then(([ctx, sug, weak]) => {
        if (cancelled) return;
        setDueCards(ctx.dueFlashcards);
        setSuggestions(sug.suggestions);

        // Auto-mode-routing — runs once per sidebar open, only when the
        // URL didn't pin a mode AND the user hasn't disabled it.
        if (!urlMode && !hasAutoSelected && settings.autoSelectMode) {
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
  }, [isOpen, user, pageSlug, urlMode, hasAutoSelected, settings.autoSelectMode]);

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
          ...(model ? { model } : {}),
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

  // Sprint 65a — settings change handler also persists.
  const handleSettingsChange = (next: AITutorSettingsValue) => {
    setSettings(next);
    saveAISettings(next);
  };

  // Sprint 65b — start a fresh session on this page.
  const handleNewSession = () => {
    const fresh = startNewSession(pageSlug);
    setSessionId(fresh.id);
    setMessages([]);
    setSessions(listSessions(pageSlug).sessions);
    setDismissed(new Set());
    inputRef.current?.focus();
  };

  // Sprint 65b — switch to a previous session on this page.
  const handleSelectSession = (id: string) => {
    if (id === sessionId) return;
    setCurrentSessionStorage(pageSlug, id);
    const state = loadPageState(pageSlug);
    const target = state.sessions.find((s) => s.id === id);
    if (!target) return;
    setSessionId(id);
    setMessages(target.messages);
    setSessions(state.sessions);
    setDismissed(new Set());
  };

  // Sprint 65b — delete a session from history.
  const handleDeleteSession = (id: string) => {
    const wasCurrent = id === sessionId;
    if (wasCurrent) {
      clearCurrentSession(pageSlug);
      const state = loadPageState(pageSlug);
      setSessions(state.sessions);
      if (state.currentId) {
        const target = state.sessions.find((s) => s.id === state.currentId);
        setSessionId(state.currentId);
        setMessages(target?.messages ?? []);
      } else {
        const fresh = startNewSession(pageSlug);
        setSessionId(fresh.id);
        setMessages([]);
        setSessions(listSessions(pageSlug).sessions);
      }
      return;
    }
    // Non-current: just drop it from the list.
    if (typeof window === "undefined") return;
    const state = loadPageState(pageSlug);
    const filtered = state.sessions.filter((s) => s.id !== id);
    try {
      if (filtered.length === 0) {
        window.localStorage.removeItem("axiomic.ai.sessions:" + pageSlug);
      } else {
        window.localStorage.setItem(
          "axiomic.ai.sessions:" + pageSlug,
          JSON.stringify({ sessions: filtered, currentId: state.currentId }),
        );
      }
    } catch {
      // ignore
    }
    setSessions(filtered);
  };

  // Sprint 64b-5 — tier-specific starter prompts. Wiki pages get
  // conceptual prompts; lessons get slide-focused; research gets
  // critique-focused; etc. Falls back to a generic 4-prompt list
  // when tier doesn't match.
  const fallbackPrompts = starterPromptsFor(tier);

  // Visible suggestions = ranked set minus anything the user dismissed
  // this session. Memoize-light: cheap enough to recompute on render.
  // Sprint 65a — fully gated by the showSuggestions setting.
  const visibleSuggestions = settings.showSuggestions
    ? (suggestions ?? []).filter((_, i) => !dismissed.has(i))
    : [];

  if (!isOpen) return null;

  return (
    <>
      {/* Sprint 64b — backdrop on mobile so tapping outside the bottom
          sheet dismisses (mirrors native bottom-sheet UX). */}
      <div
        className="fixed inset-0 z-30 bg-background/40 backdrop-blur-[2px] sm:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed inset-x-0 bottom-0 max-h-[85vh] sm:inset-auto sm:right-0 sm:top-14 sm:bottom-0 sm:max-h-none sm:w-96 bg-card flex flex-col z-40 shadow-elevated rounded-t-xl sm:rounded-none animate-fade-in"
        role="dialog"
        aria-label="AI tutor"
      >
      {/* Sprint 64b — drag handle bar (visual only on mobile). */}
      <div
        className="sm:hidden flex justify-center pt-2 pb-1 cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      >
        <div className="w-10 h-1.5 rounded-full bg-muted-foreground/30" />
      </div>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm">AI Tutor</h3>
          <p className="text-xs text-muted-foreground truncate">{pageTitle} &middot; {tier}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Sprint 63f — per-conversation model selection. */}
          <AIModelPicker
            models={models}
            value={model}
            onChange={setModel}
            provider={providerName}
          />
          {/* Sprint 65b — past conversations on this page. */}
          <AIConversationHistory
            sessions={sessions}
            currentId={sessionId}
            onSelect={handleSelectSession}
            onNew={handleNewSession}
            onDelete={handleDeleteSession}
          />
          {/* Sprint 65a — tutor settings popover. */}
          <AITutorSettings value={settings} onChange={handleSettingsChange} />
          <button onClick={onClose} className="p-1 hover:bg-accent rounded" title="Close">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Sprint 30 — tutor mode picker.
          Sprint 64b-2 — refreshed: icons + colors + auto badge. */}
      <AITutorModeSelector
        mode={mode}
        onChange={setMode}
        canMisconception={!!diagnosisId}
        canDebate={!!forumTopicId}
        autoSelected={hasAutoSelected && settings.autoSelectMode}
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
                // Sprint 63h — render user messages via Markdown so
                // selection-to-chat quote blocks (lines starting with
                // `> `) display as a styled blockquote, not raw text.
                <MarkdownRenderer
                  content={msg.content}
                  className="text-sm [&_p]:mb-1 [&_p]:text-sm [&_blockquote]:border-l-2 [&_blockquote]:border-primary-foreground/40 [&_blockquote]:pl-2 [&_blockquote]:opacity-90 [&_blockquote]:italic"
                />
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
              // Sprint 63h — Cmd/Ctrl+Enter sends; plain Enter inserts
              // a newline. Multi-line-friendly + matches code editors
              // + chat tools the user is likely to be familiar with.
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask a question…  (⌘+Enter / Ctrl+Enter to send)"
            rows={3}
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
        {messages.length > 0 && (
          <div className="flex justify-between items-center mt-1.5 text-[10px] text-muted-foreground">
            <span>
              {providerName ? `Provider: ${providerName}` : ""}
              {providerName && model ? " · " : ""}
              {model ?? ""}
            </span>
            <button
              onClick={handleNewSession}
              className="hover:text-foreground"
              title="Start a new conversation"
            >
              New conversation
            </button>
          </div>
        )}
      </div>
      </div>
    </>
  );
}

// Sprint 64b-2 — old TutorModePicker extracted to
// `./ai/AITutorModeSelector.tsx` with icons, colors, and an auto-
// selected badge.

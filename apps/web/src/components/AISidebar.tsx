import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import type { CoachSuggestion } from "@axiomic/types";
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  // Sprint 18 — proactive coach suggestions + due-flashcards CTA. The
  // sidebar fetches both on open (signed-in only); failed loads stay
  // silent so the chat behavior degrades cleanly to the older form.
  const [suggestions, setSuggestions] = useState<CoachSuggestion[] | null>(null);
  const [dueCards, setDueCards] = useState<number>(0);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
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
    ])
      .then(([ctx, sug]) => {
        if (cancelled) return;
        setDueCards(ctx.dueFlashcards);
        setSuggestions(sug.suggestions);
      })
      .catch(() => {
        if (cancelled) return;
        setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, user, pageSlug]);

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
        body: JSON.stringify({ pageSlug, tier, messages: newMessages }),
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

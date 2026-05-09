// Sprint 65b — multi-session conversation history per page.
//
// Before S65 the sidebar kept a single conversation per pageSlug in
// sessionStorage. This module extends that to a list of sessions in
// localStorage, so a user can flip between past conversations on the
// same page (and they survive a browser restart).
//
// Storage shape:
//   localStorage["axiomic.ai.sessions:<pageSlug>"] = {
//     sessions: [{ id, startedAt, updatedAt, messages: [...] }, ...],
//     currentId: string | null,
//   }
//
// Capped at MAX_SESSIONS per slug; oldest pruned on save. Each session
// caps its messages at MAX_MESSAGES so a runaway transcript can't
// blow localStorage.

const STORAGE_PREFIX = "axiomic.ai.sessions:";
export const MAX_SESSIONS = 10;
export const MAX_MESSAGES = 50;

export interface SessionMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationSession {
  id: string;
  startedAt: number;
  updatedAt: number;
  messages: SessionMessage[];
}

interface PageSessionState {
  sessions: ConversationSession[];
  currentId: string | null;
}

function emptyState(): PageSessionState {
  return { sessions: [], currentId: null };
}

function isValidMessage(m: unknown): m is SessionMessage {
  if (!m || typeof m !== "object") return false;
  const obj = m as Record<string, unknown>;
  return (
    (obj.role === "user" || obj.role === "assistant") &&
    typeof obj.content === "string"
  );
}

function isValidSession(s: unknown): s is ConversationSession {
  if (!s || typeof s !== "object") return false;
  const obj = s as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.startedAt === "number" &&
    typeof obj.updatedAt === "number" &&
    Array.isArray(obj.messages) &&
    obj.messages.every(isValidMessage)
  );
}

export function loadPageState(pageSlug: string): PageSessionState {
  if (typeof window === "undefined") return emptyState();
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + pageSlug);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyState();
    const sessions = Array.isArray(parsed.sessions)
      ? parsed.sessions.filter(isValidSession)
      : [];
    const currentId =
      typeof parsed.currentId === "string" &&
      sessions.some((s: ConversationSession) => s.id === parsed.currentId)
        ? parsed.currentId
        : null;
    return { sessions, currentId };
  } catch {
    return emptyState();
  }
}

function savePageState(pageSlug: string, state: PageSessionState) {
  if (typeof window === "undefined") return;
  try {
    if (state.sessions.length === 0) {
      window.localStorage.removeItem(STORAGE_PREFIX + pageSlug);
      return;
    }
    window.localStorage.setItem(
      STORAGE_PREFIX + pageSlug,
      JSON.stringify(state),
    );
  } catch {
    // localStorage unavailable; silent.
  }
}

function generateId(): string {
  // Cheap, collision-resistant-enough id. Avoids pulling in a uuid
  // dep just for this list.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function loadCurrentSession(pageSlug: string): ConversationSession | null {
  const state = loadPageState(pageSlug);
  if (!state.currentId) return null;
  return state.sessions.find((s) => s.id === state.currentId) ?? null;
}

export function listSessions(pageSlug: string): {
  sessions: ConversationSession[];
  currentId: string | null;
} {
  return loadPageState(pageSlug);
}

export function startNewSession(pageSlug: string): ConversationSession {
  const now = Date.now();
  const session: ConversationSession = {
    id: generateId(),
    startedAt: now,
    updatedAt: now,
    messages: [],
  };
  const state = loadPageState(pageSlug);
  // Drop empty sessions sitting around so they don't accumulate.
  const sessions = state.sessions.filter((s) => s.messages.length > 0);
  sessions.unshift(session);
  if (sessions.length > MAX_SESSIONS) sessions.length = MAX_SESSIONS;
  savePageState(pageSlug, { sessions, currentId: session.id });
  return session;
}

export function persistMessages(
  pageSlug: string,
  sessionId: string,
  messages: SessionMessage[],
): void {
  const state = loadPageState(pageSlug);
  const idx = state.sessions.findIndex((s) => s.id === sessionId);
  const trimmed = messages.slice(-MAX_MESSAGES);
  const now = Date.now();
  if (idx === -1) {
    // Session unknown — recreate it so the messages aren't lost.
    const session: ConversationSession = {
      id: sessionId,
      startedAt: now,
      updatedAt: now,
      messages: trimmed,
    };
    const sessions = [session, ...state.sessions];
    if (sessions.length > MAX_SESSIONS) sessions.length = MAX_SESSIONS;
    savePageState(pageSlug, { sessions, currentId: sessionId });
    return;
  }
  state.sessions[idx] = {
    ...state.sessions[idx],
    messages: trimmed,
    updatedAt: now,
  };
  state.currentId = sessionId;
  savePageState(pageSlug, state);
}

export function setCurrentSession(pageSlug: string, sessionId: string): void {
  const state = loadPageState(pageSlug);
  if (!state.sessions.some((s) => s.id === sessionId)) return;
  savePageState(pageSlug, { ...state, currentId: sessionId });
}

export function clearCurrentSession(pageSlug: string): void {
  const state = loadPageState(pageSlug);
  if (!state.currentId) return;
  const sessions = state.sessions.filter((s) => s.id !== state.currentId);
  savePageState(pageSlug, {
    sessions,
    currentId: sessions[0]?.id ?? null,
  });
}

export function previewLabel(session: ConversationSession): string {
  const first = session.messages.find((m) => m.role === "user");
  if (!first) return "New conversation";
  // Strip leading markdown blockquote markers + collapse newlines so
  // selection-to-chat seeds don't dominate the preview.
  const stripped = first.content
    .split("\n")
    .map((l) => l.replace(/^>\s?/, ""))
    .join(" ")
    .trim();
  if (!stripped) return "New conversation";
  return stripped.length > 60 ? stripped.slice(0, 57) + "…" : stripped;
}

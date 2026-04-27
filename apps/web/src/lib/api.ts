const BASE = "/api/v1";

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...opts?.headers },
    ...opts,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error || "Unknown error");
  }

  return res.json();
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const api = {
  auth: {
    signup: (data: { username: string; email: string; password: string }) =>
      request<{ user: User }>("/auth/signup", { method: "POST", body: JSON.stringify(data) }),
    login: (data: { email: string; password: string }) =>
      request<{ user: User }>("/auth/login", { method: "POST", body: JSON.stringify(data) }),
    logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
    me: () => request<{ user: User | null }>("/auth/me"),
  },
  wiki: {
    list: (params?: { category?: string; search?: string }) => {
      const sp = new URLSearchParams();
      if (params?.category) sp.set("category", params.category);
      if (params?.search) sp.set("search", params.search);
      const qs = sp.toString();
      return request<{ pages: WikiPage[] }>(`/wiki${qs ? `?${qs}` : ""}`);
    },
    get: (slug: string, tier?: string) =>
      request<{ page: WikiPage; content: string; versions: PageVersion[] }>(
        `/wiki/${slug}${tier ? `?tier=${tier}` : ""}`
      ),
    update: (slug: string, data: { contentIntro: string; contentUndergrad: string; contentGrad: string; editMessage?: string }) =>
      request<{ page: WikiPage }>(`/wiki/${slug}`, { method: "PUT", body: JSON.stringify(data) }),
    search: (query: string) =>
      request<{ results: WikiPage[] }>(`/wiki/search?q=${encodeURIComponent(query)}`),
  },
  comments: {
    list: (pageId: string, sort?: string) =>
      request<{ comments: Comment[] }>(`/comments/${pageId}${sort ? `?sort=${sort}` : ""}`),
    create: (data: { pageId: string; content: string; parentId?: string }) =>
      request<{ comment: Comment }>("/comments", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: { content: string }) =>
      request<{ comment: Comment }>(`/comments/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    vote: (commentId: string, value: 1 | -1) =>
      request<{ ok: boolean }>(`/comments/${commentId}/vote`, { method: "POST", body: JSON.stringify({ value }) }),
  },
  mastery: {
    getPaths: () => request<{ paths: MasteryPath[] }>("/mastery/paths"),
    getPath: (slug: string) =>
      request<{ path: MasteryPath; nodes: MasteryNode[]; progress: UserNodeProgress[] }>(`/mastery/paths/${slug}`),
    markComplete: (nodeId: string) =>
      request<{ ok: boolean }>(`/mastery/progress/${nodeId}/complete`, { method: "POST" }),
    getQuiz: (nodeId: string) =>
      request<{ questions: QuizQuestion[] }>(`/mastery/quiz/${nodeId}`),
    submitQuiz: (nodeId: string, answers: Record<string, string>) =>
      request<{ score: number; correct: number; total: number }>(`/mastery/quiz/${nodeId}`, { method: "POST", body: JSON.stringify({ answers }) }),
  },
  ai: {
    streamChat: (pageSlug: string, tier: string, messages: Array<{ role: string; content: string }>) => {
      return fetch(`${BASE}/ai/chat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageSlug, tier, messages }),
      });
    },
    relatedPages: (pageSlug: string) =>
      request<{ pages: WikiPage[] }>(`/ai/related/${pageSlug}`),
    rewrite: (text: string, targetTier: string, pageSlug: string) =>
      fetch(`${BASE}/ai/rewrite`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, targetTier, pageSlug }),
      }),
    flashcards: (pageSlug: string, tier: string) =>
      request<{ cards: Flashcard[] }>(`/ai/flashcards/${pageSlug}?tier=${tier}`),
  },
};

// Types
export interface User {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  bio?: string | null;
  createdAt?: string;
}

export interface WikiPage {
  id: string;
  slug: string;
  title: string;
  category: string;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface PageVersion {
  id: string;
  version: number;
  editedBy: string | null;
  editMessage: string | null;
  createdAt: string;
}

export interface Comment {
  id: string;
  pageId: string;
  parentId: string | null;
  userId: string;
  username: string;
  content: string;
  score: number;
  userVote: number;
  editedAt: string | null;
  createdAt: string;
  children?: Comment[];
}

export interface MasteryPath {
  id: string;
  slug: string;
  title: string;
  description: string;
}

export interface MasteryNode {
  id: string;
  slug: string;
  title: string;
  description: string;
  order: number;
  level: string;
  pageIds: string[];
  prerequisiteNodeIds: string[];
}

export interface UserNodeProgress {
  nodeId: string;
  completed: boolean;
  quizScore: number | null;
  completedAt: string | null;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
}

export interface Flashcard {
  front: string;
  back: string;
}

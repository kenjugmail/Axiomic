import type {
  AuthResponse,
  Comment,
  CommentResponse,
  CommentsListResponse,
  Flashcard,
  FlashcardsResponse,
  ForumCreateTopicResponse,
  ForumDomain,
  ForumDomainsResponse,
  ForumPost,
  ForumPostResponse,
  ForumTopicDetail,
  ForumTopicDetailResponse,
  ForumTopicSummary,
  ForumTopicsResponse,
  MasteryNode,
  MasteryPath,
  MasteryPathResponse,
  MasteryPathsResponse,
  MeResponse,
  Notification,
  NotificationsListResponse,
  OkResponse,
  SearchResponse,
  SearchResultItem,
  SettingsResponse,
  SettingsUpdateInput,
  PageVersion,
  PostType,
  QuizQuestion,
  QuizQuestionsResponse,
  QuizSubmitResponse,
  RelatedPagesResponse,
  ReputationResponse,
  UnreadCountResponse,
  User,
  UserNodeProgress,
  WikiListResponse,
  WikiPage,
  WikiPageResponse,
  WikiSearchResponse,
  WikiUpdateResponse,
} from "@axiomic/types";

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
      request<AuthResponse>("/auth/signup", { method: "POST", body: JSON.stringify(data) }),
    login: (data: { email: string; password: string }) =>
      request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(data) }),
    logout: () => request<OkResponse>("/auth/logout", { method: "POST" }),
    me: () => request<MeResponse>("/auth/me"),
  },
  wiki: {
    list: (params?: { category?: string; search?: string }) => {
      const sp = new URLSearchParams();
      if (params?.category) sp.set("category", params.category);
      if (params?.search) sp.set("search", params.search);
      const qs = sp.toString();
      return request<WikiListResponse>(`/wiki${qs ? `?${qs}` : ""}`);
    },
    get: (slug: string, tier?: string) =>
      request<WikiPageResponse>(`/wiki/${slug}${tier ? `?tier=${tier}` : ""}`),
    update: (slug: string, data: { contentIntro: string; contentUndergrad: string; contentGrad: string; editMessage?: string }) =>
      request<WikiUpdateResponse>(`/wiki/${slug}`, { method: "PUT", body: JSON.stringify(data) }),
    search: (query: string) =>
      request<WikiSearchResponse>(`/wiki/search?q=${encodeURIComponent(query)}`),
  },
  comments: {
    list: (pageId: string, sort?: string) =>
      request<CommentsListResponse>(`/comments/${pageId}${sort ? `?sort=${sort}` : ""}`),
    create: (data: { pageId: string; content: string; parentId?: string }) =>
      request<CommentResponse>("/comments", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: { content: string }) =>
      request<CommentResponse>(`/comments/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    vote: (commentId: string, value: 1 | -1) =>
      request<OkResponse>(`/comments/${commentId}/vote`, { method: "POST", body: JSON.stringify({ value }) }),
  },
  mastery: {
    getPaths: () => request<MasteryPathsResponse>("/mastery/paths"),
    getPath: (slug: string) =>
      request<MasteryPathResponse>(`/mastery/paths/${slug}`),
    markComplete: (nodeId: string) =>
      request<OkResponse>(`/mastery/progress/${nodeId}/complete`, { method: "POST" }),
    getQuiz: (nodeId: string) =>
      request<QuizQuestionsResponse>(`/mastery/quiz/${nodeId}`),
    submitQuiz: (nodeId: string, answers: Record<string, string>) =>
      request<QuizSubmitResponse>(`/mastery/quiz/${nodeId}`, { method: "POST", body: JSON.stringify({ answers }) }),
  },
  forum: {
    domains: () => request<ForumDomainsResponse>("/forum/domains"),
    listTopics: (params?: {
      domain?: string;
      postType?: PostType;
      wikiPageId?: string;
      sort?: "new" | "top" | "active";
    }) => {
      const sp = new URLSearchParams();
      if (params?.domain) sp.set("domain", params.domain);
      if (params?.postType) sp.set("postType", params.postType);
      if (params?.wikiPageId) sp.set("wikiPageId", params.wikiPageId);
      if (params?.sort) sp.set("sort", params.sort);
      const qs = sp.toString();
      return request<ForumTopicsResponse>(`/forum/topics${qs ? `?${qs}` : ""}`);
    },
    getTopic: (slug: string) =>
      request<ForumTopicDetailResponse>(`/forum/topics/${slug}`),
    createTopic: (data: {
      title: string;
      body: string;
      postType: PostType;
      domainSlug: string;
      wikiPageId?: string | null;
    }) =>
      request<ForumCreateTopicResponse>("/forum/topics", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    reply: (slug: string, data: { body: string; parentId?: string }) =>
      request<ForumPostResponse>(`/forum/topics/${slug}/posts`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    voteTopic: (slug: string, value: 1 | -1) =>
      request<OkResponse>(`/forum/topics/${slug}/vote`, {
        method: "POST",
        body: JSON.stringify({ value }),
      }),
    votePost: (postId: string, value: 1 | -1) =>
      request<OkResponse>(`/forum/posts/${postId}/vote`, {
        method: "POST",
        body: JSON.stringify({ value }),
      }),
    reputation: (username: string) =>
      request<ReputationResponse>(`/forum/users/${username}/reputation`),
    summarize: (slug: string) =>
      fetch(`${BASE}/forum/topics/${slug}/summarize`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      }),
  },
  search: {
    query: (q: string, limit?: number) => {
      const sp = new URLSearchParams({ q });
      if (limit) sp.set("limit", String(limit));
      return request<SearchResponse>(`/search?${sp.toString()}`);
    },
  },
  settings: {
    get: () => request<SettingsResponse>("/settings"),
    update: (patch: SettingsUpdateInput) =>
      request<SettingsResponse>("/settings", {
        method: "PUT",
        body: JSON.stringify(patch),
      }),
  },
  notifications: {
    list: (params?: { unread?: boolean; limit?: number; offset?: number }) => {
      const sp = new URLSearchParams();
      if (params?.unread) sp.set("unread", "true");
      if (params?.limit) sp.set("limit", String(params.limit));
      if (params?.offset) sp.set("offset", String(params.offset));
      const qs = sp.toString();
      return request<NotificationsListResponse>(`/notifications${qs ? `?${qs}` : ""}`);
    },
    unreadCount: () => request<UnreadCountResponse>("/notifications/unread-count"),
    markRead: (data: { ids?: string[]; all?: true }) =>
      request<OkResponse>("/notifications/mark-read", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<OkResponse>(`/notifications/${id}`, { method: "DELETE" }),
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
      request<RelatedPagesResponse>(`/ai/related/${pageSlug}`),
    rewrite: (text: string, targetTier: string, pageSlug: string) =>
      fetch(`${BASE}/ai/rewrite`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, targetTier, pageSlug }),
      }),
    flashcards: (pageSlug: string, tier: string) =>
      request<FlashcardsResponse>(`/ai/flashcards/${pageSlug}?tier=${tier}`),
  },
};

export type {
  Comment,
  Flashcard,
  ForumDomain,
  ForumPost,
  ForumTopicDetail,
  ForumTopicSummary,
  MasteryNode,
  MasteryPath,
  Notification,
  PageVersion,
  PostType,
  QuizQuestion,
  SearchResultItem,
  User,
  UserNodeProgress,
  WikiPage,
};

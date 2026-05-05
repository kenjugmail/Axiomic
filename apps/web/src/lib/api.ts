import type {
  AuthResponse,
  Comment,
  CommentResponse,
  CommentsListResponse,
  AchievementCatalogEntry,
  AchievementCatalogResponse,
  EarnedAchievement,
  ActivityHeatmapCell,
  CreateNewsArticleRequest,
  CreateNewsCommentRequest,
  CreateNewsProposalRequest,
  CreateWikiPageRequest,
  DueCountResponse,
  NewsArticleResponse,
  NewsBookmarksResponse,
  NewsCommentsResponse,
  NewsListResponse,
  NewsProposalsResponse,
  NewsReactionKind,
  NewsRelatedResponse,
  ReviewNewsProposalRequest,
  ToggleNewsBookmarkResponse,
  UpdateNewsArticleRequest,
  UpdateNewsCommentRequest,
  Flashcard,
  FlashcardsResponse,
  Lesson,
  LessonResponse,
  NextNodeResponse,
  RecentActivityResponse,
  UserAchievementsResponse,
  SavedFlashcard,
  SavedFlashcardResponse,
  SavedFlashcardsResponse,
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
  MasterySummaryResponse,
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
    create: (data: CreateWikiPageRequest) =>
      request<WikiUpdateResponse>("/wiki", { method: "POST", body: JSON.stringify(data) }),
    restore: (slug: string, version: number) =>
      request<WikiUpdateResponse>(`/wiki/${slug}/restore`, {
        method: "POST",
        body: JSON.stringify({ version }),
      }),
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
    getLesson: (nodeId: string) =>
      request<LessonResponse>(`/mastery/lesson/${nodeId}`),
    summary: (username: string) =>
      request<MasterySummaryResponse>(`/mastery/users/${username}/summary`),
    nextNode: () => request<NextNodeResponse>("/mastery/next-node"),
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
  achievements: {
    catalog: () => request<AchievementCatalogResponse>("/achievements/catalog"),
    forUser: (username: string) =>
      request<UserAchievementsResponse>(`/achievements/users/${username}`),
  },
  activity: {
    recent: (username: string, limit = 5) =>
      request<RecentActivityResponse>(
        `/activity/users/${username}?limit=${limit}`,
      ),
  },
  news: {
    list: () => request<NewsListResponse>("/news"),
    get: (slug: string) => request<NewsArticleResponse>(`/news/${slug}`),
    create: (data: CreateNewsArticleRequest) =>
      request<NewsArticleResponse>("/news", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (slug: string, data: UpdateNewsArticleRequest) =>
      request<NewsArticleResponse>(`/news/${slug}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    proposals: (slug: string) =>
      request<NewsProposalsResponse>(`/news/${slug}/proposals`),
    propose: (slug: string, data: CreateNewsProposalRequest) =>
      request<{ proposalId: string }>(`/news/${slug}/proposals`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    approve: (slug: string, proposalId: string, data?: ReviewNewsProposalRequest) =>
      request<OkResponse>(`/news/${slug}/proposals/${proposalId}/approve`, {
        method: "POST",
        body: JSON.stringify(data ?? {}),
      }),
    reject: (slug: string, proposalId: string, data?: ReviewNewsProposalRequest) =>
      request<OkResponse>(`/news/${slug}/proposals/${proposalId}/reject`, {
        method: "POST",
        body: JSON.stringify(data ?? {}),
      }),
    react: (slug: string, kind: NewsReactionKind) =>
      request<{
        reactionCounts: Record<NewsReactionKind, number>;
        myReactions: Record<NewsReactionKind, boolean>;
      }>(`/news/${slug}/reactions`, {
        method: "POST",
        body: JSON.stringify({ kind }),
      }),
    listComments: (slug: string) =>
      request<NewsCommentsResponse>(`/news/${slug}/comments`),
    addComment: (slug: string, data: CreateNewsCommentRequest) =>
      request<{ commentId: string }>(`/news/${slug}/comments`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    editComment: (id: string, data: UpdateNewsCommentRequest) =>
      request<OkResponse>(`/news/comments/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    toggleBookmark: (slug: string) =>
      request<ToggleNewsBookmarkResponse>(`/news/${slug}/bookmark`, {
        method: "POST",
      }),
    bookmarks: () => request<NewsBookmarksResponse>("/news/me/bookmarks"),
    related: (slug: string) =>
      request<NewsRelatedResponse>(`/news/${slug}/related`),
  },
  flashcards: {
    save: (data: { pageSlug: string; pageTitle: string; front: string; back: string }) =>
      request<SavedFlashcardResponse>("/flashcards", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    list: () => request<SavedFlashcardsResponse>("/flashcards"),
    due: () => request<SavedFlashcardsResponse>("/flashcards/due"),
    dueCount: () => request<DueCountResponse>("/flashcards/due/count"),
    review: (id: string, rating: number) =>
      request<SavedFlashcardResponse>(`/flashcards/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ rating }),
      }),
    delete: (id: string) =>
      request<OkResponse>(`/flashcards/${id}`, { method: "DELETE" }),
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
  AchievementCatalogEntry,
  ActivityHeatmapCell,
  EarnedAchievement,
  Notification,
  PageVersion,
  PostType,
  QuizQuestion,
  SavedFlashcard,
  SearchResultItem,
  User,
  UserNodeProgress,
  WikiPage,
};

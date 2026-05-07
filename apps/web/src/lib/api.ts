import type {
  AuthResponse,
  Comment,
  CommentResponse,
  CommentsListResponse,
  AchievementCatalogEntry,
  AchievementCatalogResponse,
  EarnedAchievement,
  ActivityHeatmapCell,
  CreateForumPollRequest,
  CreateNewsArticleRequest,
  CreateNewsCommentRequest,
  CreateNewsProposalRequest,
  CreateWikiPageRequest,
  DueCountResponse,
  FeedResponse,
  FollowStatsResponse,
  FollowsListResponse,
  ForumBookmarksResponse,
  PollVoteResponse,
  AiPracticeQuestionsResponse,
  AiTagSuggestionsResponse,
  DailyChallengeResponse,
  DailyChallengeSubmitResponse,
  LeaderboardResponse,
  PathCertificateResponse,
  PathLessonNotesResponse,
  PathLessonProgressResponse,
  QuizMistakesResponse,
  ToggleFollowResponse,
  ToggleForumReactionResponse,
  NewsArticleResponse,
  NewsBookmarksResponse,
  NewsCommentsResponse,
  ClaimThreadsResponse,
  CreateClaimThreadRequest,
  CreateClaimThreadReplyRequest,
  CreateRunnableArtifactRequest,
  CreateReproductionRequest,
  RunnableArtifactsResponse,
  ReproductionsResponse,
  ConceptPreview,
  CoachContext,
  CoachSuggestionsResponse,
  CreateResearchPaperRequest,
  ResearchPaperResponse,
  ResearchPapersDraftsResponse,
  ResearchPapersListResponse,
  UpdateResearchPaperRequest,
  CapstonesListResponse,
  CapstoneResponse,
  CapstoneEnrollmentsResponse,
  CapstoneArtifactPageResponse,
  CreateCapstoneRequest,
  UpdateCapstoneRequest,
  CreateMilestoneRequest,
  UpdateMilestoneRequest,
  SubmitMilestoneRequest,
  CapstoneSubmission,
  WeakConceptsResponse,
  PrereqXrayResponse,
  PortfolioResponse,
  PaperOutlineRequest,
  PaperDraftSectionRequest,
  PaperVizSuggestionsResponse,
  PaperConceptSuggestionsResponse,
  PaperReferenceSuggestionsResponse,
  PaperDeriveTierRequest,
  NewsListResponse,
  NewsProposalsResponse,
  NewsReactionKind,
  NewsRelatedResponse,
  NewsTagsResponse,
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
    putLesson: (
      nodeId: string,
      body: { slides: any[]; editMessage?: string },
      opts?: { draft?: boolean },
    ) =>
      request<{
        draft: boolean;
        lesson: { slides: any[] };
        version: number;
        draftUpdatedAt?: string;
        newAchievements?: string[];
      }>(
        `/mastery/nodes/${nodeId}/lesson${opts?.draft ? "?draft=1" : ""}`,
        { method: "PUT", body: JSON.stringify(body) },
      ),
    getLessonDraft: (nodeId: string) =>
      request<{
        draft:
          | null
          | {
              lesson: { slides: any[] };
              updatedAt: string;
              editorUsername: string | null;
            };
      }>(`/mastery/nodes/${nodeId}/lesson/draft`),
    publishLessonDraft: (nodeId: string) =>
      request<{
        lesson: { slides: any[] };
        version: number;
        newAchievements?: string[];
      }>(`/mastery/nodes/${nodeId}/lesson/publish-draft`, { method: "POST" }),
    reportLessonVersion: (
      nodeId: string,
      version: number,
      body: { reason: "vandalism" | "spam" | "accuracy" | "other"; message?: string },
    ) =>
      request<{ ok: true }>(
        `/mastery/nodes/${nodeId}/lesson/report-version/${version}`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    lessonEditsFeed: (params?: { username?: string; limit?: number; offset?: number }) => {
      const sp = new URLSearchParams();
      if (params?.username) sp.set("username", params.username);
      if (params?.limit) sp.set("limit", String(params.limit));
      if (params?.offset) sp.set("offset", String(params.offset));
      const qs = sp.toString();
      return request<{
        edits: Array<{
          versionId: string;
          nodeId: string;
          version: number;
          editorId: string | null;
          editorUsername: string | null;
          editMessage: string | null;
          createdAt: string;
          nodeSlug: string;
          nodeTitle: string;
          pathSlug: string;
          currentLessonVersion: number;
        }>;
      }>(`/mastery/lesson-edits${qs ? `?${qs}` : ""}`);
    },
    listLessonVersions: (nodeId: string) =>
      request<{
        versions: Array<{
          id: string;
          version: number;
          editorId: string | null;
          editorUsername: string | null;
          editMessage: string | null;
          createdAt: string;
        }>;
      }>(`/mastery/nodes/${nodeId}/lesson-versions`),
    restoreLessonVersion: (nodeId: string, version: number) =>
      request<{ lesson: { slides: any[] }; version: number }>(
        `/mastery/nodes/${nodeId}/lesson/restore/${version}`,
        { method: "POST" },
      ),
    postSlideEvent: (
      nodeId: string,
      slideIdx: number,
      kind: "viewed" | "answered_correct" | "answered_wrong",
    ) =>
      request<{ ok: true }>(`/mastery/nodes/${nodeId}/slide-event`, {
        method: "POST",
        body: JSON.stringify({ slideIdx, kind }),
      }),
    lessonAnalytics: (nodeId: string) =>
      request<{
        slideCount: number;
        slides: Array<{
          slideIdx: number;
          views: number;
          answeredCorrect: number;
          answeredWrong: number;
          dropOff: number;
          incorrectRate: number;
        }>;
      }>(`/mastery/nodes/${nodeId}/lesson-analytics`),
    summary: (username: string) =>
      request<MasterySummaryResponse>(`/mastery/users/${username}/summary`),
    nextNode: () => request<NextNodeResponse>("/mastery/next-node"),
    getLessonProgress: (nodeId: string) =>
      request<PathLessonProgressResponse>(`/mastery/lesson-progress/${nodeId}`),
    setLessonProgress: (nodeId: string, slideIdx: number) =>
      request<OkResponse>(`/mastery/lesson-progress/${nodeId}`, {
        method: "PUT",
        body: JSON.stringify({ slideIdx }),
      }),
    getLessonNotes: (nodeId: string) =>
      request<PathLessonNotesResponse>(`/mastery/lesson-notes/${nodeId}`),
    saveLessonNotes: (nodeId: string, body: string) =>
      request<{ ok: boolean; updatedAt: string }>(
        `/mastery/lesson-notes/${nodeId}`,
        { method: "PUT", body: JSON.stringify({ body }) },
      ),
    mistakes: () => request<QuizMistakesResponse>("/mastery/mistakes"),
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
    react: (slug: string, kind: "thumbs" | "lightbulb" | "mind_blown") =>
      request<ToggleForumReactionResponse>(`/forum/topics/${slug}/reactions`, {
        method: "POST",
        body: JSON.stringify({ kind }),
      }),
    toggleBookmark: (slug: string) =>
      request<{ bookmarked: boolean }>(`/forum/topics/${slug}/bookmark`, {
        method: "POST",
      }),
    bookmarks: () => request<ForumBookmarksResponse>("/forum/me/bookmarks"),
    votePoll: (pollId: string, optionId: string) =>
      request<PollVoteResponse>(`/forum/polls/${pollId}/vote`, {
        method: "POST",
        body: JSON.stringify({ optionId }),
      }),
    createTopicWithPoll: (data: {
      title: string;
      body: string;
      domainSlug: string;
      poll: CreateForumPollRequest;
    }) =>
      request<ForumCreateTopicResponse>("/forum/topics", {
        method: "POST",
        body: JSON.stringify({ ...data, postType: "poll" }),
      }),
  },
  gamification: {
    leaderboard: () => request<LeaderboardResponse>("/gamification/leaderboard"),
    dailyChallenge: () =>
      request<DailyChallengeResponse>("/gamification/daily-challenge"),
    submitDaily: (answer: string) =>
      request<DailyChallengeSubmitResponse>("/gamification/daily-challenge/submit", {
        method: "POST",
        body: JSON.stringify({ answer }),
      }),
    certificate: (pathSlug: string, username: string) =>
      request<PathCertificateResponse>(
        `/gamification/paths/${pathSlug}/certificate/${username}`,
      ),
  },
  social: {
    toggleFollow: (username: string) =>
      request<ToggleFollowResponse>(`/users/${username}/follow`, {
        method: "POST",
      }),
    followStats: (username: string) =>
      request<FollowStatsResponse>(`/users/${username}/follow-stats`),
    follows: (username: string) =>
      request<FollowsListResponse>(`/users/${username}/follows`),
    feed: () => request<FeedResponse>("/me/feed"),
    searchUsers: (q: string) =>
      request<{
        users: Array<{ username: string; displayName: string | null }>;
      }>(`/users?q=${encodeURIComponent(q)}`),
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
  onboarding: {
    status: () =>
      request<{ onboarded: boolean; startingPathSlug: string | null }>(
        "/onboarding/status",
      ),
    complete: (pathSlug?: string) =>
      request<{
        onboarded: true;
        startingPathSlug: string | null;
        firstNodeSlug: string | null;
      }>("/onboarding", {
        method: "POST",
        body: JSON.stringify(pathSlug ? { pathSlug } : {}),
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
    suggestTags: (data: { title: string; summary?: string; body?: string }) =>
      request<AiTagSuggestionsResponse>("/ai/news/tag-suggest", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    practiceQuestions: (pageSlug: string, tier = "intro") =>
      request<AiPracticeQuestionsResponse>("/ai/wiki/practice-questions", {
        method: "POST",
        body: JSON.stringify({ pageSlug, tier }),
      }),
    relatedNewsSemantic: (slug: string) =>
      request<NewsRelatedResponse>(`/ai/news/related-semantic/${slug}`),
    coachContext: (pageSlug?: string) => {
      const qs = pageSlug ? `?pageSlug=${encodeURIComponent(pageSlug)}` : "";
      return request<CoachContext>(`/ai/coach/context${qs}`);
    },
    coachSuggest: (pageSlug?: string) =>
      request<CoachSuggestionsResponse>("/ai/coach/suggest", {
        method: "POST",
        body: JSON.stringify({ pageSlug }),
      }),
    // Sprint 21 — research paper generator wizard endpoints. Streaming
    // endpoints (outline / draft-section / derive-tier) return a raw
    // Response so the caller can pipe them through streamTokens().
    paperOutline: (data: PaperOutlineRequest) =>
      fetch(`${BASE}/ai/paper/outline`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    paperDraftSection: (data: PaperDraftSectionRequest) =>
      fetch(`${BASE}/ai/paper/draft-section`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    paperSuggestViz: (section: { title: string; body: string }) =>
      request<PaperVizSuggestionsResponse>("/ai/paper/suggest-viz", {
        method: "POST",
        body: JSON.stringify({ section }),
      }),
    paperSuggestConcepts: (body: string) =>
      request<PaperConceptSuggestionsResponse>("/ai/paper/suggest-concepts", {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    paperSuggestReferences: (data: { title: string; body: string }) =>
      request<PaperReferenceSuggestionsResponse>(
        "/ai/paper/suggest-references",
        { method: "POST", body: JSON.stringify(data) },
      ),
    paperDeriveTier: (data: PaperDeriveTierRequest) =>
      fetch(`${BASE}/ai/paper/derive-tier`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
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
    list: (params?: { tag?: string; style?: "research" }) => {
      const sp = new URLSearchParams();
      if (params?.tag) sp.set("tag", params.tag);
      if (params?.style) sp.set("style", params.style);
      const qs = sp.toString();
      return request<NewsListResponse>(`/news${qs ? `?${qs}` : ""}`);
    },
    drafts: () => request<NewsListResponse>("/news/me/drafts"),
    tags: () => request<NewsTagsResponse>("/news/tags"),
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
    deriveLesson: (slug: string, body: { slides: any[] }) =>
      request<{ nodeId: string; nodeSlug: string; pathSlug: string }>(
        `/news/${slug}/derive-lesson`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    listClaimThreads: (slug: string) =>
      request<ClaimThreadsResponse>(`/news/${slug}/claim-threads`),
    createClaimThread: (slug: string, body: CreateClaimThreadRequest) =>
      request<{ threadId: string; commentId: string }>(
        `/news/${slug}/claim-threads`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    replyToClaimThread: (
      slug: string,
      threadId: string,
      body: CreateClaimThreadReplyRequest,
    ) =>
      request<{ commentId: string }>(
        `/news/${slug}/claim-threads/${threadId}/replies`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    listArtifacts: (slug: string) =>
      request<RunnableArtifactsResponse>(`/news/${slug}/artifacts`),
    addArtifact: (slug: string, body: CreateRunnableArtifactRequest) =>
      request<{ artifactId: string }>(`/news/${slug}/artifacts`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    deleteArtifact: (slug: string, id: string) =>
      request<OkResponse>(`/news/${slug}/artifacts/${id}`, { method: "DELETE" }),
    listReproductions: (slug: string) =>
      request<ReproductionsResponse>(`/news/${slug}/reproductions`),
    addReproduction: (slug: string, body: CreateReproductionRequest) =>
      request<{ reproductionId: string }>(`/news/${slug}/reproductions`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
  concepts: {
    preview: (slug: string) =>
      request<ConceptPreview>(`/concepts/${slug}/preview`),
  },
  research: {
    list: (params?: { tag?: string; format?: string }) => {
      const sp = new URLSearchParams();
      if (params?.tag) sp.set("tag", params.tag);
      if (params?.format) sp.set("format", params.format);
      const qs = sp.toString();
      return request<ResearchPapersListResponse>(
        `/research${qs ? `?${qs}` : ""}`,
      );
    },
    drafts: () =>
      request<ResearchPapersDraftsResponse>("/research/me/drafts"),
    byAuthor: (username: string) =>
      request<{
        papers: Array<{
          id: string;
          slug: string;
          title: string;
          summary: string;
          format: string;
          coverEmoji: string;
          accentColor: string;
          tags: string[];
          createdAt: string;
        }>;
      }>(`/research/by-author/${encodeURIComponent(username)}`),
    get: (slug: string, tier?: "intro" | "undergrad" | "grad") => {
      const qs = tier ? `?tier=${tier}` : "";
      return request<ResearchPaperResponse>(`/research/${slug}${qs}`);
    },
    create: (data: CreateResearchPaperRequest) =>
      request<{ paperId: string; slug: string }>("/research", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (slug: string, data: UpdateResearchPaperRequest) =>
      request<OkResponse>(`/research/${slug}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    listComments: (slug: string) =>
      request<NewsCommentsResponse>(`/research/${slug}/comments`),
    addComment: (slug: string, data: CreateNewsCommentRequest) =>
      request<{ commentId: string }>(`/research/${slug}/comments`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    listClaimThreads: (slug: string) =>
      request<ClaimThreadsResponse>(`/research/${slug}/claim-threads`),
    createClaimThread: (slug: string, body: CreateClaimThreadRequest) =>
      request<{ threadId: string; commentId: string }>(
        `/research/${slug}/claim-threads`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    replyToClaimThread: (
      slug: string,
      threadId: string,
      body: CreateClaimThreadReplyRequest,
    ) =>
      request<{ commentId: string }>(
        `/research/${slug}/claim-threads/${threadId}/replies`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    listArtifacts: (slug: string) =>
      request<RunnableArtifactsResponse>(`/research/${slug}/artifacts`),
    addArtifact: (slug: string, body: CreateRunnableArtifactRequest) =>
      request<{ artifactId: string }>(`/research/${slug}/artifacts`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    deleteArtifact: (slug: string, id: string) =>
      request<OkResponse>(`/research/${slug}/artifacts/${id}`, {
        method: "DELETE",
      }),
    listReproductions: (slug: string) =>
      request<ReproductionsResponse>(`/research/${slug}/reproductions`),
    addReproduction: (slug: string, body: CreateReproductionRequest) =>
      request<{ reproductionId: string }>(`/research/${slug}/reproductions`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
  capstones: {
    list: (params?: { tag?: string }) => {
      const sp = new URLSearchParams();
      if (params?.tag) sp.set("tag", params.tag);
      const qs = sp.toString();
      return request<CapstonesListResponse>(`/capstones${qs ? `?${qs}` : ""}`);
    },
    drafts: () =>
      request<{
        capstones: Array<{
          id: string;
          slug: string;
          title: string;
          summary: string;
          estimatedWeeks: number;
          coverEmoji: string;
          accentColor: string;
          tags: string[];
          updatedAt: string;
        }>;
      }>("/capstones/me/drafts"),
    enrollments: () =>
      request<CapstoneEnrollmentsResponse>("/capstones/me/enrollments"),
    get: (slug: string, tier?: "intro" | "undergrad" | "grad") => {
      const qs = tier ? `?tier=${tier}` : "";
      return request<CapstoneResponse>(`/capstones/${slug}${qs}`);
    },
    create: (data: CreateCapstoneRequest) =>
      request<{ capstoneId: string; slug: string }>("/capstones", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (slug: string, data: UpdateCapstoneRequest) =>
      request<OkResponse>(`/capstones/${slug}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    addMilestone: (slug: string, data: CreateMilestoneRequest) =>
      request<{ milestoneId: string }>(`/capstones/${slug}/milestones`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateMilestone: (slug: string, id: string, data: UpdateMilestoneRequest) =>
      request<OkResponse>(`/capstones/${slug}/milestones/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    deleteMilestone: (slug: string, id: string) =>
      request<OkResponse>(`/capstones/${slug}/milestones/${id}`, {
        method: "DELETE",
      }),
    enroll: (slug: string) =>
      request<{ enrollmentId: string }>(`/capstones/${slug}/enroll`, {
        method: "POST",
      }),
    submit: (slug: string, milestoneId: string, data: SubmitMilestoneRequest) =>
      request<{ submission: CapstoneSubmission }>(
        `/capstones/${slug}/milestones/${milestoneId}/submit`,
        { method: "POST", body: JSON.stringify(data) },
      ),
    artifact: (artifactSlug: string) =>
      request<CapstoneArtifactPageResponse>(`/capstones/c/${artifactSlug}`),
  },
  users: {
    portfolio: (username: string) =>
      request<PortfolioResponse>(`/users/${encodeURIComponent(username)}/portfolio`),
  },
  me: {
    weakConcepts: () => request<WeakConceptsResponse>("/me/weak-concepts"),
    refreshWeakConcepts: () =>
      request<{ upserts: number }>("/me/weak-concepts/refresh", { method: "POST" }),
    dismissWeakConcept: (id: string) =>
      request<OkResponse>(`/me/weak-concepts/${id}/dismiss`, { method: "POST" }),
    prereqStatus: (wikiSlugs: string[]) => {
      const sp = new URLSearchParams();
      sp.set("wikiSlugs", wikiSlugs.join(","));
      return request<PrereqXrayResponse>(`/me/prereq-status?${sp.toString()}`);
    },
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

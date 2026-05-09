// Sprint 54 — onboarding-stated goals.
export type OnboardingGoal =
  | "complete_track"
  | "finish_path"
  | "publish_paper"
  | "join_cohort"
  | "ship_misconception";

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
  ResearchFeedResponse,
  GrantsListResponse,
  GrantsBookmarksResponse,
  GrantsFeedResponse,
  GrantDetailResponse,
  AuthorProfileResponse,
  AuthorClaimRequest,
  PaperAuthorQuestionsResponse,
  ExamSummary,
  ExamDetail,
  ExamAttemptState,
  ExamSubmitResponse,
  ExamHistoryEntry,
  ExamQuestionPayload,
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
  KnowledgeMri,
  VersionListResponse,
  ResearchPaperVersionResponse,
  CapstoneVersionResponse,
  ArgumentMapResponse,
  CapstonePeerReviewsResponse,
  CapstoneReviewQueueResponse,
  PeerReviewStatus,
  MisconceptionSubmissionListResponse,
  MisconceptionSubmissionDetailResponse,
  MisconceptionVoteResponse,
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
  SearchNavigatorResponse,
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

// Default network timeout for API requests. A hung backend (slow query,
// dropped connection, server stuck) would otherwise leave the UI in a
// perma-loading skeleton state. Caller can opt out by passing a
// `signal` in opts that overrides this.
const DEFAULT_TIMEOUT_MS = 20_000;

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  // If the caller supplied their own AbortSignal, respect it. Otherwise
  // wire up a timeout so a stuck request rejects cleanly.
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  let signal = opts?.signal;
  if (!signal) {
    const ctrl = new AbortController();
    timeoutId = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, DEFAULT_TIMEOUT_MS);
    signal = ctrl.signal;
  }

  try {
    const res = await fetch(`${BASE}${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...opts?.headers },
      ...opts,
      signal,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(res.status, body.error || "Unknown error");
    }

    return res.json();
  } catch (err: any) {
    // Distinguish OUR timeout from a caller-initiated cancel. The
    // caller's AbortError should propagate unchanged so consumers can
    // treat it as a normal cancellation.
    if (err?.name === "AbortError" && timedOut) {
      throw new ApiError(
        0,
        `Request timed out after ${Math.round(DEFAULT_TIMEOUT_MS / 1000)}s. The server may be slow or unreachable.`,
      );
    }
    throw err;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
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
  argumentMap: {
    topic: (slug: string) =>
      request<ArgumentMapResponse>(
        `/forum/graph?slug=${encodeURIComponent(slug)}`,
      ),
  },
  misconceptions: {
    list: (params?: { sort?: "votes" | "recent" | "decided"; status?: string; limit?: number }) => {
      const sp = new URLSearchParams();
      if (params?.sort) sp.set("sort", params.sort);
      if (params?.status) sp.set("status", params.status);
      if (params?.limit) sp.set("limit", String(params.limit));
      const qs = sp.toString();
      return request<MisconceptionSubmissionListResponse>(
        `/misconceptions${qs ? `?${qs}` : ""}`,
      );
    },
    get: (id: string) =>
      request<MisconceptionSubmissionDetailResponse>(`/misconceptions/${id}`),
    submit: (data: {
      conceptSlug: string;
      key: string;
      label: string;
      description: string;
      probeQuestions?: string[];
      correctionPromptTemplate?: string;
    }) =>
      request<{ id: string; voteScore: number }>("/misconceptions", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    vote: (id: string, value: -1 | 0 | 1) =>
      request<MisconceptionVoteResponse>(`/misconceptions/${id}/vote`, {
        method: "POST",
        body: JSON.stringify({ value }),
      }),
  },
  versions: {
    paperList: (slug: string) =>
      request<VersionListResponse>(`/research/${slug}/versions`),
    paperGet: (slug: string, version: number) =>
      request<ResearchPaperVersionResponse>(
        `/research/${slug}/versions/${version}`,
      ),
    capstoneList: (slug: string) =>
      request<VersionListResponse>(`/capstones/${slug}/versions`),
    capstoneGet: (slug: string, version: number) =>
      request<CapstoneVersionResponse>(
        `/capstones/${slug}/versions/${version}`,
      ),
  },
  citations: {
    paper: (slug: string) =>
      request<{
        slug: string;
        title: string;
        authors: string[];
        year: number;
        url: string;
        permalink: string;
        bibtex: string;
        ris: string;
        plain: string;
      }>(`/research/${slug}/cite`),
    capstone: (slug: string) =>
      request<{
        slug: string;
        title: string;
        authors: string[];
        year: number;
        url: string;
        permalink: string;
        bibtex: string;
        ris: string;
        plain: string;
      }>(`/capstones/${slug}/cite`),
  },
  search: {
    query: (q: string, limit?: number) => {
      const sp = new URLSearchParams({ q });
      if (limit) sp.set("limit", String(limit));
      return request<SearchResponse>(`/search?${sp.toString()}`);
    },
    navigator: (q: string, limit?: number) => {
      const sp = new URLSearchParams({ q, navigator: "1" });
      if (limit) sp.set("limit", String(limit));
      return request<SearchNavigatorResponse>(`/search?${sp.toString()}`);
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
      request<{
        onboarded: boolean;
        startingPathSlug: string | null;
        onboardingGoal: OnboardingGoal | null;
      }>("/onboarding/status"),
    complete: (pathSlug?: string, goal?: OnboardingGoal) =>
      request<{
        onboarded: true;
        startingPathSlug: string | null;
        firstNodeSlug: string | null;
      }>("/onboarding", {
        method: "POST",
        body: JSON.stringify({
          ...(pathSlug ? { pathSlug } : {}),
          ...(goal ? { goal } : {}),
        }),
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
    // Sprint 70 — for-you feed.
    feed: (perRail?: number) => {
      const sp = new URLSearchParams();
      if (perRail) sp.set("perRail", String(perRail));
      const qs = sp.toString();
      return request<ResearchFeedResponse>(
        `/research/feed${qs ? `?${qs}` : ""}`,
      );
    },
    // Sprint 70 — cached tier-aware summary lookup. Returns
    // `{ cached: false }` when no summary exists yet (callers should
    // open a streaming connection to generate one).
    cachedSummary: (
      slug: string,
      tier: "intro" | "undergrad" | "grad",
    ) =>
      request<
        | { cached: false }
        | {
            cached: true;
            tier: string;
            modelId: string;
            summaryMd: string;
            generatedAt: string;
          }
      >(`/research/${slug}/summary?tier=${tier}`),
  },
  // Sprint 73 — Exam mastery framework.
  exams: {
    list: () => request<{ items: ExamSummary[] }>("/exams"),
    get: (slug: string) =>
      request<{ exam: ExamDetail }>(`/exams/${encodeURIComponent(slug)}`),
    startAttempt: (
      slug: string,
      body: { mode: "full_mock" | "section" | "adaptive"; sectionSlug?: string },
    ) =>
      request<{
        id: string;
        mode: string;
        expiresAt: string | null;
      }>(`/exams/${encodeURIComponent(slug)}/attempts`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    getAttempt: (id: string) =>
      request<ExamAttemptState>(
        `/exams/attempts/${encodeURIComponent(id)}`,
      ),
    recordAnswer: (
      id: string,
      body: {
        questionId: string;
        selectedIndex: number | null;
        timeSpentMs?: number;
        flagged?: boolean;
      },
    ) =>
      request<{ ok: boolean }>(
        `/exams/attempts/${encodeURIComponent(id)}/answer`,
        { method: "PUT", body: JSON.stringify(body) },
      ),
    submitAttempt: (id: string) =>
      request<ExamSubmitResponse>(
        `/exams/attempts/${encodeURIComponent(id)}/submit`,
        { method: "POST" },
      ),
    nextAdaptive: (id: string) =>
      request<{ question: ExamQuestionPayload | null; difficulty?: number; done?: boolean }>(
        `/exams/attempts/${encodeURIComponent(id)}/next-adaptive`,
        { method: "POST" },
      ),
    history: (slug: string) =>
      request<{ items: ExamHistoryEntry[] }>(
        `/exams/${encodeURIComponent(slug)}/history`,
      ),
  },
  // Sprint 72 — Author profile, claims, paper-author Q&A.
  authors: {
    get: (username: string) =>
      request<AuthorProfileResponse>(
        `/authors/${encodeURIComponent(username)}`,
      ),
  },
  authorClaims: {
    submit: (body: {
      externalPaperId: string;
      ordinal: number;
      evidenceText?: string;
      evidenceUrl?: string | null;
    }) =>
      request<{ id: string; status: string; duplicate?: boolean }>(
        "/author-claims",
        { method: "POST", body: JSON.stringify(body) },
      ),
    mine: () =>
      request<{ items: AuthorClaimRequest[] }>("/author-claims/me"),
  },
  externalPaperQuestions: {
    list: (paperId: string, ordinal: number) =>
      request<PaperAuthorQuestionsResponse>(
        `/external-papers/${encodeURIComponent(paperId)}/authors/${ordinal}/questions`,
      ),
    submit: (
      paperId: string,
      ordinal: number,
      body: { content: string; parentId?: string },
    ) =>
      request<{ id: string }>(
        `/external-papers/${encodeURIComponent(paperId)}/authors/${ordinal}/questions`,
        { method: "POST", body: JSON.stringify(body) },
      ),
  },
  // Sprint 71 — Funding feed.
  grants: {
    list: (params?: {
      agency?: string;
      source?: "nih" | "nsf" | "grants_gov";
      withinDays?: number;
      q?: string;
      limit?: number;
    }) => {
      const sp = new URLSearchParams();
      if (params?.agency) sp.set("agency", params.agency);
      if (params?.source) sp.set("source", params.source);
      if (params?.withinDays != null)
        sp.set("withinDays", String(params.withinDays));
      if (params?.q) sp.set("q", params.q);
      if (params?.limit) sp.set("limit", String(params.limit));
      const qs = sp.toString();
      return request<GrantsListResponse>(`/grants${qs ? `?${qs}` : ""}`);
    },
    feed: (limit?: number) => {
      const qs = limit ? `?limit=${limit}` : "";
      return request<GrantsFeedResponse>(`/grants/feed${qs}`);
    },
    get: (id: string) =>
      request<GrantDetailResponse>(`/grants/${encodeURIComponent(id)}`),
    bookmarks: () =>
      request<GrantsBookmarksResponse>("/grants/me/bookmarks"),
    toggleBookmark: (id: string) =>
      request<{ bookmarked: boolean }>(
        `/grants/${encodeURIComponent(id)}/bookmark`,
        { method: "POST" },
      ),
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
    artifactReviews: (artifactSlug: string) =>
      request<CapstonePeerReviewsResponse>(
        `/capstones/c/${artifactSlug}/reviews`,
      ),
    submitPeerReview: (
      submissionId: string,
      body: { status: PeerReviewStatus; score: number; feedback: string },
    ) =>
      request<{ id: string; updated: boolean }>(
        `/capstones/submissions/${submissionId}/reviews`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    deletePeerReview: (id: string) =>
      request<OkResponse>(`/capstones/reviews/${id}`, { method: "DELETE" }),
    reviewQueue: (limit?: number) => {
      const qs = limit ? `?limit=${limit}` : "";
      return request<CapstoneReviewQueueResponse>(
        `/capstones/review-queue${qs}`,
      );
    },
  },
  tracks: {
    list: () =>
      request<{
        tracks: Array<{
          id: string;
          slug: string;
          title: string;
          summary: string;
          coverEmoji: string;
          accentColor: string;
          tags: string[];
          capstoneCount: number;
          requiredCount: number;
          optionalCount: number;
          earnedBy: number;
          updatedAt: string;
        }>;
      }>("/tracks"),
    get: (slug: string, tier?: "intro" | "undergrad" | "grad") => {
      const qs = tier ? `?tier=${tier}` : "";
      return request<{
        track: {
          id: string;
          slug: string;
          title: string;
          summary: string;
          coverEmoji: string;
          accentColor: string;
          tags: string[];
          status: string;
          authorId: string;
          canonicalTier: string;
          tier: "intro" | "undergrad" | "grad";
          content: string;
          allContent: { intro: string; undergrad: string; grad: string };
          totalEstimatedWeeks: number;
          createdAt: string;
          updatedAt: string;
        };
        capstones: Array<{
          slug: string;
          title: string;
          summary: string;
          coverEmoji: string;
          accentColor: string;
          estimatedWeeks: number;
          order: number;
          optional: boolean;
          status: "completed" | "in_progress" | "not_started";
          artifactPageSlug: string | null;
        }>;
        myCompletion: {
          artifactPageSlug: string;
          completedAt: string;
        } | null;
      }>(`/tracks/${slug}${qs}`);
    },
    create: (data: {
      slug: string;
      title: string;
      summary?: string;
      contentIntro?: string;
      contentUndergrad?: string;
      contentGrad?: string;
      canonicalTier?: "intro" | "undergrad" | "grad";
      coverEmoji?: string;
      accentColor?: string;
      tags?: string[];
      status?: "draft" | "published";
    }) =>
      request<{ id: string; slug: string }>("/tracks", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (
      slug: string,
      data: Partial<{
        title: string;
        summary: string;
        contentIntro: string;
        contentUndergrad: string;
        contentGrad: string;
        canonicalTier: "intro" | "undergrad" | "grad";
        coverEmoji: string;
        accentColor: string;
        tags: string[];
        status: "draft" | "published";
      }>,
    ) =>
      request<OkResponse>(`/tracks/${slug}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    attach: (
      slug: string,
      body: { capstoneSlug: string; order?: number; optional?: boolean },
    ) =>
      request<OkResponse>(`/tracks/${slug}/capstones`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    detach: (slug: string, capstoneSlug: string) =>
      request<OkResponse>(
        `/tracks/${slug}/capstones/${encodeURIComponent(capstoneSlug)}`,
        { method: "DELETE" },
      ),
    artifact: (artifactSlug: string) =>
      request<{
        artifactPageSlug: string;
        completedAt: string;
        track: {
          slug: string;
          title: string;
          summary: string;
          coverEmoji: string;
          accentColor: string;
        };
        learner: { username: string; displayName: string | null };
        manifest: unknown;
        signature: string | null;
      }>(`/tracks/c/${artifactSlug}`),
  },
  cohortInvitations: {
    peek: (token: string) =>
      request<{
        invitation: {
          id: string;
          status: "pending" | "accepted" | "declined" | "revoked";
          email: string;
          message: string;
          createdAt: string;
          decidedAt: string | null;
        };
        cohort: {
          slug: string;
          name: string;
          description: string;
          visibility: "open" | "invite";
          capstoneSlug: string | null;
        };
        inviter: { username: string; displayName: string | null };
      }>(`/cohort-invitations/${token}`),
    accept: (token: string) =>
      request<{ ok: boolean; cohortSlug: string | null }>(
        `/cohort-invitations/${token}/accept`,
        { method: "POST" },
      ),
    decline: (token: string) =>
      request<OkResponse>(`/cohort-invitations/${token}/decline`, {
        method: "POST",
      }),
  },
  users: {
    portfolio: (username: string) =>
      request<PortfolioResponse>(`/users/${encodeURIComponent(username)}/portfolio`),
  },
  // Sprint 64c — mentor relationship API. The schema landed in S43;
  // this is the first frontend surface that touches it.
  mentors: {
    list: () =>
      request<{
        mentors: Array<{
          username: string;
          displayName: string | null;
          menteeCount: number;
        }>;
      }>("/mentors"),
    me: () =>
      request<{
        asMentee: Array<{
          id: string;
          mentorId: string;
          mentorUsername: string;
          status: "pending" | "accepted" | "declined" | "ended";
          scope: string;
          requestedAt: string;
          respondedAt: string | null;
        }>;
        asMentor: Array<{
          id: string;
          menteeId: string;
          menteeUsername: string;
          status: "pending" | "accepted" | "declined" | "ended";
          scope: string;
          requestedAt: string;
          respondedAt: string | null;
        }>;
      }>("/mentors/me"),
    request: (mentorUsername: string, scope: string) =>
      request<{ id: string }>("/mentors/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mentorUsername, scope }),
      }),
    respond: (id: string, status: "accepted" | "declined" | "ended") =>
      request<OkResponse>(`/mentors/${id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
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
    knowledgeMri: () => request<KnowledgeMri>("/me/knowledge-mri"),
    trackCompletions: () =>
      request<{
        completions: Array<{
          id: string;
          trackId: string;
          artifactPageSlug: string;
          completedAt: string;
          trackSlug: string;
          trackTitle: string;
          coverEmoji: string;
          accentColor: string;
        }>;
      }>("/me/track-completions"),
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

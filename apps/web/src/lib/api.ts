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
  ProtocolListResponse,
  ProtocolDetailResponse,
  ProtocolVersionsResponse,
  CreateProtocolRequest,
  UpdateProtocolRequest,
  ReplaceProtocolStepsRequest,
  EquipmentListResponse,
  EquipmentDetailResponse,
  CreateEquipmentRequest,
  UpdateEquipmentRequest,
  ReplaceEquipmentOperationsRequest,
  LabPlaybookResponse,
  LabRosterResponse,
  LabSkillMriResponse,
  AssignLabWorkRequest,
  SafetyCertListResponse,
  SafetyCertWithQuestionsResponse,
  SafetyCertAttemptResponse,
  UserSafetyCertsResponse,
  ProtocolRunListResponse,
  ProtocolRunDetailResponse,
  StartProtocolRunResponse,
  StepUpdateRequest,
  SignOffRequest,
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
  PrimaryPersona,
  UserNodeProgress,
  WikiListResponse,
  WikiPage,
  WikiPageResponse,
  WikiSearchResponse,
  WikiUpdateResponse,
  // S86 — classes + pets.
  ClassesListResponse,
  ClassDetailResponse,
  ClassLeaderboardResponse,
  LeaderboardWindow,
  ClassAttendanceResponse,
  ClassTaskSubmissionsResponse,
  ClassRole,
  CreateClassRequest,
  UpdateClassRequest,
  CreateClassTaskRequest,
  UpdateClassTaskRequest,
  CompleteClassTaskRequest,
  CompleteClassTaskResponse,
  GradeClassTaskRequest,
  RecordAttendanceRequest,
  GrantCosmeticRequest,
  MyPetResponse,
  HatchAnotherPetResponse,
  PetCosmeticsCatalogResponse,
  // S87 — competitions + per-username pet display.
  CompetitionsListResponse,
  CompetitionDetailResponse,
  CreateCompetitionRequest,
  UpdateCompetitionRequest,
  UserPetDisplay,
  // Phase L — pet skin types.
  PetSkinDef,
  SkinShopResponse,
  // Phase N — skin showcase response.
  PetSkinShowcaseResponse,
  // S97 — pet showcase.
  PetShowcaseResponse,
  // S98 — profile cosmetic gallery.
  CosmeticGalleryResponse,
  // S102 — public class directory.
  DiscoverClassesResponse,
  // S89 — XP shop.
  ShopResponse,
  BuyCosmeticRequest,
  BuyCosmeticResponse,
  XpBalanceResponse,
  // S93 — instructor analytics.
  ClassAnalyticsResponse,
  // S94 — student progress dashboard.
  MyProgressResponse,
  // S96 — class question of the day.
  ClassQuestionActiveResponse,
  ClassQuestionListResponse,
  CreateClassQuestionRequest,
  AnswerClassQuestionRequest,
  AnswerClassQuestionResponse,
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
      throw new ApiError(res.status, body.error || "Unknown error", body);
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
  constructor(
    public status: number,
    message: string,
    public body?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const api = {
  auth: {
    signup: (data: {
      username: string;
      email: string;
      password: string;
      turnstileToken?: string;
    }) =>
      request<AuthResponse>("/auth/signup", { method: "POST", body: JSON.stringify(data) }),
    login: (data: { email: string; password: string }) =>
      request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(data) }),
    logout: () => request<OkResponse>("/auth/logout", { method: "POST" }),
    me: () => request<MeResponse>("/auth/me"),
    verifyEmail: (token: string) =>
      request<OkResponse>("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) }),
    resendVerify: () => request<OkResponse>("/auth/resend-verify", { method: "POST" }),
    // S109 — password recovery + rotation.
    forgotPassword: (email: string) =>
      request<void>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    resetPassword: (token: string, newPassword: string) =>
      request<OkResponse>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword }),
      }),
    changePassword: (currentPassword: string, newPassword: string) =>
      request<{ ok: true; otherSessionsRevoked: number }>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
    verifyEmailChange: (token: string) =>
      request<{ ok: true; newEmail: string }>("/auth/verify-email-change", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),
  },
  feedback: {
    submit: (data: { kind: "bug" | "idea" | "praise"; message: string }) =>
      request<OkResponse>("/feedback", { method: "POST", body: JSON.stringify(data) }),
    // S109 — admin inbox. Returns the 200 most recent reports.
    listAdmin: () =>
      request<{
        reports: Array<{
          id: string;
          userId: string | null;
          kind: string;
          message: string;
          currentUrl: string | null;
          browserUa: string | null;
          createdAt: string;
        }>;
      }>("/feedback/admin"),
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
    // Phase 16C — admin queue + moderation actions.
    // Phase 17A — cursor pagination so the page doesn't load the
    // entire backlog into memory at once.
    moderateQueue: (params?: { cursor?: string; limit?: number }) => {
      const sp = new URLSearchParams();
      if (params?.cursor) sp.set("cursor", params.cursor);
      if (params?.limit) sp.set("limit", String(params.limit));
      const qs = sp.toString();
      return request<{
        submissions: Array<{
          id: string;
          conceptSlug: string;
          key: string;
          label: string;
          description: string;
          status: string;
          voteScore: number;
          catalogId: string | null;
          proposerUsername: string;
          createdAt: string;
          decidedAt: string | null;
        }>;
        hasMore: boolean;
        nextCursor: string | null;
      }>(`/misconceptions/moderate/queue${qs ? `?${qs}` : ""}`);
    },
    moderate: (id: string, action: "approve" | "reject") =>
      request<{ status: string; catalogId: string | null }>(
        `/misconceptions/${id}/moderate`,
        {
          method: "POST",
          body: JSON.stringify({ action }),
        },
      ),
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
        primaryPersona: PrimaryPersona | null;
      }>("/onboarding/status"),
    complete: (
      pathSlug?: string,
      goal?: OnboardingGoal,
      persona?: PrimaryPersona | null,
    ) =>
      request<{
        onboarded: true;
        startingPathSlug: string | null;
        firstNodeSlug: string | null;
      }>("/onboarding", {
        method: "POST",
        body: JSON.stringify({
          ...(pathSlug ? { pathSlug } : {}),
          ...(goal ? { goal } : {}),
          ...(persona ? { persona } : {}),
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
    // Phase 29D — fused research-frontier rail.
    frontier: (limit?: number) => {
      const sp = new URLSearchParams();
      if (limit) sp.set("limit", String(limit));
      const qs = sp.toString();
      return request<{
        personalized: boolean;
        items: Array<{
          kind:
            | "paper"
            | "external_paper"
            | "bounty"
            | "needs_reproduction"
            | "grant";
          id: string;
          title: string;
          url: string;
          score: number;
          reason: string;
          breakdown: {
            relevance: number;
            weakness: number;
            urgency: number;
            reproGap: number;
            total: number;
          };
        }>;
      }>(`/research/feed/frontier${qs ? `?${qs}` : ""}`);
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
        selectedIndex?: number | null;
        // Sprint 75 — essay free-text response. Pass either this OR
        // selectedIndex depending on question type; the server
        // updates only the field provided.
        essayResponse?: string | null;
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
    list: (params?: { tag?: string; scaleTier?: "skill_drill" | "long_arc" }) => {
      const sp = new URLSearchParams();
      if (params?.tag) sp.set("tag", params.tag);
      if (params?.scaleTier) sp.set("scaleTier", params.scaleTier);
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
          scaleTier: "skill_drill" | "long_arc";
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
  classes: {
    list: () => request<ClassesListResponse>("/classes"),
    create: (data: CreateClassRequest) =>
      request<{ classId: string; slug: string; joinCode: string }>("/classes", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    get: (slug: string) => request<ClassDetailResponse>(`/classes/${slug}`),
    update: (slug: string, data: UpdateClassRequest) =>
      request<OkResponse>(`/classes/${slug}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    enroll: (slug: string, joinCode: string) =>
      request<{ enrollmentId: string; role: ClassRole }>(`/classes/${slug}/enroll`, {
        method: "POST",
        body: JSON.stringify({ joinCode }),
      }),
    rotateCode: (slug: string) =>
      request<{ joinCode: string }>(`/classes/${slug}/rotate-code`, { method: "POST" }),
    setMemberRole: (slug: string, userId: string, role: ClassRole) =>
      request<OkResponse>(`/classes/${slug}/members/${userId}/role`, {
        method: "PUT",
        body: JSON.stringify({ role }),
      }),
    leaderboard: (slug: string, windowName?: LeaderboardWindow) =>
      request<ClassLeaderboardResponse>(
        `/classes/${slug}/leaderboard${windowName ? `?window=${windowName}` : ""}`,
      ),
    createTask: (slug: string, data: CreateClassTaskRequest) =>
      request<{ taskId: string }>(`/classes/${slug}/tasks`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateTask: (slug: string, taskId: string, data: UpdateClassTaskRequest) =>
      request<OkResponse>(`/classes/${slug}/tasks/${taskId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    deleteTask: (slug: string, taskId: string) =>
      request<OkResponse>(`/classes/${slug}/tasks/${taskId}`, { method: "DELETE" }),
    completeTask: (slug: string, taskId: string, data: CompleteClassTaskRequest) =>
      request<CompleteClassTaskResponse>(`/classes/${slug}/tasks/${taskId}/complete`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    gradeTask: (slug: string, taskId: string, userId: string, data: GradeClassTaskRequest) =>
      request<{ ok: true; xpGranted: number }>(
        `/classes/${slug}/tasks/${taskId}/grade/${userId}`,
        { method: "POST", body: JSON.stringify(data) },
      ),
    taskSubmissions: (slug: string, taskId: string) =>
      request<ClassTaskSubmissionsResponse>(`/classes/${slug}/tasks/${taskId}/submissions`),
    // Phase 21 — AI-personalized assignment variants.
    generateTaskVariants: (slug: string, taskId: string, regenerate = false) =>
      request<{
        generated: number;
        skipped: number;
        errors: Array<{ studentId: string; reason: string }>;
      }>(`/classes/${slug}/tasks/${taskId}/variants`, {
        method: "POST",
        body: JSON.stringify({ regenerate }),
      }),
    listTaskVariants: (slug: string, taskId: string) =>
      request<{
        variants: Array<{
          id: string;
          studentId: string;
          studentUsername: string;
          studentDisplayName: string | null;
          promptMd: string;
          rubric: {
            criteria: Array<{ id: string; description: string; weight?: number }>;
            passingScore: number;
          } | null;
          rationale: string;
          generatedAt: string;
        }>;
      }>(`/classes/${slug}/tasks/${taskId}/variants`),
    myTaskVariant: (slug: string, taskId: string) =>
      request<{
        variant: {
          id: string;
          promptMd: string;
          rubric: {
            criteria: Array<{ id: string; description: string; weight?: number }>;
            passingScore: number;
          } | null;
          generatedAt: string;
        } | null;
      }>(`/classes/${slug}/tasks/${taskId}/variant`),
    // Phase 22C — instructor inline-edit. Lets the instructor
    // hand-tune a generated variant instead of burning another AI
    // call on Regenerate when the AI mostly got it right.
    updateTaskVariant: (
      slug: string,
      taskId: string,
      studentId: string,
      data: {
        promptMd?: string;
        rubric?: {
          criteria: Array<{ id: string; description: string; weight?: number }>;
          passingScore: number;
        };
        rationale?: string;
      },
    ) =>
      request<{ ok: true }>(
        `/classes/${slug}/tasks/${taskId}/variants/${studentId}`,
        {
          method: "PUT",
          body: JSON.stringify(data),
        },
      ),
    // Phase 23A — class stream / announcements.
    listAnnouncements: (slug: string) =>
      request<{
        announcements: Array<{
          id: string;
          authorId: string;
          authorUsername: string;
          authorDisplayName: string | null;
          bodyMd: string;
          pinned: boolean;
          createdAt: string;
          updatedAt: string;
        }>;
      }>(`/classes/${slug}/announcements`),
    createAnnouncement: (
      slug: string,
      data: { bodyMd: string; pinned?: boolean },
    ) =>
      request<{ id: string }>(`/classes/${slug}/announcements`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateAnnouncement: (
      slug: string,
      id: string,
      data: { bodyMd?: string; pinned?: boolean },
    ) =>
      request<OkResponse>(`/classes/${slug}/announcements/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    deleteAnnouncement: (slug: string, id: string) =>
      request<OkResponse>(`/classes/${slug}/announcements/${id}`, {
        method: "DELETE",
      }),
    // Phase 24A — per-task discussion threads.
    listTaskDiscussions: (slug: string, taskId: string) =>
      request<{
        posts: Array<{
          id: string;
          userId: string;
          username: string;
          displayName: string | null;
          bodyMd: string;
          createdAt: string;
          updatedAt: string;
        }>;
      }>(`/classes/${slug}/tasks/${taskId}/discussions`),
    postTaskDiscussion: (slug: string, taskId: string, bodyMd: string) =>
      request<{ id: string }>(
        `/classes/${slug}/tasks/${taskId}/discussions`,
        {
          method: "POST",
          body: JSON.stringify({ bodyMd }),
        },
      ),
    updateTaskDiscussion: (
      slug: string,
      taskId: string,
      id: string,
      bodyMd: string,
    ) =>
      request<OkResponse>(
        `/classes/${slug}/tasks/${taskId}/discussions/${id}`,
        {
          method: "PUT",
          body: JSON.stringify({ bodyMd }),
        },
      ),
    deleteTaskDiscussion: (slug: string, taskId: string, id: string) =>
      request<OkResponse>(
        `/classes/${slug}/tasks/${taskId}/discussions/${id}`,
        { method: "DELETE" },
      ),
    // Phase 24B — non-graded class materials.
    listMaterials: (slug: string) =>
      request<{
        materials: Array<{
          id: string;
          title: string;
          descriptionMd: string;
          url: string | null;
          kind: "note" | "link" | "file";
          sortOrder: number;
          createdAt: string;
          updatedAt: string;
        }>;
      }>(`/classes/${slug}/materials`),
    createMaterial: (
      slug: string,
      data: {
        title: string;
        descriptionMd?: string;
        url?: string | null;
        kind?: "note" | "link" | "file";
        sortOrder?: number;
      },
    ) =>
      request<{ id: string }>(`/classes/${slug}/materials`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateMaterial: (
      slug: string,
      id: string,
      data: {
        title?: string;
        descriptionMd?: string;
        url?: string | null;
        kind?: "note" | "link" | "file";
        sortOrder?: number;
      },
    ) =>
      request<OkResponse>(`/classes/${slug}/materials/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    deleteMaterial: (slug: string, id: string) =>
      request<OkResponse>(`/classes/${slug}/materials/${id}`, {
        method: "DELETE",
      }),
    // Phase 24D — clone a task into another instructor-owned class.
    cloneTask: (slug: string, taskId: string, targetClassSlug: string) =>
      request<{ taskId: string; targetClassSlug: string }>(
        `/classes/${slug}/tasks/${taskId}/clone`,
        {
          method: "POST",
          body: JSON.stringify({ targetClassSlug }),
        },
      ),
    // Phase 23B — gradebook matrix.
    gradebook: (slug: string) =>
      request<{
        tasks: Array<{
          id: string;
          title: string;
          kind: string;
          dueAt: string | null;
          topic: string | null;
        }>;
        students: Array<{
          userId: string;
          username: string;
          displayName: string | null;
        }>;
        cells: Array<{
          taskId: string;
          userId: string;
          status: "missing" | "submitted" | "passed" | "failed";
          score: number | null;
          maxScore: number | null;
          wasLate: boolean;
          submittedAt: string | null;
          aiGenerated: boolean;
        }>;
      }>(`/classes/${slug}/gradebook`),
    recordAttendance: (slug: string, data: RecordAttendanceRequest) =>
      request<{ ok: true; xpGrants: Array<{ userId: string; amount: number }> }>(
        `/classes/${slug}/attendance`,
        { method: "POST", body: JSON.stringify(data) },
      ),
    getAttendance: (slug: string, date?: string) => {
      const qs = date ? `?date=${encodeURIComponent(date)}` : "";
      return request<ClassAttendanceResponse>(`/classes/${slug}/attendance${qs}`);
    },
    grantCosmetic: (slug: string, data: GrantCosmeticRequest) =>
      request<{ ok: true; alreadyOwned: boolean }>(`/classes/${slug}/grant-cosmetic`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    // S87 — competitions namespace.
    // S103 — bulk grade many submissions in one call.
    bulkGradeTask: (
      slug: string,
      taskId: string,
      grades: Array<{ userId: string; pass: boolean; feedback?: string | null }>,
    ) =>
      request<{
        ok: true;
        appliedCount: number;
        skippedCount: number;
        xpAwardedTotal: number;
      }>(`/classes/${slug}/tasks/${taskId}/bulk-grade`, {
        method: "POST",
        body: JSON.stringify({ grades }),
      }),
    listCompetitions: (slug: string) =>
      request<CompetitionsListResponse>(`/classes/${slug}/competitions`),
    getCompetition: (slug: string, competitionId: string) =>
      request<CompetitionDetailResponse>(`/classes/${slug}/competitions/${competitionId}`),
    createCompetition: (slug: string, data: CreateCompetitionRequest) =>
      request<{ competitionId: string }>(`/classes/${slug}/competitions`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateCompetition: (slug: string, competitionId: string, data: UpdateCompetitionRequest) =>
      request<OkResponse>(`/classes/${slug}/competitions/${competitionId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    publishCompetition: (slug: string, competitionId: string) =>
      request<OkResponse>(`/classes/${slug}/competitions/${competitionId}/publish`, {
        method: "POST",
      }),
    endCompetition: (slug: string, competitionId: string) =>
      request<{ ok: true; winners?: string[]; alreadyEnded?: boolean }>(
        `/classes/${slug}/competitions/${competitionId}/end`,
        { method: "POST" },
      ),
    // S93 — instructor analytics dashboard.
    analytics: (slug: string) =>
      request<ClassAnalyticsResponse>(`/classes/${slug}/analytics`),
    // S102 — public class directory.
    discover: () => request<DiscoverClassesResponse>("/classes/discover"),
    // S96 — class question of the day.
    activeQuestion: (slug: string) =>
      request<ClassQuestionActiveResponse>(`/classes/${slug}/questions/active`),
    listQuestions: (slug: string) =>
      request<ClassQuestionListResponse>(`/classes/${slug}/questions`),
    createQuestion: (slug: string, data: CreateClassQuestionRequest) =>
      request<{ questionId: string }>(`/classes/${slug}/questions`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    answerQuestion: (slug: string, questionId: string, data: AnswerClassQuestionRequest) =>
      request<AnswerClassQuestionResponse>(`/classes/${slug}/questions/${questionId}/answer`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
  pet: {
    me: () => request<MyPetResponse>("/me/pet"),
    catalog: () => request<PetCosmeticsCatalogResponse>("/pet-cosmetics"),
    // S104 — manually hatch the user's NEXT pet (first pet is still
    // auto-hatched by grantXp). Activates the new pet on success.
    hatchAnother: () =>
      request<HatchAnotherPetResponse>("/me/pet/hatch-another", { method: "POST" }),
    // S104 — switch the user's active pet. The pet must belong to
    // the caller; server enforces.
    activate: (petId: string) =>
      request<OkResponse>("/me/pet/activate", {
        method: "POST",
        body: JSON.stringify({ petId }),
      }),
    // S87 — per-username pet display, used by PetByUsername wrapper.
    byUsername: (username: string) =>
      request<UserPetDisplay>(`/users/${encodeURIComponent(username)}/pet-display`),
    // S97 — public pet showcase.
    showcase: () => request<PetShowcaseResponse>("/users/showcase"),
    // S98 — profile cosmetic gallery.
    galleryFor: (username: string) =>
      request<CosmeticGalleryResponse>(`/users/${encodeURIComponent(username)}/cosmetics-gallery`),
    // S89 — XP shop.
    shop: () => request<ShopResponse>("/me/pet/shop"),
    balance: () => request<XpBalanceResponse>("/me/pet/balance"),
    buy: (data: BuyCosmeticRequest) =>
      request<BuyCosmeticResponse>("/me/pet/buy", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    equip: (cosmeticSlug: string) =>
      request<OkResponse>("/me/pet/equip", {
        method: "POST",
        body: JSON.stringify({ cosmeticSlug }),
      }),
    unequip: (cosmeticSlug: string) =>
      request<OkResponse>("/me/pet/unequip", {
        method: "POST",
        body: JSON.stringify({ cosmeticSlug }),
      }),
    rename: (name: string) =>
      request<OkResponse>("/me/pet/name", {
        method: "PUT",
        body: JSON.stringify({ name }),
      }),
    // Phase L — pet skin equip / unequip / shop / buy.
    skinEquip: (skinSlug: string, petId?: string) =>
      request<{ ok: true; activeSkin: PetSkinDef }>("/me/pet/skin/equip", {
        method: "POST",
        body: JSON.stringify(petId ? { skinSlug, petId } : { skinSlug }),
      }),
    skinUnequip: (petId?: string) =>
      request<{ ok: true; activeSkin: PetSkinDef }>("/me/pet/skin/unequip", {
        method: "POST",
        body: JSON.stringify(petId ? { petId } : {}),
      }),
    skinShop: () => request<SkinShopResponse>("/me/pet/skin-shop"),
    buySkin: (skinSlug: string) =>
      request<{
        ok: true;
        balance: number;
        skinSlug: string;
        amountSpent: number;
      }>("/me/pet/buy-skin", {
        method: "POST",
        body: JSON.stringify({ skinSlug }),
      }),
    skinCatalog: () => request<{ skins: PetSkinDef[] }>("/pet-skins"),
    skinShowcase: () =>
      request<PetSkinShowcaseResponse>("/pet-skins/catalog"),
  },
  // Phase 27 — hackathons + engineering competitions.
  hackathons: {
    discover: () =>
      request<{
        hackathons: Array<{
          id: string;
          slug: string;
          title: string;
          coverEmoji: string;
          fieldTag: string;
          hostMode: string;
          status: string;
          startsAt: string | null;
          endsAt: string | null;
          maxTeamSize: number;
        }>;
      }>("/hackathons/discover"),
    list: () =>
      request<{
        hosting: Array<{
          id: string;
          slug: string;
          title: string;
          coverEmoji: string;
          fieldTag: string;
          hostMode: string;
          status: string;
          startsAt: string | null;
          endsAt: string | null;
          maxTeamSize: number;
        }>;
        registered: Array<{
          id: string;
          slug: string;
          title: string;
          coverEmoji: string;
          fieldTag: string;
          hostMode: string;
          status: string;
          startsAt: string | null;
          endsAt: string | null;
          maxTeamSize: number;
        }>;
      }>("/hackathons"),
    get: (slug: string) =>
      request<{
        hackathon: {
          id: string;
          slug: string;
          title: string;
          descriptionMd: string;
          rulesMd: string;
          fieldTag: string;
          coverEmoji: string;
          hostMode: "public" | "class" | "cohort";
          hostContext:
            | { kind: "class" | "cohort"; slug: string; title: string }
            | null;
          discoverable: boolean;
          status: "draft" | "registration" | "active" | "judging" | "ended";
          maxTeamSize: number;
          judgingMode: "manual" | "ai_rubric";
          rubric: {
            criteria: Array<{
              id: string;
              description: string;
              weight?: number;
            }>;
            passingScore: number;
          } | null;
          registrationOpensAt: string | null;
          registrationClosesAt: string | null;
          startsAt: string | null;
          endsAt: string | null;
          createdAt: string;
          updatedAt: string;
          isOrganizer: boolean;
        };
        prizes: Array<{
          id: string;
          rank: number;
          title: string;
          descriptionMd: string;
          xpAmount: number;
          cosmeticSlug: string | null;
          skinSlug: string | null;
          badgeSlug: string | null;
          maxWinners: number;
        }>;
        teams: Array<{
          id: string;
          name: string;
          captainId: string;
          createdAt: string;
          members: Array<{
            userId: string;
            username: string;
            displayName: string | null;
            role: string;
          }>;
        }>;
        submissions: Array<{
          id: string;
          teamId: string;
          title: string;
          writeup: string;
          artifacts: unknown[];
          submittedAt: string;
          aiGrade: unknown | null;
          gradedAt: string | null;
        }>;
        awards: Array<{
          id: string;
          prizeId: string;
          teamId: string;
          awardedAt: string;
        }>;
        myTeamId: string | null;
      }>(`/hackathons/${slug}`),
    create: (data: {
      slug: string;
      title: string;
      descriptionMd?: string;
      rulesMd?: string;
      fieldTag?: string;
      coverEmoji?: string;
      hostMode?: "public" | "class" | "cohort";
      hostClassSlug?: string | null;
      hostCohortSlug?: string | null;
      maxTeamSize?: number;
      judgingMode?: "manual" | "ai_rubric";
      rubric?: {
        criteria: Array<{ id: string; description: string; weight?: number }>;
        passingScore: number;
      } | null;
      registrationOpensAt?: string | null;
      registrationClosesAt?: string | null;
      startsAt?: string | null;
      endsAt?: string | null;
    }) =>
      request<{ id: string; slug: string }>("/hackathons", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (
      slug: string,
      data: Partial<{
        title: string;
        descriptionMd: string;
        rulesMd: string;
        fieldTag: string;
        coverEmoji: string;
        maxTeamSize: number;
        judgingMode: "manual" | "ai_rubric";
        rubric: {
          criteria: Array<{ id: string; description: string; weight?: number }>;
          passingScore: number;
        } | null;
        registrationOpensAt: string | null;
        registrationClosesAt: string | null;
        startsAt: string | null;
        endsAt: string | null;
      }>,
    ) =>
      request<OkResponse>(`/hackathons/${slug}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    publish: (slug: string) =>
      request<OkResponse>(`/hackathons/${slug}/publish`, { method: "POST" }),
    delete: (slug: string) =>
      request<OkResponse>(`/hackathons/${slug}`, { method: "DELETE" }),
    createPrize: (
      slug: string,
      data: {
        rank?: number;
        title: string;
        descriptionMd?: string;
        xpAmount?: number;
        cosmeticSlug?: string | null;
        skinSlug?: string | null;
        badgeSlug?: string | null;
        maxWinners?: number;
      },
    ) =>
      request<{ id: string }>(`/hackathons/${slug}/prizes`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    deletePrize: (slug: string, prizeId: string) =>
      request<OkResponse>(`/hackathons/${slug}/prizes/${prizeId}`, {
        method: "DELETE",
      }),
    createTeam: (slug: string, name: string) =>
      request<{ teamId: string }>(`/hackathons/${slug}/teams`, {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    registerSolo: (slug: string) =>
      request<{ teamId: string }>(`/hackathons/${slug}/register-solo`, {
        method: "POST",
      }),
    joinTeam: (slug: string, teamId: string) =>
      request<OkResponse>(`/hackathons/${slug}/teams/${teamId}/join`, {
        method: "POST",
      }),
    leaveTeam: (slug: string, teamId: string) =>
      request<OkResponse>(`/hackathons/${slug}/teams/${teamId}/leave`, {
        method: "POST",
      }),
    submit: (
      slug: string,
      teamId: string,
      data: {
        title: string;
        writeup?: string;
        artifacts?: Array<{
          kind: "github" | "colab" | "demo" | "paper" | "other";
          url: string;
          label: string;
        }>;
      },
    ) =>
      request<{ id: string }>(
        `/hackathons/${slug}/teams/${teamId}/submission`,
        { method: "POST", body: JSON.stringify(data) },
      ),
    judge: (slug: string) =>
      request<{ graded: number; errors: number }>(
        `/hackathons/${slug}/judge`,
        { method: "POST" },
      ),
    awardPrize: (slug: string, prizeId: string, teamId: string) =>
      request<OkResponse>(
        `/hackathons/${slug}/prizes/${prizeId}/award`,
        { method: "POST", body: JSON.stringify({ teamId }) },
      ),
  },
  // Phase 28A — verifiable credential wallet.
  credentials: {
    forUser: (username: string) =>
      request<{
        user: { username: string; displayName: string | null };
        credentials: Array<{
          kind: string;
          title: string;
          earnedAt: string;
          signed: boolean;
          detailUrl: string;
          verifyUrl: string | null;
          skills: Array<{ slug: string; title: string }>;
        }>;
      }>(`/credentials/${username}`),
    mine: () =>
      request<{
        credentialsPublic: boolean;
        credentials: Array<{
          kind: string;
          title: string;
          earnedAt: string;
          signed: boolean;
          detailUrl: string;
          verifyUrl: string | null;
          skills: Array<{ slug: string; title: string }>;
        }>;
      }>("/me/credentials"),
    setVisibility: (isPublic: boolean) =>
      request<OkResponse>("/me/credentials/visibility", {
        method: "PUT",
        body: JSON.stringify({ public: isPublic }),
      }),
    // Phase 29C — recruiter skills rollup.
    skillsSummary: (username: string) =>
      request<{
        user: { username: string; displayName: string | null };
        skills: Array<{
          skill: string;
          slug: string;
          provenBy: Array<{
            kind: string;
            title: string;
            earnedAt: string;
          }>;
        }>;
      }>(`/credentials/${username}/skills-summary`),
  },
  // Phase 28B — reproduction peer review → signed credential.
  reproductions: {
    reviewQueue: () =>
      request<{
        reproductions: Array<{
          id: string;
          targetKind: string;
          targetId: string;
          status: string;
          notes: string | null;
          evidenceUrl: string | null;
          createdAt: string;
          reproducerName: string;
        }>;
      }>("/reproductions/review-queue"),
    get: (id: string) =>
      request<{
        reproduction: {
          id: string;
          targetKind: string;
          targetId: string;
          status: string;
          notes: string | null;
          evidenceUrl: string | null;
          credentialMintedAt: string | null;
          credentialMintWeight: number | null;
          createdAt: string;
        };
        reviews: Array<{
          id: string;
          verdict: string;
          notesMd: string;
          createdAt: string;
          reviewerName: string;
          weight: number;
        }>;
        confirmWeightThreshold: number;
        currentConfirmedWeight: number;
      }>(`/reproductions/${id}`),
    review: (
      id: string,
      verdict: "confirmed" | "refuted" | "inconclusive",
      notesMd: string,
    ) =>
      request<OkResponse>(`/reproductions/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ verdict, notesMd }),
      }),
  },
  // Phase 29B — collaborative review rooms.
  reviewRooms: {
    messages: (
      kind:
        | "reproduction"
        | "capstone_submission"
        | "cohort_study"
        | "bounty_collaboration",
      roomId: string,
    ) =>
      request<{
        messages: Array<{
          id: string;
          authorId: string;
          authorUsername: string;
          bodyMd: string;
          parentId: string | null;
          createdAt: string;
        }>;
      }>(`/review-rooms/${kind}/${roomId}/messages`),
    postMessage: (
      kind:
        | "reproduction"
        | "capstone_submission"
        | "cohort_study"
        | "bounty_collaboration",
      roomId: string,
      bodyMd: string,
      parentId?: string,
    ) =>
      request<{
        ok: true;
        message: {
          id: string;
          authorId: string;
          authorUsername: string;
          bodyMd: string;
          parentId: string | null;
          createdAt: string;
        };
      }>(`/review-rooms/${kind}/${roomId}/messages`, {
        method: "POST",
        body: JSON.stringify({ bodyMd, parentId }),
      }),
  },
  // Phase 28C/D — research bounty marketplace.
  bounties: {
    discover: () =>
      request<{
        bounties: Array<{
          id: string;
          slug: string;
          title: string;
          kind: string;
          status: string;
          rewardXp: number;
          maxClaimants: number;
          deadlineAt: string | null;
          createdAt: string;
        }>;
      }>("/bounties/discover"),
    list: () =>
      request<{
        posted: Array<{
          id: string;
          slug: string;
          title: string;
          kind: string;
          status: string;
          rewardXp: number;
          maxClaimants: number;
          deadlineAt: string | null;
          createdAt: string;
        }>;
        claimed: Array<{
          id: string;
          slug: string;
          title: string;
          kind: string;
          status: string;
          rewardXp: number;
          maxClaimants: number;
          deadlineAt: string | null;
          createdAt: string;
        }>;
      }>("/bounties"),
    get: (slug: string) =>
      request<{
        bounty: {
          id: string;
          slug: string;
          title: string;
          descriptionMd: string;
          kind: string;
          rewardXp: number;
          rewardBadgeSlug: string | null;
          status: string;
          maxClaimants: number;
          deadlineAt: string | null;
          createdAt: string;
          isPoster: boolean;
        };
        claims: Array<{
          id: string;
          userId: string;
          username: string;
          displayName: string | null;
          status: string;
          claimedAt: string;
        }>;
        submissions: Array<{
          id: string;
          claimId: string;
          writeup: string;
          artifacts: unknown[];
          submittedAt: string;
          aiReview: unknown | null;
        }>;
        myClaim: {
          id: string;
          status: string;
          claimedAt: string;
        } | null;
      }>(`/bounties/${slug}`),
    create: (data: {
      slug: string;
      title: string;
      descriptionMd?: string;
      kind?: "reproduce" | "extend" | "analyze" | "other";
      rewardXp?: number;
      rewardBadgeSlug?: string | null;
      maxClaimants?: number;
      deadlineAt?: string | null;
    }) =>
      request<{ id: string; slug: string }>("/bounties", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    delete: (slug: string) =>
      request<OkResponse>(`/bounties/${slug}`, { method: "DELETE" }),
    claim: (slug: string) =>
      request<OkResponse>(`/bounties/${slug}/claim`, { method: "POST" }),
    submit: (
      slug: string,
      data: {
        writeup?: string;
        artifacts?: Array<{
          kind: "github" | "colab" | "demo" | "paper" | "other";
          url: string;
          label: string;
        }>;
      },
    ) =>
      request<OkResponse>(`/bounties/${slug}/submit`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    accept: (slug: string, claimId: string) =>
      request<OkResponse>(
        `/bounties/${slug}/claims/${claimId}/accept`,
        { method: "POST" },
      ),
    reject: (slug: string, claimId: string) =>
      request<OkResponse>(
        `/bounties/${slug}/claims/${claimId}/reject`,
        { method: "POST" },
      ),
    // Phase 30D — collaboration matcher.
    collaborators: (slug: string) =>
      request<{
        bountyId: string;
        collaborators: Array<{
          username: string;
          displayName: string | null;
          overlapScore: number;
          sharedConcepts: Array<{ slug: string; title: string }>;
          reason: string;
        }>;
      }>(`/bounties/${slug}/collaborators`),
    matchCollaborator: (slug: string) =>
      request<{
        bountyId: string;
        matches: Array<{
          username: string;
          displayName: string | null;
          overlapScore: number;
          sharedConcepts: Array<{ slug: string; title: string }>;
          reason: string;
        }>;
      }>(`/bounties/${slug}/match-collaborator`),
  },
  // Phase 30B — cohort study groups.
  cohorts: {
    progress: (slug: string) =>
      request<{
        members: Array<{
          username: string;
          displayName: string | null;
          mastered: number;
          weakConcepts: number;
          velocityPerDay: number;
          capstonesCompleted: number;
        }>;
        milestonesCleared: number;
      }>(`/cohorts/${slug}/progress`),
    sessions: (slug: string) =>
      request<{
        sessions: Array<{
          id: string;
          title: string;
          scheduledAt: string;
          roomId: string;
          createdByUsername: string;
        }>;
      }>(`/cohorts/${slug}/sessions`),
    createSession: (
      slug: string,
      data: { title: string; scheduledAt: string },
    ) =>
      request<{ id: string; roomId: string }>(
        `/cohorts/${slug}/sessions`,
        { method: "POST", body: JSON.stringify(data) },
      ),
  },
  // Phase 30C — recruiter dashboard.
  recruiter: {
    search: (skill: string, minProofs?: number) => {
      const sp = new URLSearchParams({ skill });
      if (minProofs) sp.set("minProofs", String(minProofs));
      return request<{
        skill: string;
        candidates: Array<{
          username: string;
          displayName: string | null;
          skillSlug: string;
          skillTitle: string;
          proofCount: number;
          latestProofAt: string | null;
        }>;
      }>(`/recruiter/search?${sp.toString()}`);
    },
    skills: () =>
      request<{
        skills: Array<{
          slug: string;
          title: string;
          candidates: number;
        }>;
      }>("/recruiter/skills"),
    pools: () =>
      request<{
        pools: Array<{
          id: string;
          name: string;
          createdAt: string;
          count: number;
        }>;
      }>("/recruiter/pools"),
    createPool: (name: string) =>
      request<{ id: string; name: string }>("/recruiter/pools", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    pool: (id: string) =>
      request<{
        pool: { id: string; name: string };
        members: Array<{
          candidateUserId: string;
          username: string;
          displayName: string | null;
          addedAt: string;
        }>;
      }>(`/recruiter/pools/${id}`),
    addToPool: (id: string, candidateUsername: string) =>
      request<OkResponse>(`/recruiter/pools/${id}/members`, {
        method: "POST",
        body: JSON.stringify({ candidateUsername }),
      }),
    removeFromPool: (id: string, candidateUserId: string) =>
      request<OkResponse>(
        `/recruiter/pools/${id}/members/${candidateUserId}`,
        { method: "DELETE" },
      ),
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
          // Phase 16D — 0 for signed-out callers. Lets the client
          // group tracks without a per-track round-trip.
          myCompletedRequired: number;
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
    // Phase 30A — auto-ranked mentor suggestions.
    candidates: () =>
      request<{
        personalized: boolean;
        candidates: Array<{
          username: string;
          displayName: string | null;
          bio: string | null;
          score: number;
          rationale: string;
          breakdown: {
            topicMatch: number;
            domainRep: number;
            align: number;
          };
        }>;
      }>("/mentors/candidates"),
  },
  me: {
    // S94 — student progress dashboard.
    progress: () => request<MyProgressResponse>("/me/progress"),
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
    // Phase 28E — readiness projection + dated study plan.
    readiness: () =>
      request<{
        velocityPerDay: number;
        snapshots: Array<{ capturedOn: string; mastered: number }>;
        weakConcepts: number;
        estimatedReadyOn: string | null;
        plan: Array<{
          conceptSlug: string;
          conceptTitle: string | null;
          targetDate: string;
        }>;
      }>("/me/readiness"),
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
    // S108 — soft-delete + data export.
    deleteAccount: (password: string) =>
      request<{ ok: true; scheduledHardDeleteAt: string }>("/me", {
        method: "DELETE",
        body: JSON.stringify({ password }),
      }),
    exportData: () => request<unknown>("/me/export"),
    // S109 — email change + session management.
    changeEmail: (newEmail: string, currentPassword: string) =>
      request<{ ok: true; pendingEmail: string }>("/me/email-change", {
        method: "POST",
        body: JSON.stringify({ newEmail, currentPassword }),
      }),
    sessions: () =>
      request<{
        sessions: Array<{
          id: string;
          createdAt: string;
          expiresAt: string;
          userAgent: string | null;
          ip: string | null;
          current: boolean;
        }>;
      }>("/me/sessions"),
    revokeSession: (id: string) =>
      request<OkResponse>(`/me/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }),
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
  // Sprint 79 — Lab protocol + equipment library.
  lab: {
    protocols: {
      list: (params?: { discipline?: string }) => {
        const sp = new URLSearchParams();
        if (params?.discipline) sp.set("discipline", params.discipline);
        const qs = sp.toString();
        return request<ProtocolListResponse>(
          `/lab/protocols${qs ? `?${qs}` : ""}`,
        );
      },
      drafts: () =>
        request<ProtocolListResponse>("/lab/protocols/me/drafts"),
      byAuthor: (username: string) =>
        request<ProtocolListResponse>(
          `/lab/protocols/by-author/${encodeURIComponent(username)}`,
        ),
      get: (slug: string) =>
        request<ProtocolDetailResponse>(`/lab/protocols/${slug}`),
      versions: (slug: string) =>
        request<ProtocolVersionsResponse>(`/lab/protocols/${slug}/versions`),
      create: (data: CreateProtocolRequest) =>
        request<{ protocolId: string; slug: string }>("/lab/protocols", {
          method: "POST",
          body: JSON.stringify(data),
        }),
      update: (slug: string, data: UpdateProtocolRequest) =>
        request<OkResponse>(`/lab/protocols/${slug}`, {
          method: "PUT",
          body: JSON.stringify(data),
        }),
      replaceSteps: (slug: string, data: ReplaceProtocolStepsRequest) =>
        request<{ ok: true; stepCount: number }>(
          `/lab/protocols/${slug}/steps`,
          { method: "PUT", body: JSON.stringify(data) },
        ),
    },
    equipment: {
      list: (params?: { discipline?: string }) => {
        const sp = new URLSearchParams();
        if (params?.discipline) sp.set("discipline", params.discipline);
        const qs = sp.toString();
        return request<EquipmentListResponse>(
          `/lab/equipment${qs ? `?${qs}` : ""}`,
        );
      },
      get: (slug: string) =>
        request<EquipmentDetailResponse>(`/lab/equipment/${slug}`),
      create: (data: CreateEquipmentRequest) =>
        request<{ equipmentId: string; slug: string }>("/lab/equipment", {
          method: "POST",
          body: JSON.stringify(data),
        }),
      update: (slug: string, data: UpdateEquipmentRequest) =>
        request<OkResponse>(`/lab/equipment/${slug}`, {
          method: "PUT",
          body: JSON.stringify(data),
        }),
      replaceOperations: (
        slug: string,
        data: ReplaceEquipmentOperationsRequest,
      ) =>
        request<{ ok: true; operationCount: number }>(
          `/lab/equipment/${slug}/operations`,
          { method: "PUT", body: JSON.stringify(data) },
        ),
    },
    // Sprint 80 — Safety certifications.
    safetyCerts: {
      list: (params?: { discipline?: string }) => {
        const sp = new URLSearchParams();
        if (params?.discipline) sp.set("discipline", params.discipline);
        const qs = sp.toString();
        return request<SafetyCertListResponse>(
          `/lab/safety-certs${qs ? `?${qs}` : ""}`,
        );
      },
      get: (slug: string) =>
        request<SafetyCertWithQuestionsResponse>(`/lab/safety-certs/${slug}`),
      attempt: (slug: string, answers: Record<string, string>) =>
        request<SafetyCertAttemptResponse>(
          `/lab/safety-certs/${slug}/attempt`,
          { method: "POST", body: JSON.stringify({ answers }) },
        ),
      mine: () => request<UserSafetyCertsResponse>("/me/safety-certs"),
    },
    // Sprint 80 — Protocol runs.
    runs: {
      start: (protocolSlug: string) =>
        request<StartProtocolRunResponse>("/lab/runs/start", {
          method: "POST",
          body: JSON.stringify({ protocolSlug }),
        }),
      mine: (status?: string) => {
        const qs = status ? `?status=${status}` : "";
        return request<ProtocolRunListResponse>(`/me/lab/runs${qs}`);
      },
      awaitingSignoff: () =>
        request<ProtocolRunListResponse>("/lab/runs/awaiting-signoff"),
      get: (id: string) =>
        request<ProtocolRunDetailResponse>(`/lab/runs/${id}`),
      updateStep: (id: string, ordinal: number, body: StepUpdateRequest) =>
        request<{ ok: true; status: string }>(
          `/lab/runs/${id}/steps/${ordinal}`,
          { method: "PUT", body: JSON.stringify(body) },
        ),
      requestSignoff: (id: string) =>
        request<{
          ok: true;
          mentorsNotified: number;
          doneSteps: number;
          totalSteps: number;
        }>(`/lab/runs/${id}/request-signoff`, { method: "POST" }),
      signOff: (id: string, body: SignOffRequest) =>
        request<{ ok: true }>(`/lab/runs/${id}/sign-off`, {
          method: "POST",
          body: JSON.stringify(body),
        }),
      reject: (id: string, body: SignOffRequest) =>
        request<{ ok: true }>(`/lab/runs/${id}/reject`, {
          method: "POST",
          body: JSON.stringify(body),
        }),
    },
    // Sprint 82 — Lab playbook + roster + skill MRI.
    playbook: () => request<LabPlaybookResponse>("/me/lab/playbook"),
    skillMri: () => request<LabSkillMriResponse>("/me/lab/skill-mri"),
    assignments: () =>
      request<{
        assignments: Array<{
          id: string;
          cohortSlug: string;
          cohortName: string;
          protocolSlug: string | null;
          certSlug: string | null;
          masteryPathSlug: string | null;
          dueAt: string | null;
          status: string;
        }>;
      }>("/me/lab/assignments"),
    roster: (slug: string) =>
      request<LabRosterResponse>(`/lab-groups/${slug}/roster`),
    assign: (slug: string, body: AssignLabWorkRequest) =>
      request<{ ok: true; cohortId: string; assignmentIds: string[] }>(
        `/lab-groups/${slug}/assign`,
        { method: "POST", body: JSON.stringify(body) },
      ),
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
  PrimaryPersona,
  UserNodeProgress,
  WikiPage,
};

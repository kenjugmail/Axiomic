// Wire-format types shared between @axiomic/server and @axiomic/web.
// These describe API response shapes, not database rows. Where the server
// shapes diverge from the underlying Drizzle row (e.g., comments have
// joined-in `username`, computed `score`, threaded `children`), the
// API-shape lives here, and the row type stays in @axiomic/db.

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
  createdBy?: string | null;
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
  displayName?: string | null;
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
  // Server-derived flag — true when the node has authored lesson_data.
  hasLesson?: boolean;
  // Cheap server-side estimate (minutes). Defaults to undefined for
  // older callers that haven't fetched the enriched payload.
  estimatedMinutes?: number;
}

export interface UserNodeProgress {
  nodeId: string;
  completed: boolean;
  quizScore: number | null;
  completedAt: string | null;
}

// --- Quiz questions: discriminated by `kind` ---
//
// Older seeded files omit `kind` entirely — those are interpreted as
// "multiple_choice" via assertQuestionKind() so we don't have to rewrite
// the 16 already-authored quiz JSON files.

export interface MultipleChoiceQuestion {
  id: string;
  kind: "multiple_choice";
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

export interface SliderQuestion {
  id: string;
  kind: "slider";
  question: string;
  // Name of the controlled viz component to render. Currently:
  //   "softmax-temperature" — bar chart of softmax(logits / T)
  viz: string;
  // Optional payload passed straight to the viz (logits, etc.).
  vizProps?: Record<string, unknown>;
  min: number;
  max: number;
  step: number;
  default: number;
  target: { min: number; max: number };
  explanation?: string;
}

export interface DragClassifyItem {
  id: string;
  label: string;
  bin: string;  // declared correct bin id
}

export interface DragClassifyBin {
  id: string;
  label: string;
}

export interface DragClassifyQuestion {
  id: string;
  kind: "drag_classify";
  question: string;
  items: DragClassifyItem[];
  bins: DragClassifyBin[];
  explanation?: string;
}

// --- Code question (Pyodide-backed) ---
//
// The frontend runs the user's code against `tests` in a browser-side
// Pyodide sandbox and reports back `{ passed, total }` as a JSON-stringified
// answer. The server scores by comparing those counts to `tests.length`.
export interface CodeQuestionTest {
  name: string;
  // Each input is a Python literal expression evaluated in the sandbox
  // (e.g., "[2.0, 1.0, 0.5]" or "np.array([1, 2, 3])").
  inputs: string[];
  // Python expression run with bindings { result, np, inputs } that
  // returns truthy iff the test passes. Common pattern:
  //   "abs(result.sum() - 1.0) < 1e-6"
  check: string;
}

export interface CodeQuestion {
  id: string;
  kind: "code";
  question: string;
  starterCode: string;
  functionName: string;
  tests: CodeQuestionTest[];
  explanation?: string;
}

// --- Puzzle: drag components into ordered slots ---
//
// The user drags `components` from the tray into `slots`. Each slot
// declares which component `type` it accepts. The puzzle is correct
// iff every slot's filled component has matching type.
export interface PuzzleSlot {
  id: string;
  label: string;
  accepts: string;     // matches one or more components' `type`
}

export interface PuzzleComponent {
  id: string;
  label: string;
  type: string;
}

export interface PuzzleDragBuildQuestion {
  id: string;
  kind: "puzzle_drag_build";
  question: string;
  slots: PuzzleSlot[];
  components: PuzzleComponent[];
  explanation?: string;
}

// Math-expression input. The user types a LaTeX-friendly expression
// in the box; the renderer shows a live KaTeX preview. Grading is by
// matching the user's input (with a normalization pass) against any
// of `acceptedAnswers`. Symbolic equivalence beyond literal-with-
// normalization is out of scope for v1 — authors list common forms.
export interface MathExpressionQuestion {
  id: string;
  kind: "math_expression";
  question: string;
  // Pre-fill the input. Useful for "complete this expression" prompts.
  starter?: string;
  // Any of these values count as correct after the same whitespace +
  // case normalization the input goes through.
  acceptedAnswers: string[];
  // Hint shown beneath the input.
  hint?: string;
  explanation?: string;
}

// Sortable list. The user drags `items` into the correct order. The
// declared order in the JSON is the correct one.
export interface SortableItem {
  id: string;
  label: string;
}

export interface SortableQuestion {
  id: string;
  kind: "sortable";
  question: string;
  items: SortableItem[];
  explanation?: string;
}

// Code-completion. A code block with `___` placeholders the user
// fills. The placeholders are 1-indexed and the answer map is a
// `{ "1": "...", "2": "..." }`. Grading is exact-string-match per
// blank after trimming.
export interface CodeCompletionBlank {
  id: string;
  // Acceptable values for this blank. Any one is correct after a
  // whitespace trim.
  acceptedAnswers: string[];
}

export interface CodeCompletionQuestion {
  id: string;
  kind: "code_completion";
  question: string;
  // The full code block. Use `___1___`, `___2___`, etc. as inline
  // placeholders that the renderer turns into input boxes.
  template: string;
  language?: string;
  blanks: CodeCompletionBlank[];
  explanation?: string;
}

export type QuizQuestion =
  | MultipleChoiceQuestion
  | SliderQuestion
  | DragClassifyQuestion
  | CodeQuestion
  | PuzzleDragBuildQuestion
  | MathExpressionQuestion
  | SortableQuestion
  | CodeCompletionQuestion;

// Coerce a raw question (which may lack `kind`) into a typed one. Used
// by both server-side scoring and frontend rendering.
export function assertQuestionKind(raw: any): QuizQuestion {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid quiz question");
  }
  if (!raw.kind) return { ...raw, kind: "multiple_choice" };
  return raw;
}

// Ephemeral flashcard returned by the AI generator. The user can save
// it into their personal deck via POST /flashcards.
export interface Flashcard {
  front: string;
  back: string;
}

// A persisted flashcard the user has saved into their deck. Includes
// SM-2 spaced repetition state.
export interface SavedFlashcard {
  id: string;
  pageSlug: string;
  pageTitle: string;
  front: string;
  back: string;
  easeFactor: number;
  interval: number;
  repetitions: number;
  dueAt: string | null;
  createdAt: string;
}

export interface FlashcardReview {
  id: string;
  cardId: string;
  rating: number;
  reviewedAt: string;
}

// Response envelopes

export interface AuthResponse {
  user: User;
}

export interface MeResponse {
  user: User | null;
}

export interface WikiListResponse {
  pages: WikiPage[];
}

export interface WikiSearchResponse {
  results: WikiPage[];
}

export interface WikiCategoriesResponse {
  categories: string[];
}

export interface WikiPageResponse {
  page: WikiPage;
  content: string;
  allContent?: { intro: string; undergrad: string; grad: string };
  versions: PageVersion[];
  linkedTopics?: ForumTopicSummary[];
}

export interface WikiUpdateResponse {
  page: WikiPage;
}

export interface CommentsListResponse {
  comments: Comment[];
}

export interface CommentResponse {
  comment: Comment;
}

export interface MasteryPathsResponse {
  paths: MasteryPath[];
}

export interface MasteryPathResponse {
  path: MasteryPath;
  nodes: MasteryNode[];
  progress: UserNodeProgress[];
  // 0-100 mastery per node id. Empty for signed-out viewers.
  nodeMastery?: Record<string, number>;
  // True when the node should render as locked (prereqs not yet
  // mastered to ≥70). Empty / always-false for signed-out viewers.
  lockState?: Record<string, boolean>;
  // Slug of the node to send the user to with the "Resume" CTA, or
  // null if there's nothing to resume.
  lastVisitedNodeSlug?: string | null;
}

export interface QuizQuestionsResponse {
  questions: QuizQuestion[];
}

// --- Lessons: Brilliant-style step-through slides ---

export interface LessonTextSlide {
  kind: "text";
  title?: string;
  body: string;             // markdown
  viz?: string;             // optional viz name to render alongside body
  vizProps?: Record<string, unknown>;
}

export interface LessonQuestionSlide {
  kind: "question";
  question: QuizQuestion;
}

export type LessonSlide = LessonTextSlide | LessonQuestionSlide;

export interface Lesson {
  slides: LessonSlide[];
}

export interface LessonResponse {
  lesson: Lesson | null;    // null when the node has no authored lesson
}

export interface QuizSubmitResponse {
  score: number;
  correct: number;
  total: number;
}

export interface RelatedPagesResponse {
  pages: WikiPage[];
}

export interface FlashcardsResponse {
  cards: Flashcard[];
}

export interface SavedFlashcardsResponse {
  cards: SavedFlashcard[];
}

export interface SavedFlashcardResponse {
  card: SavedFlashcard;
}

export interface OkResponse {
  ok: boolean;
}

export interface ReadyResponse {
  status: "ready" | "degraded";
  db: boolean;
  ai: boolean;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// --- Forum (Pillar 2) ---

export type PostType =
  | "claim"
  | "question"
  | "derivation"
  | "critique"
  | "synthesis"
  | "prediction"
  | "poll";

export const POST_TYPES: PostType[] = [
  "claim",
  "question",
  "derivation",
  "critique",
  "synthesis",
  "prediction",
  "poll",
];

export interface ForumDomain {
  id: string;
  slug: string;
  title: string;
  description: string;
}

export interface ForumTopicSummary {
  id: string;
  slug: string;
  title: string;
  postType: PostType;
  domainId: string;
  domainSlug: string;
  domainTitle: string;
  authorId: string;
  authorUsername: string;
  wikiPageId: string | null;
  wikiPageSlug: string | null;
  wikiPageTitle: string | null;
  score: number;
  userVote: number;
  postCount: number;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ForumPost {
  id: string;
  topicId: string;
  parentId: string | null;
  authorId: string;
  authorUsername: string;
  body: string;
  score: number;
  userVote: number;
  editedAt: string | null;
  createdAt: string;
  children?: ForumPost[];
}

export interface ForumTopicDetail extends ForumTopicSummary {
  body: string;
  posts: ForumPost[];
  reactionCounts: Record<NewsReactionKind, number>;
  myReactions: Record<NewsReactionKind, boolean> | null;
  myBookmark: boolean;
  poll: ForumPoll | null;
}

export interface ReputationByDomain {
  domainSlug: string;
  domainTitle: string;
  score: number;
  topicCount: number;
  postCount: number;
}

export interface ForumDomainsResponse {
  domains: ForumDomain[];
}

export interface ForumTopicsResponse {
  topics: ForumTopicSummary[];
}

export interface ForumTopicDetailResponse {
  topic: ForumTopicDetail;
}

export interface ForumPostResponse {
  post: ForumPost;
}

export interface ForumCreateTopicResponse {
  topic: ForumTopicSummary;
}

export interface ReputationResponse {
  username: string;
  total: number;
  domains: ReputationByDomain[];
}

// --- Notifications ---

export type NotificationKind =
  | "mention"
  | "topic_reply"
  | "post_reply"
  | "comment_reply"
  | "mastery_level_up"
  | "news_edit_proposed"
  | "news_edit_approved"
  | "news_edit_rejected"
  | "news_published"
  | "forum_topic_posted";

export type NotificationSubject =
  | "topic"
  | "post"
  | "comment"
  | "mastery_node"
  | "news_article"
  | "news_proposal"
  | "news_comment";

export const NOTIFICATION_KINDS: NotificationKind[] = [
  "mention",
  "topic_reply",
  "post_reply",
  "comment_reply",
  "mastery_level_up",
  "news_edit_proposed",
  "news_edit_approved",
  "news_edit_rejected",
  "news_published",
  "forum_topic_posted",
];

export const NOTIFICATION_SUBJECTS: NotificationSubject[] = [
  "topic",
  "post",
  "comment",
  "mastery_node",
  "news_article",
  "news_proposal",
  "news_comment",
];

export interface Notification {
  id: string;
  kind: NotificationKind;
  subjectType: NotificationSubject;
  subjectId: string;
  contextSlug: string | null;
  preview: string | null;
  readAt: string | null;
  createdAt: string;
  actor: { id: string; username: string } | null;
}

export interface NotificationsListResponse {
  notifications: Notification[];
  total: number;
}

export interface UnreadCountResponse {
  count: number;
}

// --- Unified search ---

export type SearchMatchedBy = "keyword" | "semantic" | "both";

export interface SearchPageResult {
  kind: "page";
  id: string;
  slug: string;
  title: string;
  category: string;
  snippet: string;
  score: number;
  matchedBy: SearchMatchedBy;
}

export interface SearchTopicResult {
  kind: "topic";
  id: string;
  slug: string;
  title: string;
  postType: string;
  snippet: string;
  score: number;
  matchedBy: SearchMatchedBy;
}

export interface SearchLessonResult {
  kind: "lesson";
  id: string;
  // The slide-aware index emits both pathSlug + nodeSlug; the client uses
  // them to build /paths/<pathSlug>/lessons/<nodeSlug>.
  slug: string;
  pathSlug: string;
  nodeSlug: string;
  title: string;
  snippet: string;
  score: number;
  matchedBy: SearchMatchedBy;
}

export type SearchResultItem =
  | SearchPageResult
  | SearchTopicResult
  | SearchLessonResult;

export interface SearchResponse {
  query: string;
  results: SearchResultItem[];
}

// --- Settings & user preferences ---

export type ThemePreference =
  | "light"
  | "dark"
  | "system"
  | "sepia"
  | "dim"
  | "high-contrast";

export interface UserSettings {
  username: string;
  email: string;
  displayName: string | null;
  bio: string | null;
  theme: ThemePreference;
  notifyMentions: boolean;
  notifyReplies: boolean;
  notifyMastery: boolean;
}

export interface SettingsResponse {
  settings: UserSettings;
}

export interface SettingsUpdateInput {
  theme?: ThemePreference;
  notifyMentions?: boolean;
  notifyReplies?: boolean;
  notifyMastery?: boolean;
  displayName?: string | null;
  bio?: string | null;
}

// --- Mastery summary ---

export type MasteryLevel =
  | "apprentice"
  | "practitioner"
  | "specialist"
  | "expert"
  | "researcher";

export interface PathProgressSummary {
  pathSlug: string;
  pathTitle: string;
  totalNodes: number;
  completedNodes: number;
  currentLevel: MasteryLevel | null;
  latestCompletionAt: string | null;
  // Per-level node counts for the SkillTree on the profile page.
  // Keyed by level name; values are { total, completed }. Missing
  // levels (paths that don't have e.g. a researcher tier) are absent.
  levels?: Partial<Record<MasteryLevel, { total: number; completed: number }>>;
}

export interface MasterySummaryResponse {
  username: string;
  paths: PathProgressSummary[];
  totalCompleted: number;
  highestLevel: MasteryLevel | null;
}

// --- Achievements & activity ---

export interface AchievementCatalogEntry {
  slug: string;
  title: string;
  description: string;
  icon: string;
}

export interface EarnedAchievement extends AchievementCatalogEntry {
  awardedAt: string;
}

export interface ActivityHeatmapCell {
  day: string;        // YYYY-MM-DD UTC
  count: number;
}

export interface AchievementCatalogResponse {
  achievements: AchievementCatalogEntry[];
}

export interface UserAchievementsResponse {
  username: string;
  earned: EarnedAchievement[];
  streak: number;
  heatmap: ActivityHeatmapCell[];
}

// "Pick up where you left off" payload shown on the home page.
export interface NextNodeResponse {
  next: {
    pathSlug: string;
    pathTitle: string;
    nodeSlug: string;
    nodeTitle: string;
    level: string;
    hasLesson: boolean;
  } | null;
}

export interface DueCountResponse {
  count: number;
}

export interface RecentActivityEvent {
  kind: string;
  title: string;
  href: string;
  occurredAt: string;
}

export interface RecentActivityResponse {
  events: RecentActivityEvent[];
}

export interface CreateWikiPageRequest {
  slug: string;
  title: string;
  category?: string;
  contentIntro: string;
  contentUndergrad: string;
  contentGrad: string;
  editMessage?: string;
}

export interface RestoreWikiVersionRequest {
  version: number;
}

// --- News articles + propose/approve edits ---

export type NewsAccentColor =
  | "indigo"
  | "emerald"
  | "rose"
  | "amber"
  | "sky"
  | "violet";

export const NEWS_ACCENT_COLORS: NewsAccentColor[] = [
  "indigo",
  "emerald",
  "rose",
  "amber",
  "sky",
  "violet",
];

export type NewsReactionKind = "thumbs" | "lightbulb" | "mind_blown";

export const NEWS_REACTION_KINDS: NewsReactionKind[] = [
  "thumbs",
  "lightbulb",
  "mind_blown",
];

export type NewsStatus = "draft" | "published";

export interface NewsReference {
  // 1-indexed label (e.g., "1", "2"). The API renumbers on save, so
  // request payloads can omit `label`; responses always include it.
  label?: string;
  text: string;
  url?: string;
}

export interface NewsArticleSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  coverEmoji: string;
  accentColor: NewsAccentColor;
  tags: string[];
  authorId: string;
  authorUsername: string;
  authorDisplayName: string | null;
  lastEditorUsername: string | null;
  readingMinutes: number;
  reactionCounts: Record<NewsReactionKind, number>;
  createdAt: string;
  updatedAt: string;
}

export interface NewsArticle extends NewsArticleSummary {
  body: string;
  status: NewsStatus;
  // Optional research-paper fields. Empty defaults are returned for
  // articles that don't use them; the UI hides empty sections.
  abstract: string;
  references: NewsReference[];
  coauthors: string[];
  // True when the requester has reacted with this kind. Null fields
  // for signed-out viewers.
  myReactions: Record<NewsReactionKind, boolean> | null;
  pendingProposalCount: number;
  isAuthor: boolean;
  myBookmark: boolean;
}

export interface NewsTagCount {
  tag: string;
  count: number;
}

export interface NewsTagsResponse {
  tags: NewsTagCount[];
}

export interface NewsListResponse {
  articles: NewsArticleSummary[];
}

export interface NewsArticleResponse {
  article: NewsArticle;
}

export interface CreateNewsArticleRequest {
  slug: string;
  title: string;
  summary: string;
  body: string;
  coverEmoji?: string;
  accentColor?: NewsAccentColor;
  status?: NewsStatus;
  tags?: string[];
  abstract?: string;
  references?: NewsReference[];
  coauthors?: string[];
}

export interface UpdateNewsArticleRequest {
  title: string;
  summary: string;
  body: string;
  coverEmoji?: string;
  accentColor?: NewsAccentColor;
  status?: NewsStatus;
  tags?: string[];
  abstract?: string;
  references?: NewsReference[];
  coauthors?: string[];
}

export type NewsEditProposalStatus = "pending" | "approved" | "rejected";

export interface NewsEditProposal {
  id: string;
  articleId: string;
  articleSlug: string;
  articleTitle: string;
  proposerId: string;
  proposerUsername: string;
  proposedTitle: string;
  proposedSummary: string;
  proposedBody: string;
  message: string | null;
  status: NewsEditProposalStatus;
  reviewerId: string | null;
  reviewerUsername: string | null;
  reviewedAt: string | null;
  reviewMessage: string | null;
  createdAt: string;
}

export interface NewsProposalsResponse {
  proposals: NewsEditProposal[];
}

export interface NewsProposalResponse {
  proposal: NewsEditProposal;
}

export interface CreateNewsProposalRequest {
  proposedTitle: string;
  proposedSummary: string;
  proposedBody: string;
  message?: string;
}

export interface ReviewNewsProposalRequest {
  reviewMessage?: string;
}

export interface ToggleNewsReactionRequest {
  kind: NewsReactionKind;
}

export interface NewsArticleCard {
  id: string;
  slug: string;
  title: string;
  summary: string;
  coverEmoji: string;
  accentColor: NewsAccentColor;
  authorUsername: string;
  createdAt: string;
}

export interface NewsRelatedResponse {
  articles: NewsArticleCard[];
}

export interface NewsBookmarkSummary extends NewsArticleSummary {
  bookmarkedAt: string;
}

export interface NewsBookmarksResponse {
  articles: NewsBookmarkSummary[];
}

export interface ToggleNewsBookmarkResponse {
  bookmarked: boolean;
}

export interface NewsCommentNode {
  id: string;
  articleId: string;
  parentId: string | null;
  userId: string;
  username: string;
  displayName: string | null;
  content: string;
  editedAt: string | null;
  createdAt: string;
  children: NewsCommentNode[];
}

export interface NewsCommentsResponse {
  comments: NewsCommentNode[];
}

export interface CreateNewsCommentRequest {
  content: string;
  parentId?: string;
}

export interface UpdateNewsCommentRequest {
  content: string;
}

// --- Forum reactions / bookmarks / polls / follows ---

export type ForumReactionKind = NewsReactionKind;

export interface ForumPollOption {
  id: string;
  label: string;
  order: number;
  count: number;
}

export interface ForumPoll {
  id: string;
  question: string;
  totalVotes: number;
  myOptionId: string | null;
  options: ForumPollOption[];
}

export interface ForumBookmarkSummary {
  id: string;
  slug: string;
  title: string;
  postType: string;
  domainSlug: string;
  domainTitle: string;
  authorUsername: string;
  bookmarkedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ForumBookmarksResponse {
  topics: ForumBookmarkSummary[];
}

export interface ToggleForumReactionResponse {
  reactionCounts: Record<NewsReactionKind, number>;
  myReactions: Record<NewsReactionKind, boolean>;
}

export interface PollVoteResponse {
  poll: {
    id: string;
    myOptionId: string;
    totalVotes: number;
    options: ForumPollOption[];
  };
}

export interface FollowStatsResponse {
  followerCount: number;
  followingCount: number;
  following: boolean;
}

export interface ToggleFollowResponse {
  following: boolean;
}

export interface FollowSummary {
  username: string;
  displayName: string | null;
  createdAt: string;
}

export interface FollowsListResponse {
  followers: FollowSummary[];
  following: FollowSummary[];
}

export type FeedItem =
  | {
      kind: "news";
      slug: string;
      title: string;
      summary: string;
      coverEmoji: string;
      accentColor: NewsAccentColor;
      authorUsername: string;
      createdAt: string;
    }
  | {
      kind: "topic";
      slug: string;
      title: string;
      body: string;
      postType: string;
      domainSlug: string;
      domainTitle: string;
      authorUsername: string;
      createdAt: string;
    };

export interface FeedResponse {
  items: FeedItem[];
}

export interface CreatePollOption {
  label: string;
}

export interface CreateForumPollRequest {
  question: string;
  options: CreatePollOption[];
}

// --- Gamification: leaderboard, daily challenge, certificates ---

export interface LeaderboardEntry {
  rank: number;
  username: string;
  displayName: string | null;
  totalPoints: number;
  achievements: number;
  streak: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  // The auth'd user's slot — useful for "you're #243 of 1,200" UX
  // even when they don't appear in the top page.
  me: LeaderboardEntry | null;
}

export type DailyChallengeQuestionKind =
  | "multiple_choice"
  | "slider"
  | "drag_classify";

export interface DailyChallengeQuestion {
  // The shape mirrors a single quiz question. The client renders it
  // with the existing QuestionRenderer.
  raw: any;
}

export interface DailyChallengeStats {
  attempted: number;
  correct: number;
  // % of users who answered correctly so far today.
  correctRate: number;
}

export interface DailyChallengeResponse {
  challengeId: string;
  day: string;
  nodeSlug: string;
  nodeTitle: string;
  question: DailyChallengeQuestion;
  myAnswer: { answer: string; correct: boolean } | null;
  stats: DailyChallengeStats;
  streak: number;
}

export interface DailyChallengeSubmitRequest {
  answer: string;
}

export interface DailyChallengeSubmitResponse {
  correct: boolean;
  stats: DailyChallengeStats;
  streak: number;
}

export interface PathCertificateResponse {
  pathSlug: string;
  pathTitle: string;
  username: string;
  displayName: string | null;
  completedAt: string;
  totalNodes: number;
  achievements: number;
  // Hex/word color matching the path's accent for the rendered card.
  accentColor: string;
}

// --- AI extensions ---

export interface AiTagSuggestionsResponse {
  tags: string[];
}

export interface AiPracticeQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface AiPracticeQuestionsResponse {
  questions: AiPracticeQuestion[];
}

// --- WebSocket envelope ---

export type LiveEvent =
  | { kind: "notification"; notification: Notification }
  | {
      kind: "reaction_update";
      articleSlug: string;
      reactionCounts: Record<NewsReactionKind, number>;
    };

// --- Learning-path enrichments ---

export interface PathLessonProgressResponse {
  slideIdx: number;
}

export interface PathLessonNotesResponse {
  body: string;
  updatedAt: string | null;
}

export interface QuizMistakeEntry {
  nodeId: string;
  nodeSlug: string;
  nodeTitle: string;
  pathSlug: string | null;
  pathTitle: string | null;
  questionId: string;
  questionText: string | null;
  occurrences: number;
  lastWrongAt: string;
  resolvedAt: string | null;
}

export interface QuizMistakesResponse {
  mistakes: QuizMistakeEntry[];
}

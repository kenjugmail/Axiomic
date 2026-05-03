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

export type QuizQuestion =
  | MultipleChoiceQuestion
  | SliderQuestion
  | DragClassifyQuestion
  | CodeQuestion
  | PuzzleDragBuildQuestion;

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
  | "prediction";

export const POST_TYPES: PostType[] = [
  "claim",
  "question",
  "derivation",
  "critique",
  "synthesis",
  "prediction",
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
  | "mastery_level_up";

export type NotificationSubject = "topic" | "post" | "comment" | "mastery_node";

export const NOTIFICATION_KINDS: NotificationKind[] = [
  "mention",
  "topic_reply",
  "post_reply",
  "comment_reply",
  "mastery_level_up",
];

export const NOTIFICATION_SUBJECTS: NotificationSubject[] = [
  "topic",
  "post",
  "comment",
  "mastery_node",
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

export type SearchResultItem = SearchPageResult | SearchTopicResult;

export interface SearchResponse {
  query: string;
  results: SearchResultItem[];
}

// --- Settings & user preferences ---

export type ThemePreference = "light" | "dark" | "system";

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
}

export interface MasterySummaryResponse {
  username: string;
  paths: PathProgressSummary[];
  totalCompleted: number;
  highestLevel: MasteryLevel | null;
}

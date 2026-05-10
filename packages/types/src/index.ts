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
  // Sprint 52 — 'admin' unlocks the approval queue; 'member' for everyone else.
  role?: string;
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

// Sprint 18 — AI active coach. Compact per-user state surfaced in
// the AI sidebar and folded into the chat system prompt to make the
// tutor Socratic + state-aware.
export interface CoachContextMistake {
  questionId: string;
  nodeId: string;
  nodeSlug: string;
  pathSlug: string;
  questionText: string;
  occurrences: number;
  lastWrongAt: string;
}

export interface CoachContextLessonProgress {
  nodeId: string;
  nodeSlug: string;
  pathSlug: string;
  pathTitle: string;
  title: string;
  slideIdx: number;
  totalSlides: number;
  updatedAt: string;
}

export interface CoachContextPrereqGap {
  nodeId: string;
  nodeSlug: string;
  pathSlug: string;
  title: string;
}

export interface CoachContext {
  recentMistakes: CoachContextMistake[];
  dueFlashcards: number;
  weakConcepts: string[];
  currentLessonProgress: CoachContextLessonProgress | null;
  prerequisiteGaps: CoachContextPrereqGap[];
}

export type CoachSuggestionKind =
  | "review_prereq"
  | "review_mistake"
  | "spaced_rep"
  | "next_node"
  | "primer";

export interface CoachSuggestion {
  kind: CoachSuggestionKind;
  title: string;
  body: string;
  ctaUrl: string;
}

export interface CoachSuggestionsResponse {
  suggestions: CoachSuggestion[];
}

// Sprint 20 — Research papers. A first-class authoring surface
// distinct from news: tiered content (intro / undergrad / grad)
// stored side-by-side, paper-structure metadata fields, and a format
// flag (research / explainer / survey / opinion).
export type ResearchPaperTier = "intro" | "undergrad" | "grad";
export type ResearchPaperFormat =
  | "research"
  | "explainer"
  | "survey"
  | "opinion";
export type ResearchPaperStatus = "draft" | "published";
export type ResearchPaperAccent =
  | "indigo"
  | "emerald"
  | "rose"
  | "amber"
  | "sky"
  | "violet";

export interface ResearchPaperReference {
  label?: string;
  text: string;
  url?: string;
}

export interface ResearchPaperStructure {
  researchQuestion?: string;
  hypothesis?: string;
  method?: string;
  results?: string;
  discussion?: string;
  futureWork?: string;
}

export interface ResearchPaperSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  format: ResearchPaperFormat;
  abstract: string;
  coverEmoji: string;
  accentColor: ResearchPaperAccent;
  tags: string[];
  authorId: string;
  authorUsername: string;
  authorDisplayName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchPaperDraftSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  format: ResearchPaperFormat;
  coverEmoji: string;
  accentColor: ResearchPaperAccent;
  tags: string[];
  updatedAt: string;
}

export interface ResearchPaper extends ResearchPaperSummary {
  // The body resolved at the requested tier (with sensible fallback).
  content: string;
  // Which tier the server ended up returning content from. May differ
  // from `requestedTier` if the asked-for tier was empty.
  tier: ResearchPaperTier;
  requestedTier: ResearchPaperTier;
  // Tiers with non-empty content. Drives the toggle's enabled state.
  availableTiers: ResearchPaperTier[];
  allContent: {
    intro: string;
    undergrad: string;
    grad: string;
  };
  canonicalTier: ResearchPaperTier;
  paperStructure: ResearchPaperStructure;
  references: ResearchPaperReference[];
  coauthors: string[];
  status: ResearchPaperStatus;
  lastEditorUsername: string | null;
  readingMinutes: number;
  isAuthor: boolean;
  // Sprint 23.5 — runnable artifacts + reproStats bundled in the
  // GET /:slug response so the reader renders in one round-trip.
  artifacts: RunnableArtifact[];
  reproStats: ReproStats;
  // Sprint 32 — wiki slugs referenced from the body. Renders the
  // PrereqXray strip above the abstract.
  prereqWikiSlugs?: string[];
  // Sprint 35 — current published version number. Increments on each
  // publish; older versions accessible via /research/:slug/versions.
  currentVersion?: number;
}

// Sprint 35 — version metadata.
export interface VersionListEntry {
  version: number;
  title: string;
  editorUsername: string | null;
  editMessage: string | null;
  createdAt: string;
}

export interface VersionListResponse {
  currentVersion: number;
  versions: VersionListEntry[];
}

export interface ResearchPaperVersionResponse {
  version: number;
  title: string;
  summary: string;
  abstract: string;
  contentIntro: string;
  contentUndergrad: string;
  contentGrad: string;
  paperStructure: ResearchPaperStructure;
  references: ResearchPaperReference[];
  editorUsername: string | null;
  editMessage: string | null;
  createdAt: string;
}

export interface CapstoneVersionResponse {
  version: number;
  title: string;
  summary: string;
  contentIntro: string;
  contentUndergrad: string;
  contentGrad: string;
  milestones: Array<{
    id: string;
    order: number;
    title: string;
    description: string;
    rubricJson: string;
    requiredArtifactKinds: string;
  }>;
  editorUsername: string | null;
  editMessage: string | null;
  createdAt: string;
}

export interface ResearchPapersListResponse {
  papers: ResearchPaperSummary[];
}

export interface ResearchPapersDraftsResponse {
  papers: ResearchPaperDraftSummary[];
}

export interface ResearchPaperResponse {
  paper: ResearchPaper;
}

// Sprint 70 — for-you feed payload. Each rail is a list of ranked
// paper summaries with score breakdown for the "Why?" popover.
//
// Sprint 69 — `kind` widened to include 'external_paper' for ingested
// arXiv / OpenAlex / PubMed entries. External papers carry the
// upstream `htmlUrl` + optional DOI; the UI links the title there
// (new tab) instead of routing to /research/:slug.
export interface ResearchFeedItem {
  kind: "research" | "external_paper";
  id: string;
  slug: string;
  title: string;
  // For internal: 'research' | 'explainer' | 'survey' | 'opinion'.
  // For external: the upstream source ('arxiv' | 'openalex' |
  // 'pubmed').
  format: string;
  snippet: string;
  citationCount: number;
  publishedAt: string;
  tags: string[];
  authorUsername: string | null;
  // External-only fields. Null for internal papers.
  htmlUrl: string | null;
  doi: string | null;
  score: number;
  reason: string;
  breakdown: {
    interestScore: number;
    queryAffinity: number;
    authorOverlap: number;
    recencyDecay: number;
    citationBoost: number;
    alreadyShown: boolean;
    total: number;
  };
}

export interface ResearchFeedResponse {
  personalized: boolean;
  rails: {
    for_you: ResearchFeedItem[];
    trending: ResearchFeedItem[];
    from_follows: ResearchFeedItem[];
  };
}

// Sprint 71 — Funding feed.
export interface GrantSummary {
  id: string;
  source: string;
  sourceId: string;
  agency: string;
  title: string;
  summary: string;
  mechanism: string | null;
  amountCeiling: number | null;
  postedAt: string | null;
  deadlineAt: string | null;
  url: string;
  topics: string[];
  bookmarked?: boolean;
  bookmarkedAt?: string;
}

export interface GrantDetail extends GrantSummary {
  fullDescription: string;
}

export interface GrantsListResponse {
  items: GrantSummary[];
  count: number;
}

export interface GrantsBookmarksResponse {
  items: GrantSummary[];
}

export interface GrantsFeedItem {
  grant: GrantSummary;
  score: number;
  vectorScore: number;
  topicOverlap: number;
  reason: string;
}

export interface GrantsFeedResponse {
  personalized: boolean;
  items: GrantsFeedItem[];
}

export interface GrantDetailResponse {
  grant: GrantDetail;
}

// Sprint 72 — Author profile aggregator.
export interface AuthorProfileUser {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  orcid: string | null;
  scholarUrl: string | null;
  blueskyHandle: string | null;
  institution: string | null;
  hIndex: number | null;
}

export interface AuthorInternalPaper {
  id: string;
  slug: string;
  title: string;
  summary: string;
  format: string;
  tags: string[];
  citationCount: number;
  createdAt: string;
}

export interface AuthorExternalPaperRef {
  externalPaperId: string;
  ordinal: number;
  verifiedVia: string;
  verifiedAt: string;
  paper: {
    title: string;
    source: string;
    sourceId: string;
    venue: string | null;
    publishedAt: string | null;
    htmlUrl: string | null;
    citationCount: number;
  };
}

export interface AuthorSocialPost {
  id: string;
  source: string;
  text: string;
  url: string;
  postedAt: string | null;
  referencedPaperId: string | null;
  referencedSource: string | null;
  referencedSourceId: string | null;
}

export interface AuthorProfileResponse {
  user: AuthorProfileUser;
  papers: {
    internal: AuthorInternalPaper[];
    external: AuthorExternalPaperRef[];
  };
  socialPosts: AuthorSocialPost[];
}

export interface AuthorClaimRequest {
  id: string;
  externalPaperId: string;
  ordinal: number;
  status: string;
  evidenceText: string;
  evidenceUrl: string | null;
  reviewerId: string | null;
  reviewNote: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface PaperAuthorQuestion {
  id: string;
  parentId: string | null;
  userId: string;
  username: string;
  displayName: string | null;
  content: string;
  editedAt: string | null;
  createdAt: string;
  children: PaperAuthorQuestion[];
}

export interface PaperAuthorQuestionsResponse {
  questions: PaperAuthorQuestion[];
  authorClaimed: boolean;
}

// Sprint 73 — Exam mastery framework.
export interface ExamSummary {
  slug: string;
  title: string;
  shortName: string;
  pathSlug: string | null;
  totalDurationMinutes: number;
  description: string;
}

export interface ExamSectionDetail {
  slug: string;
  title: string;
  ordinal: number;
  durationMinutes: number;
  questionCount: number;
}

export interface ExamScoringSection {
  scaledTable: Array<{ raw: number; scaled: number }>;
  percentileTable?: Array<{ scaled: number; percentile: number }>;
  min: number;
  max: number;
}
export interface ExamScoringConfig {
  sections?: Record<string, ExamScoringSection>;
  overall?: ExamScoringSection;
}

export interface ExamDetail extends ExamSummary {
  sections: ExamSectionDetail[];
  scoring: ExamScoringConfig;
}

export interface ExamQuestionPayload {
  id: string;
  sectionId: string;
  sectionSlug: string;
  ordinal: number;
  // Sprint 75 — discriminator. 'multiple_choice' rendering shows
  // options buttons; 'essay' shows a textarea + the rubricMd in a
  // collapsible panel.
  type: "multiple_choice" | "essay";
  difficulty: number;
  promptMd: string;
  options: Array<{ label: string; text: string }>;
  topicTags: string[];
  // Essay-only. Null/0 for multiple-choice.
  rubricMd: string | null;
  maxEssayScore: number | null;
}

export interface ExamAttemptAnswer {
  questionId: string;
  selectedIndex: number | null;
  // Sprint 75 — essay free-text response + AI grade results.
  essayResponse?: string | null;
  essayScore?: number | null;
  essayFeedbackMd?: string | null;
  flagged: boolean;
  timeSpentMs: number;
}

export interface ExamAttemptState {
  id: string;
  mode: "full_mock" | "section" | "adaptive";
  sectionSlug: string | null;
  startedAt: string;
  expiresAt: string | null;
  completedAt: string | null;
  scoreScaled: number | null;
  sections: Array<{
    slug: string;
    questions: ExamQuestionPayload[];
  }>;
  answers: ExamAttemptAnswer[];
}

export interface ExamSectionResult {
  raw: number;
  scaled: number;
  percentile: number | null;
}

export interface ExamSubmitResponse {
  attemptId: string;
  rawTotal: number;
  // Sprint 78 — multiple-choice questions answered correctly. Distinct
  // from rawTotal so the UI can display "questions correct" without
  // double-counting essay rubric points (a 6-point GRE essay would
  // otherwise appear as "6 questions correct").
  mcCorrectCount?: number;
  scaledTotal: number;
  percentileTotal: number | null;
  sections: Record<string, ExamSectionResult>;
}

export interface ExamHistoryEntry {
  id: string;
  mode: string;
  sectionSlug: string | null;
  startedAt: string;
  completedAt: string | null;
  scoreScaled: number | null;
  scorePercentile: number | null;
  sectionScores: unknown;
}

export interface CreateResearchPaperRequest {
  slug: string;
  title: string;
  summary?: string;
  format?: ResearchPaperFormat;
  abstract?: string;
  contentIntro?: string;
  contentUndergrad?: string;
  contentGrad?: string;
  canonicalTier?: ResearchPaperTier;
  paperStructure?: ResearchPaperStructure;
  references?: ResearchPaperReference[];
  coauthors?: string[];
  coverEmoji?: string;
  accentColor?: ResearchPaperAccent;
  tags?: string[];
  status?: ResearchPaperStatus;
}

export interface UpdateResearchPaperRequest {
  title?: string;
  summary?: string;
  format?: ResearchPaperFormat;
  abstract?: string;
  contentIntro?: string;
  contentUndergrad?: string;
  contentGrad?: string;
  canonicalTier?: ResearchPaperTier;
  paperStructure?: ResearchPaperStructure;
  references?: ResearchPaperReference[];
  coauthors?: string[];
  coverEmoji?: string;
  accentColor?: ResearchPaperAccent;
  tags?: string[];
  status?: ResearchPaperStatus;
}

// Sprint 21 — Research paper generator wizard types. The wizard
// orchestrates the AI endpoints in apps/server/src/routes/ai.ts and
// hands a fully-drafted paper to the standard editor.
export type PaperOutlineSectionKind =
  | "concept"
  | "method"
  | "result"
  | "discussion"
  | "background";

export interface PaperOutlineSection {
  title: string;
  kind: PaperOutlineSectionKind;
  bullets: string[];
  // Filled in once the section has been drafted by /paper/draft-section.
  body?: string;
}

export interface PaperOutline {
  sections: PaperOutlineSection[];
}

export type PaperLengthTarget = "short" | "medium" | "deep";

export interface PaperOutlineRequest {
  title: string;
  researchQuestion?: string;
  format?: ResearchPaperFormat;
  tier?: ResearchPaperTier;
  length?: PaperLengthTarget;
}

export interface PaperDraftSectionRequest {
  paper: { title: string; format: ResearchPaperFormat };
  section: { title: string; kind?: PaperOutlineSectionKind; bullets: string[] };
  prior?: string;
  tier?: ResearchPaperTier;
  length?: PaperLengthTarget;
}

export interface PaperVizSuggestion {
  name: string;
  blurb: string;
  score: number;
}

export interface PaperVizSuggestionsResponse {
  suggestions: PaperVizSuggestion[];
}

export interface PaperConceptSuggestion {
  slug: string;
  title: string;
  score: number;
}

export interface PaperConceptSuggestionsResponse {
  suggestions: PaperConceptSuggestion[];
}

export interface PaperReferenceSuggestion {
  kind: "news" | "research";
  slug: string;
  title: string;
  url: string;
  score: number;
}

export interface PaperReferenceSuggestionsResponse {
  suggestions: PaperReferenceSuggestion[];
}

export interface PaperDeriveTierRequest {
  canonicalBody: string;
  canonicalTier: ResearchPaperTier;
  targetTier: ResearchPaperTier;
  format?: ResearchPaperFormat;
}

// Sprint 17 — Concept preview payload. Cheap subset of the full
// wiki page response; powers the hover card rendered anywhere a
// `[[slug]]` reference appears in markdown.
export type ConceptMasteryStatus =
  | "not_started"
  | "in_progress"
  | "completed";

export interface ConceptPreview {
  slug: string;
  title: string;
  category: string;
  // First non-empty paragraph of the intro tier, stripped of markdown.
  // Empty string when no intro content yet.
  oneLineDef: string;
  // Number of forum threads tagged to this wiki page.
  threadCount: number;
  // The first mastery node teaching this concept (when one exists),
  // used for the "Practice this" CTA inside the card.
  nodeRef: {
    nodeId: string;
    nodeSlug: string;
    pathSlug: string;
    pathTitle: string;
    title: string;
    level: string;
    hasLesson: boolean;
  } | null;
  // Per-user mastery on the linked node — null for anonymous viewers
  // or when no mastery node references this concept.
  masteryStatus: ConceptMasteryStatus | null;
}

// Lightweight forum topic shape used in cross-link rails (no
// per-topic vote counts or scores; just enough for the chip).
export interface LinkedTopicLite {
  id: string;
  slug: string;
  title: string;
  postType: string;
  authorUsername: string;
  postCount: number;
  lastActivityAt: string;
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
  // Sprint 16 — forum threads tagged to any wiki page in this node's
  // pageIds. Capped at 3 per node server-side; clients show "Discuss"
  // chips inline.
  linkedTopics?: LinkedTopicLite[];
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

// Sprint 16 — flywheel cross-link bundles surfaced on the wiki page
// so the reader sees "practice this in node X" and "article Y cites
// this concept" without round-tripping. Each list capped at 5
// server-side; older clients that don't render them simply ignore.
export interface LinkedNodeSummary {
  nodeId: string;
  nodeSlug: string;
  pathSlug: string;
  pathTitle: string;
  title: string;
  level: string;
  hasLesson: boolean;
}

export interface LinkedArticleSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  authorUsername: string;
  coverEmoji: string;
  accentColor: string;
}

export interface LinkedWikiPageSummary {
  slug: string;
  title: string;
}

export interface WikiPageResponse {
  page: WikiPage;
  content: string;
  allContent?: { intro: string; undergrad: string; grad: string };
  versions: PageVersion[];
  linkedTopics?: ForumTopicSummary[];
  linkedNodes?: LinkedNodeSummary[];
  linkedArticles?: LinkedArticleSummary[];
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
  // Set when the lesson was derived from a published news article via
  // the Paper→Lesson pipeline. The page renders a "Sourced from
  // @author's article" footer when this is non-null.
  sourceArticle?: {
    slug: string;
    title: string;
    authorUsername: string;
  } | null;
  // Sprint 32 — wiki slugs derived from this node's prereq mastery
  // nodes. Editor preview uses this to render PrereqXray.
  prereqWikiSlugs?: string[];
  // Sprint 82 — when nodeKind != 'lesson', the LessonPage renders a
  // lab-surface embed pointing at the matching protocol/cert/
  // equipment record. The lesson body is null in that case.
  nodeKind?: "lesson" | "protocol" | "cert" | "equipment-training";
  protocolSlug?: string | null;
  certSlug?: string | null;
  equipmentSlug?: string | null;
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
  // Sprint 16 — mastery nodes that teach the wiki page this topic is
  // tagged to. Populated only when the topic has a wikiPageId. Reader
  // can drop into the lesson if they're missing prerequisites.
  linkedNodes?: LinkedNodeSummary[];
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

// Sprint 78 — kept in sync with the server-side `NotificationKind`
// in apps/server/src/lib/notifications.ts. New kinds added since
// the original list:
//   - claim_thread_reply (S22), article_reproduced (S38),
//     track_completed + cohort_invitation +
//     proposal_approved + proposal_rejected (S52),
//     grant_match + grant_deadline_soon (S71).
// Without this widening the web's NotificationBell switch couldn't
// reference the new kinds without a TS error.
export type NotificationKind =
  | "mention"
  | "topic_reply"
  | "post_reply"
  | "comment_reply"
  | "claim_thread_reply"
  | "mastery_level_up"
  | "news_edit_proposed"
  | "news_edit_approved"
  | "news_edit_rejected"
  | "news_published"
  | "article_reproduced"
  | "forum_topic_posted"
  | "track_completed"
  | "cohort_invitation"
  | "proposal_approved"
  | "proposal_rejected"
  | "grant_match"
  | "grant_deadline_soon"
  // Sprint 80 — lab protocol runs + safety certifications.
  | "lab_signoff_requested"
  | "lab_signoff_approved"
  | "lab_signoff_rejected"
  | "lab_cert_passed"
  | "lab_cert_expiring"
  // S88 — classroom + pet engagement loop.
  | "cosmetic_granted"
  | "competition_won"
  | "pet_hatched"
  // S90 — pet evolution.
  | "pet_leveled_up";

export type NotificationSubject =
  | "topic"
  | "post"
  | "comment"
  | "mastery_node"
  | "news_article"
  | "news_proposal"
  | "news_comment"
  | "claim_thread"
  | "reproduction"
  | "capstone_track"
  | "content_proposal"
  | "grant"
  // Sprint 80
  | "lab_protocol_run"
  | "lab_cert"
  // S88 — classroom + pet engagement loop.
  | "cosmetic"
  | "competition"
  | "pet";

export const NOTIFICATION_KINDS: NotificationKind[] = [
  "mention",
  "topic_reply",
  "post_reply",
  "comment_reply",
  "claim_thread_reply",
  "mastery_level_up",
  "news_edit_proposed",
  "news_edit_approved",
  "news_edit_rejected",
  "news_published",
  "article_reproduced",
  "forum_topic_posted",
  "track_completed",
  "cohort_invitation",
  "proposal_approved",
  "proposal_rejected",
  "grant_match",
  "grant_deadline_soon",
  "lab_signoff_requested",
  "lab_signoff_approved",
  "lab_signoff_rejected",
  "lab_cert_passed",
  "lab_cert_expiring",
  "cosmetic_granted",
  "competition_won",
  "pet_hatched",
  "pet_leveled_up",
];

export const NOTIFICATION_SUBJECTS: NotificationSubject[] = [
  "topic",
  "post",
  "comment",
  "mastery_node",
  "news_article",
  "news_proposal",
  "news_comment",
  "claim_thread",
  "reproduction",
  "capstone_track",
  "content_proposal",
  "grant",
  "lab_protocol_run",
  "lab_cert",
  "cosmetic",
  "competition",
  "pet",
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

export interface SearchNewsResult {
  kind: "news";
  id: string;
  slug: string;
  title: string;
  snippet: string;
  score: number;
  matchedBy: SearchMatchedBy;
}

export interface SearchResearchResult {
  kind: "research";
  id: string;
  slug: string;
  title: string;
  format: string;
  snippet: string;
  score: number;
  matchedBy: SearchMatchedBy;
}

export type SearchResultItem =
  | SearchPageResult
  | SearchTopicResult
  | SearchLessonResult
  | SearchNewsResult
  | SearchResearchResult;

export interface SearchResponse {
  query: string;
  results: SearchResultItem[];
}

// Sprint 31/32 — Knowledge Navigator: intent-grouped search.
export interface SearchCapstoneBuildHit {
  kind: "capstone";
  slug: string;
  title: string;
  snippet: string;
  estimatedWeeks: number;
  completionCount: number;
}

export interface SearchNavigatorGroups {
  define: SearchResultItem[];
  practice: SearchResultItem[];
  discuss: SearchResultItem[];
  read: SearchResultItem[];
  build: SearchCapstoneBuildHit[];
}

export interface SearchNavigatorResponse {
  query: string;
  navigator: true;
  groups: SearchNavigatorGroups;
}

// --- Peer review (Sprint 39) ----------------------------------------

export type PeerReviewStatus = "endorsed" | "requested_changes";

export interface CapstonePeerReview {
  id: string;
  submissionId: string;
  milestoneId: string | null;
  reviewerUsername: string;
  status: PeerReviewStatus;
  score: number;
  feedback: string;
  createdAt: string;
}

export interface CapstonePeerReviewsResponse {
  reviews: CapstonePeerReview[];
}

export interface CapstonePeerReviewSummary {
  count: number;
  endorsed: number;
  averageScore: number | null;
}

export interface CapstoneReviewQueueItem {
  artifactPageSlug: string;
  capstoneSlug: string;
  capstoneTitle: string;
  coverEmoji: string;
  learnerUsername: string;
  learnerDisplayName: string | null;
  completedAt: string;
  peerReviewCount: number;
}

export interface CapstoneReviewQueueResponse {
  artifacts: CapstoneReviewQueueItem[];
}

// --- Misconception marketplace (Sprint 38) ---------------------------

export type MisconceptionSubmissionStatus =
  | "open"
  | "approved"
  | "rejected"
  | "merged";

export interface MisconceptionSubmissionListItem {
  id: string;
  conceptSlug: string;
  conceptTitle: string | null;
  key: string;
  label: string;
  descriptionPreview: string;
  status: MisconceptionSubmissionStatus;
  voteScore: number;
  proposerUsername: string;
  myVote: number; // -1 | 0 | +1
  catalogId: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface MisconceptionSubmissionListResponse {
  submissions: MisconceptionSubmissionListItem[];
  promotionThreshold: number;
}

export interface MisconceptionSubmissionDetail {
  id: string;
  conceptSlug: string;
  key: string;
  label: string;
  description: string;
  probeQuestions: string[];
  correctionPromptTemplate: string;
  status: MisconceptionSubmissionStatus;
  voteScore: number;
  catalogId: string | null;
  proposerUsername: string;
  myVote: number;
  createdAt: string;
  decidedAt: string | null;
}

export interface MisconceptionSubmissionDetailResponse {
  submission: MisconceptionSubmissionDetail;
  promotionThreshold: number;
}

export interface MisconceptionVoteResponse {
  voteScore: number;
  myVote: number;
  promoted: boolean;
  catalogId: string | null;
  threshold: number;
}

// --- Argument map (Sprint 36) ---------------------------------------
// Topology of a forum thread: nodes are posts, edges follow parentId.
// Returned by GET /forum/graph?slug=<topicSlug>.

export interface ArgumentMapTopic {
  id: string;
  slug: string;
  title: string;
  postType: string;
  authorUsername: string;
  domainSlug: string;
  createdAt: string;
  bodySnippet: string;
}

export interface ArgumentMapPost {
  id: string;
  parentId: string | null;
  authorUsername: string;
  bodySnippet: string;
  replyCount: number;
  score: number;
  createdAt: string;
}

export interface ArgumentMapResponse {
  topic: ArgumentMapTopic;
  posts: ArgumentMapPost[];
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
  // Sprint 69 — researcher profile fields. Surfaced on the settings
  // page and read-only on the public profile page. `hIndex` is
  // server-cached (refreshed by a future periodic job once external
  // author IDs land); not user-editable.
  orcid?: string | null;
  scholarUrl?: string | null;
  blueskyHandle?: string | null;
  twitterHandle?: string | null;
  institution?: string | null;
  hIndex?: number | null;
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
  // Sprint 69 — researcher profile fields. Server-side validation
  // rejects malformed ORCID / handle shapes; URL fields just check
  // for a parseable URL.
  orcid?: string | null;
  scholarUrl?: string | null;
  blueskyHandle?: string | null;
  twitterHandle?: string | null;
  institution?: string | null;
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
  // Set when this article has been turned into a lesson via the
  // Paper→Lesson pipeline. Null when no lesson has been derived. The
  // article view shows a "📚 Lesson available" badge that links to
  // /paths/{pathSlug}/lessons/{nodeSlug} when this is non-null.
  derivedLesson: {
    nodeId: string;
    nodeSlug: string;
    pathSlug: string;
  } | null;
  // Sprint 15 — reproducibility receipts. `artifacts` is the list of
  // runnable links the author has attached (Colab/GitHub/Docker/etc).
  // `reproStats` is an aggregate of all submitted receipts; the
  // article view turns total > 0 into a "Reproduced by N" badge in the
  // byline, and `mine` controls whether the "I reproduced this" button
  // is shown vs replaced with a "you already filed a receipt" hint.
  artifacts: RunnableArtifact[];
  reproStats: ReproStats;
  // Sprint 16 — wiki concepts referenced in the article body, top N
  // by mention count. Used by the article view's "Background concepts"
  // rail. Empty when no `[[slug]]` or `/wiki/{slug}` references
  // appear.
  relatedWikiPages: LinkedWikiPageSummary[];
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

// Claim-anchored discussion thread. Pinned to a passage in the article
// via text-quote (W3C model: exact + prefix + suffix). Replies are
// stored as news_comments with claimThreadId set.
export interface ClaimThreadReply {
  id: string;
  userId: string;
  username: string;
  content: string;
  editedAt: string | null;
  createdAt: string;
}

export interface ClaimThread {
  id: string;
  authorId: string;
  authorUsername: string;
  // The W3C TextQuoteSelector triple. Used by the client to locate the
  // passage in the rendered article via a fuzzy DOM walk.
  exact: string;
  prefix: string;
  suffix: string;
  createdAt: string;
  replies: ClaimThreadReply[];
}

export interface ClaimThreadsResponse {
  threads: ClaimThread[];
}

export interface CreateClaimThreadRequest {
  exact: string;
  prefix?: string;
  suffix?: string;
  body: string;
}

export interface CreateClaimThreadReplyRequest {
  content: string;
}

// --- Reproducibility receipts (Sprint 15) -------------------------

export type RunnableArtifactKind =
  | "github"
  | "colab"
  | "docker"
  | "dataset"
  | "arxiv"
  | "other";

export interface RunnableArtifact {
  id: string;
  kind: RunnableArtifactKind;
  url: string;
  label: string;
  description: string | null;
  createdAt: string;
}

export interface RunnableArtifactsResponse {
  artifacts: RunnableArtifact[];
}

export interface CreateRunnableArtifactRequest {
  kind: RunnableArtifactKind;
  url: string;
  label: string;
  description?: string;
}

export type ReproductionStatus = "success" | "partial" | "failed";

export interface Reproduction {
  id: string;
  artifactId: string | null;
  reproducerId: string;
  reproducerUsername: string;
  status: ReproductionStatus;
  notes: string | null;
  evidenceUrl: string | null;
  createdAt: string;
}

export interface ReproductionsResponse {
  reproductions: Reproduction[];
  stats: {
    total: number;
    success: number;
    partial: number;
    failed: number;
  };
}

export interface ReproStats {
  total: number;
  success: number;
  partial: number;
  failed: number;
  // Whether the requesting user has already filed a receipt. False
  // for anonymous viewers.
  mine: boolean;
}

export interface CreateReproductionRequest {
  artifactId?: string;
  status: ReproductionStatus;
  notes?: string;
  evidenceUrl?: string;
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
  // S91 — XP awarded for the first correct attempt today (0 when
  // wrong / repeat). petHatched fires only on the grant that crosses
  // PET_HATCH_THRESHOLD_XP for the first time; petLeveledUp on
  // crossing a level threshold afterward.
  xpAwarded?: number;
  petHatched?: { species: string; name: string } | null;
  petLeveledUp?: { newLevel: number } | null;
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

// Sprint 40 — draft collaboration channel kinds.
export type LiveDraftKind = "lesson" | "paper" | "capstone";

export type LiveEvent =
  | { kind: "notification"; notification: Notification }
  | {
      kind: "reaction_update";
      articleSlug: string;
      reactionCounts: Record<NewsReactionKind, number>;
    }
  // The server emits these with `type` rather than `kind` so they
  // share a discriminator with future broadcast event shapes.
  | {
      type: "draft_update";
      kind: LiveDraftKind;
      targetId: string;
      slides?: unknown;
      content?: string;
      editorUsername: string;
      updatedAt: string;
    }
  | {
      type: "draft_published";
      kind: LiveDraftKind;
      targetId: string;
      version: number;
      editorUsername: string;
      publishedAt: string;
    }
  | {
      type: "draft_presence";
      kind: LiveDraftKind;
      targetId: string;
      userIds: string[];
      usernames: string[];
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

// --- Capstones (Sprint 26-28) ----------------------------------------

export type CapstoneTier = "intro" | "undergrad" | "grad";
export type CapstoneStatus = "draft" | "published";
export type CapstoneAccent = ResearchPaperAccent;
// S85 — Complexity tier. `skill_drill` keeps the original 4-10 week
// scope; `long_arc` opts into the year-scale flow with calendar
// milestones, complexity-floor enforcement, and (S86+) advisor sign-off.
export type CapstoneScaleTier = "skill_drill" | "long_arc";
export type CapstoneArtifactKind =
  | "github"
  | "colab"
  | "docker"
  | "dataset"
  | "writeup"
  | "arxiv"
  | "other";

export interface CapstoneArtifact {
  kind: CapstoneArtifactKind;
  url: string;
  label: string;
  description?: string;
}

export interface CapstoneRubricCriterion {
  id: string;
  weight: number;
  description: string;
  aiPrompt: string;
}

export interface CapstoneRubric {
  criteria: CapstoneRubricCriterion[];
  passingScore: number;
  notes?: string;
}

export interface CapstoneMilestone {
  id: string;
  capstoneId: string;
  order: number;
  title: string;
  description: string;
  rubric: CapstoneRubric;
  requiredArtifactKinds: CapstoneArtifactKind[];
  runnableTests: string | null;
  estimatedDays: number;
  // S85 — calendar due date. ISO date string when set; null for skill drills
  // (which stay on relative `estimatedDays`).
  dueAt: string | null;
  // S85 — declares this milestone gates on advisor sign-off. Schema-only
  // signal in S85; gating enforcement ships in S86.
  advisorSignoffRequired: boolean;
  createdAt: string;
}

export interface CapstoneSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  estimatedWeeks: number;
  coverEmoji: string;
  accentColor: CapstoneAccent;
  tags: string[];
  authorId: string;
  authorUsername: string;
  authorDisplayName: string | null;
  milestoneCount: number;
  // S85 — tier discriminator. Skill drills surface `estimatedWeeks`
  // and a milestone count; long_arc cards additionally surface domain
  // count + the hour range.
  scaleTier: CapstoneScaleTier;
  domains: string[];
  estimatedHoursMin: number | null;
  estimatedHoursMax: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CapstoneMyEnrollmentSummary {
  id: string;
  startedAt: string;
  completedAt: string | null;
  artifactPageSlug: string | null;
  passedMilestoneIds: string[];
  pendingMilestoneIds: string[];
  needsRevisionMilestoneIds: string[];
}

export interface Capstone {
  id: string;
  slug: string;
  title: string;
  summary: string;
  brief: string;
  tier: CapstoneTier;
  requestedTier: CapstoneTier;
  availableTiers: CapstoneTier[];
  allContent: {
    intro: string;
    undergrad: string;
    grad: string;
  };
  canonicalTier: CapstoneTier;
  estimatedWeeks: number;
  prerequisiteWikiSlugs: string[];
  prerequisiteNodeIds: string[];
  tags: string[];
  coverEmoji: string;
  accentColor: CapstoneAccent;
  status: CapstoneStatus;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string | null;
  isAuthor: boolean;
  milestones: CapstoneMilestone[];
  myEnrollment: CapstoneMyEnrollmentSummary | null;
  currentVersion?: number;
  // S85 — tier + complexity-floor metadata.
  scaleTier: CapstoneScaleTier;
  domains: string[];
  estimatedHoursMin: number | null;
  estimatedHoursMax: number | null;
  realWorldDeliverableMd: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CapstoneSubmissionStatus = "pending" | "passed" | "needs_revision";

export interface CapstoneAiGradePerCriterion {
  criterionId: string;
  score: number;
  feedback: string;
}

export interface CapstoneAiGrade {
  score: number;
  perCriterion: CapstoneAiGradePerCriterion[];
  summary: string;
  gradedBy?: string;
}

export interface CapstoneRunnableTestResult {
  name: string;
  passed: boolean;
  message?: string;
}

export interface CapstoneSubmission {
  id: string;
  enrollmentId: string;
  milestoneId: string;
  artifacts: CapstoneArtifact[];
  writeup: string;
  status: CapstoneSubmissionStatus;
  aiGrade: CapstoneAiGrade | null;
  runnableTestResults: CapstoneRunnableTestResult[] | null;
  labState: Record<string, unknown> | null;
  submittedAt: string;
  gradedAt: string | null;
  // Sprint 39 — peer review summary, only present on the artifact
  // page response. Other capstone reads (workspace, list) omit it.
  peerReview?: CapstonePeerReviewSummary;
}

export interface CapstoneEnrollmentDetail {
  id: string;
  capstoneId: string;
  capstoneSlug: string;
  capstoneTitle: string;
  capstoneCoverEmoji: string;
  capstoneAccentColor: CapstoneAccent;
  startedAt: string;
  completedAt: string | null;
  artifactPageSlug: string | null;
  submissions: CapstoneSubmission[];
}

export interface CapstoneArtifactPage {
  capstone: Capstone;
  enrollment: {
    id: string;
    artifactPageSlug: string;
    startedAt: string;
    completedAt: string;
  };
  learner: {
    id: string;
    username: string;
    displayName: string | null;
  };
  submissions: CapstoneSubmission[];
  peerReviewSummary?: {
    totalReviews: number;
    totalEndorsed: number;
    averageScore: number | null;
  };
}

export interface CapstonesListResponse {
  capstones: CapstoneSummary[];
}

export interface CapstoneResponse {
  capstone: Capstone;
}

export interface CapstoneEnrollmentsResponse {
  enrollments: CapstoneEnrollmentDetail[];
}

export interface CapstoneArtifactPageResponse {
  artifact: CapstoneArtifactPage;
}

export interface CreateCapstoneRequest {
  slug: string;
  title: string;
  summary?: string;
  contentIntro?: string;
  contentUndergrad?: string;
  contentGrad?: string;
  canonicalTier?: CapstoneTier;
  estimatedWeeks?: number;
  prerequisiteWikiSlugs?: string[];
  prerequisiteNodeIds?: string[];
  tags?: string[];
  coverEmoji?: string;
  accentColor?: CapstoneAccent;
  status?: CapstoneStatus;
  // S85 — long_arc tier opt-in. When present and != 'skill_drill',
  // the floor validator runs and the *Hours/domains/deliverable
  // fields become required.
  scaleTier?: CapstoneScaleTier;
  domains?: string[];
  estimatedHoursMin?: number | null;
  estimatedHoursMax?: number | null;
  realWorldDeliverableMd?: string | null;
}

export interface UpdateCapstoneRequest {
  title?: string;
  summary?: string;
  contentIntro?: string;
  contentUndergrad?: string;
  contentGrad?: string;
  canonicalTier?: CapstoneTier;
  estimatedWeeks?: number;
  prerequisiteWikiSlugs?: string[];
  prerequisiteNodeIds?: string[];
  tags?: string[];
  coverEmoji?: string;
  accentColor?: CapstoneAccent;
  status?: CapstoneStatus;
  scaleTier?: CapstoneScaleTier;
  domains?: string[];
  estimatedHoursMin?: number | null;
  estimatedHoursMax?: number | null;
  realWorldDeliverableMd?: string | null;
}

export interface CreateMilestoneRequest {
  title: string;
  description?: string;
  rubric?: CapstoneRubric;
  requiredArtifactKinds?: CapstoneArtifactKind[];
  runnableTests?: string | null;
  estimatedDays?: number;
  order?: number;
  // S85 — calendar date for long_arc milestones.
  dueAt?: string | null;
  advisorSignoffRequired?: boolean;
}

export interface UpdateMilestoneRequest {
  title?: string;
  description?: string;
  rubric?: CapstoneRubric;
  requiredArtifactKinds?: CapstoneArtifactKind[];
  runnableTests?: string | null;
  estimatedDays?: number;
  order?: number;
  dueAt?: string | null;
  advisorSignoffRequired?: boolean;
}

export interface SubmitMilestoneRequest {
  artifacts: CapstoneArtifact[];
  writeup: string;
  runnableTestResults?: CapstoneRunnableTestResult[];
  labState?: Record<string, unknown>;
}

// --- Misconception coaching (Sprint 29) ------------------------------

export type MisconceptionStatus = "active" | "coached" | "resolved" | "dismissed";

export interface MisconceptionEvidence {
  kind: "quiz_mistake" | "lesson_slide" | "forum_reply" | "other";
  refId: string;
  snippet: string;
}

export interface MisconceptionDiagnosis {
  id: string;
  conceptSlug: string;
  conceptTitle: string | null;
  misconceptionKey: string;
  label: string;
  description: string;
  evidence: MisconceptionEvidence[];
  confidence: number;
  status: MisconceptionStatus;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface WeakConceptsResponse {
  diagnoses: MisconceptionDiagnosis[];
}

// --- Knowledge MRI (Sprint 33) -------------------------------------
// Concept-level diagnostic snapshot. Builds on existing tables — no
// new schema. Returned by GET /api/v1/me/knowledge-mri.

export type KnowledgeMriStatus = "mastered" | "in_progress" | "untouched";

export interface KnowledgeMriNode {
  nodeId: string;
  nodeSlug: string;
  title: string;
  level: string;
  // The first wiki page slug backing this node (most nodes have a 1:1
  // mapping; mathy clusters carry several).
  pageSlug: string | null;
  pageTitle: string | null;
  status: KnowledgeMriStatus;
  quizScore: number | null;
  activeDiagnoses: number;
  unresolvedMistakes: number;
  // Mean SM-2 rating in [0,1] over the last 30 days, or null when no
  // recent reviews.
  flashcardRetention: number | null;
  lastTouchedAt: string | null;
  prereqsMet: boolean;
}

export interface KnowledgeMriPathSummary {
  totalNodes: number;
  completedNodes: number;
  averageQuizScore: number;
  activeDiagnoses: number;
}

export interface KnowledgeMriPath {
  slug: string;
  title: string;
  summary: KnowledgeMriPathSummary;
  nodes: KnowledgeMriNode[];
}

export interface KnowledgeMriOverall {
  mastered: number;
  inProgress: number;
  untouched: number;
  activeDiagnoses: number;
  hottestPath: { slug: string; title: string } | null;
}

export interface KnowledgeMri {
  paths: KnowledgeMriPath[];
  overall: KnowledgeMriOverall;
}

// --- AI tutor modes (Sprint 30) --------------------------------------

export type TutorMode =
  | "socratic"
  | "misconception"
  | "bridge"
  | "debate"
  | "contribution";

export interface TutorModeContext {
  diagnosisId?: string;
  forumTopicId?: string;
  capstoneSlug?: string;
  milestoneId?: string;
  pageSlug?: string;
}

// --- Knowledge Navigator (Sprint 31) ---------------------------------

export type NavigatorIntent = "define" | "practice" | "discuss" | "read" | "build";

export interface NavigatorGroup<T = unknown> {
  intent: NavigatorIntent;
  items: T[];
  total: number;
}

export interface PrereqXrayEntry {
  conceptSlug: string;
  conceptTitle: string | null;
  status: "mastered" | "in_progress" | "untouched";
  nodeId?: string;
  nodeSlug?: string;
  pathSlug?: string;
}

export interface PrereqXrayResponse {
  entries: PrereqXrayEntry[];
}

export interface PortfolioEntryCapstone {
  kind: "capstone";
  capstoneSlug: string;
  capstoneTitle: string;
  artifactPageSlug: string;
  completedAt: string;
  coverEmoji: string;
  accentColor: CapstoneAccent;
}

export interface PortfolioEntryResearch {
  kind: "research";
  slug: string;
  title: string;
  summary: string;
  format: ResearchPaperFormat;
  publishedAt: string;
}

export interface PortfolioEntryWiki {
  kind: "wiki";
  slug: string;
  title: string;
  authoredFraction: number;
}

export interface PortfolioEntryReproduction {
  kind: "reproduction";
  count: number;
}

export type PortfolioEntry =
  | PortfolioEntryCapstone
  | PortfolioEntryResearch
  | PortfolioEntryWiki
  | PortfolioEntryReproduction;

export interface PortfolioResponse {
  username: string;
  entries: PortfolioEntry[];
}

// Sprint 79 — Lab protocols + equipment library.

export type LabDiscipline =
  | "biology"
  | "chemistry"
  | "mechanical"
  | "electrical"
  | "materials"
  | "cs-lab"
  | "physics";

export type ProtocolStatus = "draft" | "published";
export type EquipmentStatus = "active" | "retired";
export type EquipmentBookingPolicy = "open" | "reserve" | "supervised-only";
export type EquipmentOperationKind =
  | "calibration"
  | "daily-check"
  | "common-fault"
  | "post-use";

export interface ProtocolReagent {
  name: string;
  amount?: string;
  unit?: string;
  hazardClass?: string;
}

export interface ProtocolSummary {
  id: string;
  slug: string;
  title: string;
  discipline: LabDiscipline;
  category: string | null;
  summary: string;
  contentIntro: string;
  contentUndergrad: string;
  contentGrad: string;
  biosafetyLevel: number | null;
  hazardsMd: string;
  equipmentRequired: string[];
  reagents: unknown[];
  estimatedMinutes: number | null;
  requiredCerts: string[];
  version: number;
  status: ProtocolStatus;
  authorId: string;
  authorUsername: string | null;
  authorDisplayName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProtocolStep {
  id: string;
  ordinal: number;
  title: string;
  instructionMd: string;
  safetyNotesMd: string;
  verificationMd: string;
  inlineQuizJson: string | null;
  attachmentRefs: string[];
}

export interface ProtocolStepInput {
  title: string;
  instructionMd: string;
  safetyNotesMd?: string;
  verificationMd?: string;
  inlineQuizJson?: string | null;
  attachmentRefs?: string[];
}

export interface ProtocolDetailResponse {
  protocol: ProtocolSummary;
  steps: ProtocolStep[];
}

export interface ProtocolListResponse {
  protocols: ProtocolSummary[];
}

export interface ProtocolVersionEntry {
  version: number;
  editedBy: string | null;
  editMessage: string | null;
  createdAt: string;
}

export interface ProtocolVersionsResponse {
  versions: ProtocolVersionEntry[];
}

export interface CreateProtocolRequest {
  slug: string;
  title: string;
  discipline: LabDiscipline;
  category?: string | null;
  summary?: string;
  contentIntro?: string;
  contentUndergrad?: string;
  contentGrad?: string;
  biosafetyLevel?: number | null;
  hazardsMd?: string;
  equipmentRequired?: string[];
  reagents?: ProtocolReagent[];
  estimatedMinutes?: number | null;
  requiredCerts?: string[];
  steps?: ProtocolStepInput[];
  status?: ProtocolStatus;
}

export interface UpdateProtocolRequest {
  title?: string;
  discipline?: LabDiscipline;
  category?: string | null;
  summary?: string;
  contentIntro?: string;
  contentUndergrad?: string;
  contentGrad?: string;
  biosafetyLevel?: number | null;
  hazardsMd?: string;
  equipmentRequired?: string[];
  reagents?: ProtocolReagent[];
  estimatedMinutes?: number | null;
  requiredCerts?: string[];
  status?: ProtocolStatus;
}

export interface ReplaceProtocolStepsRequest {
  steps: ProtocolStepInput[];
  editMessage?: string;
}

export interface EquipmentSummary {
  id: string;
  slug: string;
  title: string;
  discipline: LabDiscipline;
  manufacturer: string | null;
  model: string | null;
  manualMd: string;
  locationHint: string | null;
  trainingCertSlug: string | null;
  hazardsMd: string;
  attachmentRefs: string[];
  bookingPolicy: EquipmentBookingPolicy;
  status: EquipmentStatus;
  authorId: string;
  authorUsername: string | null;
  authorDisplayName: string | null;
  createdAt: string;
}

export interface EquipmentOperation {
  id: string;
  ordinal: number;
  title: string;
  bodyMd: string;
  kind: EquipmentOperationKind;
}

export interface EquipmentOperationInput {
  title: string;
  bodyMd: string;
  kind: EquipmentOperationKind;
}

export interface EquipmentListResponse {
  equipment: EquipmentSummary[];
}

export interface EquipmentDetailResponse {
  equipment: EquipmentSummary;
  operations: EquipmentOperation[];
}

export interface CreateEquipmentRequest {
  slug: string;
  title: string;
  discipline: LabDiscipline;
  manufacturer?: string | null;
  model?: string | null;
  manualMd?: string;
  locationHint?: string | null;
  trainingCertSlug?: string | null;
  hazardsMd?: string;
  attachmentRefs?: string[];
  bookingPolicy?: EquipmentBookingPolicy;
  status?: EquipmentStatus;
  operations?: EquipmentOperationInput[];
}

export interface UpdateEquipmentRequest {
  title?: string;
  discipline?: LabDiscipline;
  manufacturer?: string | null;
  model?: string | null;
  manualMd?: string;
  locationHint?: string | null;
  trainingCertSlug?: string | null;
  hazardsMd?: string;
  attachmentRefs?: string[];
  bookingPolicy?: EquipmentBookingPolicy;
  status?: EquipmentStatus;
}

export interface ReplaceEquipmentOperationsRequest {
  operations: EquipmentOperationInput[];
}

// Sprint 80 — Safety certifications + protocol-run sign-offs.

export interface SafetyCertSummary {
  id: string;
  slug: string;
  title: string;
  discipline: LabDiscipline;
  description: string | null;
  passingScore: number;
  validityDays: number | null;
  authorId: string;
  createdAt: string;
}

export interface SafetyCertWithQuestionsResponse {
  cert: SafetyCertSummary;
  // Sanitized — server strips correct-answer keys before sending.
  questions: Array<Record<string, unknown>>;
}

export interface SafetyCertListResponse {
  certs: SafetyCertSummary[];
}

export interface SafetyCertAttemptResponse {
  passed: boolean;
  score: number;
  passingScore?: number;
  correct: number;
  total: number;
  passedAt?: string;
  expiresAt?: string | null;
}

export interface UserSafetyCertEntry {
  id: string;
  certSlug: string;
  passedAt: string;
  expiresAt: string | null;
  score: number | null;
  certTitle: string | null;
  certDiscipline: string | null;
}

export interface UserSafetyCertsResponse {
  certs: UserSafetyCertEntry[];
}

export type ProtocolRunStatus =
  | "in_progress"
  | "awaiting_signoff"
  | "signed_off"
  | "rejected";

export interface ProtocolRunStepStateEntry {
  done: boolean;
  doneAt?: string;
  observation?: string;
  attachmentRefs?: string[];
}

export interface ProtocolRunSummary {
  id: string;
  protocolId: string;
  protocolSlug: string;
  protocolTitle: string;
  protocolDiscipline: string;
  protocolVersion: number;
  userId: string;
  internUsername: string;
  internDisplayName: string | null;
  status: ProtocolRunStatus;
  startedAt: string;
  completedAt: string | null;
  signedOffAt: string | null;
  signedOffById: string | null;
  stepState: Record<string, ProtocolRunStepStateEntry>;
  notesMd: string;
  signOffNotesMd: string | null;
}

export interface ProtocolRunDetailResponse {
  run: ProtocolRunSummary;
  steps: Array<{
    id: string;
    ordinal: number;
    title: string;
    instructionMd: string;
    safetyNotesMd: string;
    verificationMd: string;
  }>;
  canSignOff: boolean;
}

export interface ProtocolRunListResponse {
  runs: ProtocolRunSummary[];
}

export interface StartProtocolRunMissingCerts {
  error: string;
  missingCerts: string[];
}

export interface StartProtocolRunResponse {
  runId: string;
  protocolVersion: number;
}

export interface StepUpdateRequest {
  done: boolean;
  observation?: string;
  attachmentRefs?: string[];
}

export interface SignOffRequest {
  notesMd?: string;
}

// Sprint 82 — Lab playbook + roster + skill MRI.

export type LabAssignmentKind = "protocol" | "cert" | "path";
export type LabAssignmentStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "overdue";

export interface LabPlaybookAssignment {
  id: string;
  cohortSlug: string;
  cohortName: string;
  kind: LabAssignmentKind | "unknown";
  targetSlug: string | null;
  targetTitle: string;
  dueAt: string | null;
  status: LabAssignmentStatus;
  notesMd: string | null;
  createdAt: string;
  assignedByUsername: string | null;
}

export interface LabPlaybookRecommendation {
  slug: string;
  title: string;
  discipline: string;
}

export interface LabPlaybookResponse {
  assignments: LabPlaybookAssignment[];
  recommended: LabPlaybookRecommendation[];
}

export interface LabRosterMember {
  userId: string;
  username: string;
  displayName: string | null;
  role: "member" | "mentor" | "organizer";
  joinedAt: string;
  assignments: { pending: number; completed: number; overdue: number };
  signedOffRunCount: number;
  activeCertCount: number;
}

export interface LabRosterAwaiting {
  id: string;
  userId: string;
  protocolSlug: string;
  protocolTitle: string;
  startedAt: string;
}

export interface LabRosterResponse {
  cohort: {
    id: string;
    slug: string;
    name: string;
    discipline: string | null;
  };
  members: LabRosterMember[];
  awaitingSignoffQueue: LabRosterAwaiting[];
}

export interface LabSkillMriProtocol {
  slug: string;
  title: string;
  status: "not_started" | "in_flight" | "signed_off";
  lastSignedOffAt: string | null;
}

export interface LabSkillMriEquipment {
  slug: string;
  title: string;
  certified: boolean;
  trainingCertSlug: string | null;
}

export interface LabSkillMriDiscipline {
  discipline: string;
  protocols: LabSkillMriProtocol[];
  equipment: LabSkillMriEquipment[];
}

export interface LabSkillMriResponse {
  disciplines: LabSkillMriDiscipline[];
}

export interface AssignLabWorkRequest {
  assignedToUserIds: string[];
  masteryPathSlug?: string | null;
  protocolSlug?: string | null;
  certSlug?: string | null;
  dueAt?: string | null;
  notesMd?: string;
}

export interface MasteryNodeKindFields {
  // Sprint 82 — surfaced on MasteryNode/MasteryPath responses so the
  // LessonPage can pick the right renderer.
  nodeKind?: "lesson" | "protocol" | "cert" | "equipment-training";
  protocolSlug?: string | null;
  certSlug?: string | null;
  equipmentSlug?: string | null;
}

// =============================================================
// S86 — Classroom engagement (classes, XP, pets, cosmetics)
// =============================================================

export type ClassRole = "instructor" | "ta" | "student" | "observer";
export type ClassStatus = "active" | "archived";
export type ClassTaskKind = "reading" | "homework";
export type AttendanceStatus = "present" | "absent" | "late" | "excused";
export type CosmeticSlot = "head" | "eyes" | "accessory";
export type CosmeticRarity = "common" | "rare" | "epic" | "legendary";

export interface ClassSummary {
  id: string;
  slug: string;
  title: string;
  term: string;
  description: string;
  status: ClassStatus;
  role: ClassRole;
  createdAt: string;
  updatedAt: string;
}

export interface ClassesListResponse {
  teaching: ClassSummary[];
  enrolled: ClassSummary[];
}

export interface ClassDetail {
  id: string;
  slug: string;
  title: string;
  term: string;
  description: string;
  syllabusMd: string;
  // S99 — instructor-authored welcome message (markdown).
  welcomeMessageMd: string;
  // S102 — opt-in to the public directory at /classes/discover.
  discoverable: boolean;
  status: ClassStatus;
  instructor: { id: string; username: string; displayName: string | null } | null;
  joinCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClassRosterEntry {
  userId: string;
  username: string;
  displayName: string | null;
  role: ClassRole;
  joinedAt: string;
}

export interface ClassTaskSummary {
  id: string;
  kind: ClassTaskKind;
  title: string;
  descriptionMd: string;
  url: string | null;
  dueAt: string | null;
  xpReward: number;
  createdAt: string;
  myCompleted: boolean;
}

export interface ClassDetailResponse {
  class: ClassDetail;
  myRole: ClassRole;
  myXp: number;
  roster: ClassRosterEntry[];
  tasks: ClassTaskSummary[];
}

export interface ClassEquippedCosmetic {
  slot: string;
  emoji: string | null;
  slug: string;
}

export interface ClassLeaderboardEntry {
  userId: string;
  username: string;
  displayName: string | null;
  role: ClassRole;
  xp: number;
  pet: {
    species: string;
    name: string;
    equipped: ClassEquippedCosmetic[];
    // S90 — pet evolution. Level-aware glyph + level number for the
    // leaderboard row's PetView.
    level?: number;
    levelEmoji?: string;
  } | null;
}

// S101 — leaderboard time windows. Echoed in the response so the
// client can confirm what it's rendering (defensive when the URL
// query param drives the request).
export type LeaderboardWindow = "all" | "week" | "today";

export interface ClassLeaderboardResponse {
  entries: ClassLeaderboardEntry[];
  window: LeaderboardWindow;
}

export interface ClassAttendanceEntry {
  id: string;
  userId: string;
  username: string;
  displayName: string | null;
  sessionDate: string;
  status: AttendanceStatus;
  recordedAt: string;
}

export interface ClassAttendanceResponse {
  entries: ClassAttendanceEntry[];
}

export interface ClassTaskGrade {
  pass: boolean;
  feedback: string;
}

export interface ClassTaskSubmission {
  id: string;
  userId: string;
  username: string;
  displayName: string | null;
  content: string | null;
  wasLate: boolean;
  grade: ClassTaskGrade | null;
  submittedAt: string;
  gradedAt: string | null;
}

export interface ClassTaskSubmissionsResponse {
  task: {
    id: string;
    kind: ClassTaskKind;
    title: string;
    descriptionMd: string;
    url: string | null;
    dueAt: string | null;
  };
  submissions: ClassTaskSubmission[];
}

export interface CreateClassRequest {
  slug: string;
  title: string;
  term?: string;
  description?: string;
  syllabusMd?: string;
  welcomeMessageMd?: string;
  discoverable?: boolean;
}

export interface UpdateClassRequest {
  title?: string;
  term?: string;
  description?: string;
  syllabusMd?: string;
  welcomeMessageMd?: string;
  discoverable?: boolean;
  status?: ClassStatus;
}

// S102 — public class directory entry.
export interface DiscoverClassEntry {
  slug: string;
  title: string;
  term: string;
  description: string;
  welcomeMessageMd: string;
  memberCount: number;
  instructorUsername: string;
  instructorDisplayName: string | null;
}

export interface DiscoverClassesResponse {
  classes: DiscoverClassEntry[];
}

export interface CreateClassTaskRequest {
  kind: ClassTaskKind;
  title: string;
  descriptionMd?: string;
  url?: string | null;
  dueAt?: string | null;
  xpReward?: number | null;
}

export interface UpdateClassTaskRequest {
  title?: string;
  descriptionMd?: string;
  url?: string | null;
  dueAt?: string | null;
  xpReward?: number | null;
}

export interface CompleteClassTaskRequest {
  content?: string | null;
}

export interface CompleteClassTaskResponse {
  ok: true;
  xpGranted: number;
  petHatched: { species: string; name: string } | null;
}

export interface GradeClassTaskRequest {
  pass: boolean;
  feedback?: string;
}

export interface RecordAttendanceRequest {
  sessionDate: string;
  entries: Array<{ userId: string; status: AttendanceStatus }>;
}

export interface GrantCosmeticRequest {
  userId: string;
  cosmeticSlug: string;
  note?: string;
}

export interface PetCosmeticDef {
  id: string;
  slug: string;
  name: string;
  slot: CosmeticSlot;
  renderKind: "emoji" | "svg";
  emoji: string | null;
  rarity: CosmeticRarity;
  grantOnly: boolean;
  description: string;
  // S89 — null = not for sale; positive int = purchasable in the
  // XP shop. (grantOnly is a S86 flag we keep around for back-
  // compat; xpCost is the source of truth for shop visibility.)
  xpCost?: number | null;
}

export interface PetCosmeticsCatalogResponse {
  cosmetics: PetCosmeticDef[];
}

export interface PetInventoryItem {
  id: string;
  slug: string;
  name: string;
  slot: CosmeticSlot;
  emoji: string | null;
  rarity: CosmeticRarity;
  description: string;
  equipped: boolean;
  acquiredAt: string;
  grantedNote: string | null;
}

export interface MyPetResponse {
  pet: {
    id: string;
    species: string;
    // Level-1 form. Kept around for back-compat with code that
    // reads speciesEmoji directly. New code should use levelEmoji.
    speciesEmoji: string;
    speciesLabel: string;
    name: string;
    hatchedAt: string;
    // S90 — pet evolution.
    level: number;
    maxLevel: number;
    // Emoji for the pet's current level. PetView renders this.
    levelEmoji: string;
    // XP threshold for the next level, or null at max.
    nextLevelXp: number | null;
    // S100 — full chain for the user's species. UI renders the
    // past + future forms alongside the current one so progression
    // is visible at a glance.
    evolutionChain: Array<{
      level: number;
      threshold: number;
      emoji: string;
    }>;
  } | null;
  totalXp: number;
  hatchThresholdXp: number;
  inventory: PetInventoryItem[];
  // S104 — multi-pet. Lists every pet the user owns so the UI can
  // render a swap strip; `pet` above is the currently-active one.
  // petCap is the per-user cap (3 in v1); nextHatchXp is the XP
  // threshold to hatch the user's next pet, or null when at cap.
  pets: Array<{
    id: string;
    species: string;
    speciesLabel: string;
    speciesEmoji: string;
    level: number;
    name: string;
    hatchedAt: string;
    isActive: boolean;
  }>;
  petCap: number;
  nextHatchXp: number | null;
}

export interface HatchAnotherPetResponse {
  ok: true;
  pet: {
    id: string;
    species: string;
    name: string;
    level: number;
  };
}

// =============================================================
// S87 — Competitions + per-username pet display.
// =============================================================

export type CompetitionStatus = "draft" | "active" | "ended";
// S88 added 'reading-completions' on the server but this union was
// never widened — the type was lying about what scoringRule values
// the API actually returns. Widen here so the web client's
// pattern-matching is honest.
export type CompetitionScoringRule = "class-xp" | "reading-completions";

export interface CompetitionSummary {
  id: string;
  classId: string;
  title: string;
  descriptionMd: string;
  startsAt: string;
  endsAt: string;
  scoringRule: CompetitionScoringRule;
  prizeCosmeticSlug: string;
  prizeCosmeticEmoji: string | null;
  prizeCosmeticName: string | null;
  prizeWinnerCount: number;
  status: CompetitionStatus;
  prizesAwarded: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompetitionStandingEntry {
  rank: number;
  userId: string;
  username: string | null;
  displayName: string | null;
  score: number;
  isWinner: boolean;
}

export interface CompetitionsListResponse {
  competitions: CompetitionSummary[];
}

export interface CompetitionDetailResponse {
  competition: CompetitionSummary;
  standings: CompetitionStandingEntry[];
}

export interface CreateCompetitionRequest {
  title: string;
  descriptionMd?: string;
  startsAt: string;
  endsAt: string;
  scoringRule?: CompetitionScoringRule;
  prizeCosmeticSlug: string;
  prizeWinnerCount?: number;
}

export interface UpdateCompetitionRequest {
  title?: string;
  descriptionMd?: string;
  startsAt?: string;
  endsAt?: string;
  prizeCosmeticSlug?: string;
  prizeWinnerCount?: number;
}

// Lean per-username payload powering the PetByUsername wrapper.
// pet=null when the user hasn't hatched a pet yet (or the username
// isn't found — the API doesn't distinguish to avoid leakage).
export interface UserPetDisplay {
  pet: {
    species: string;
    // S90 — speciesEmoji here is level-aware: it's the glyph for
    // the pet's current level, so bylines automatically reflect
    // evolution without per-byline level-aware code.
    speciesEmoji: string;
    level: number;
    name: string;
    equipped: Array<{ slot: string; emoji: string | null; slug: string }>;
  } | null;
}

// =============================================================
// S89 — XP shop.
// =============================================================

// One row from GET /me/pet/shop. Already filtered to purchasable
// cosmetics (xpCost not null). owned + affordable are computed
// per-user so the UI can render the right CTA without a second
// query.
export interface ShopItem {
  slug: string;
  name: string;
  slot: CosmeticSlot;
  emoji: string | null;
  rarity: CosmeticRarity;
  description: string;
  xpCost: number;
  // S95 — discounted price applied today if `featured` is true,
  // else equal to xpCost. Server is the source of truth — the buy
  // route re-derives the discount and ignores any client claim.
  effectiveCost: number;
  featured: boolean;
  owned: boolean;
  affordable: boolean;
}

export interface ShopResponse {
  balance: number;
  // S95 — the slug the server picked as today's featured cosmetic
  // (deterministic from UTC date). null if the shop has zero
  // purchasable items.
  featuredSlug: string | null;
  featuredDiscountPercent: number;
  items: ShopItem[];
}

export interface BuyCosmeticRequest {
  cosmeticSlug: string;
}

export interface BuyCosmeticResponse {
  ok: true;
  balance: number;
  cosmeticSlug: string;
  // S95 — actual XP burned (may be discounted) + whether it was
  // bought as today's featured. Lets the UI flash a "saved N XP!"
  // toast when the discount applied.
  amountSpent?: number;
  wasFeatured?: boolean;
}

// GET /me/pet/balance — small probe for the balance widget. Returns
// lifetime + spent so the UI can show "X spent of Y earned" without
// a second call.
export interface XpBalanceResponse {
  balance: number;
  lifetimeXp: number;
  spentXp: number;
}

// =============================================================
// S93 — Instructor analytics dashboard.
// =============================================================

export interface ClassAnalyticsXpByDay {
  day: string; // YYYY-MM-DD UTC
  totalXp: number;
  distinctUserCount: number;
}

export interface ClassAnalyticsTaskCompletion {
  taskId: string;
  title: string;
  kind: "reading" | "homework";
  dueAt: string | null;
  submittedCount: number;
  gradedPassCount: number;
  totalEnrolled: number;
}

export interface ClassAnalyticsAttendance {
  sessionDate: string;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  excusedCount: number;
}

export interface ClassAnalyticsStalled {
  userId: string;
  username: string;
  displayName: string | null;
  // Null when the student has never earned XP. Otherwise integer
  // days since the most recent class XP grant.
  daysSinceLastActivity: number | null;
  totalXp: number;
}

export interface ClassAnalyticsResponse {
  xpByDay: ClassAnalyticsXpByDay[];
  taskCompletions: ClassAnalyticsTaskCompletion[];
  attendanceRate: ClassAnalyticsAttendance[];
  stalledStudents: ClassAnalyticsStalled[];
  totalEnrolled: number;
  stalledThresholdDays: number;
  windowDays: number;
}

// =============================================================
// S94 — Student progress dashboard.
// =============================================================
//
// Per-user mirror of the S93 instructor analytics. Same window +
// shape patterns so the UI components can share styling vocabulary.

export interface MyProgressXpByDay {
  day: string;
  totalXp: number;
}

export interface MyProgressXpBySource {
  // Matches XpSource in apps/server/src/lib/xp.ts at runtime.
  source: string;
  totalXp: number;
  count: number;
}

export interface MyProgressClassStanding {
  classSlug: string;
  classTitle: string;
  myXp: number;
  myRank: number;
  totalMembers: number;
}

// =============================================================
// S98 — Profile cosmetic gallery.
// =============================================================

export interface CosmeticGalleryItem {
  slug: string;
  name: string;
  slot: CosmeticSlot;
  emoji: string | null;
  rarity: CosmeticRarity;
  description: string;
  // 'shop' = purchasable in /shop; 'grant' = obtainable only via
  // instructor grant or competition prize. Lets the gallery render
  // a hint for unowned items.
  obtainability: "shop" | "grant";
  owned: boolean;
  equipped: boolean;
}

export interface CosmeticGalleryResponse {
  items: CosmeticGalleryItem[];
  ownedCount: number;
  totalCount: number;
}

// =============================================================
// S97 — Public pet showcase.
// =============================================================

export interface PetShowcaseEquippedItem {
  slot: string;
  emoji: string | null;
  slug: string;
}

export interface PetShowcasePet {
  species: string;
  speciesEmoji: string;
  level: number;
  name: string;
  equipped: PetShowcaseEquippedItem[];
}

export interface PetShowcaseDecoratedEntry {
  userId: string;
  username: string;
  displayName: string | null;
  pet: PetShowcasePet;
  equippedCount: number;
}

export interface PetShowcaseTopLevelEntry {
  userId: string;
  username: string;
  displayName: string | null;
  pet: PetShowcasePet;
  hatchedAt: string;
}

export interface PetShowcaseResponse {
  mostDecorated: PetShowcaseDecoratedEntry[];
  recentTopLevel: PetShowcaseTopLevelEntry[];
}

// =============================================================
// S96 — Class question of the day.
// =============================================================

export interface ClassQuestionMyAttempt {
  answerIndex: number;
  correct: boolean;
  // Surfaced only after the user has attempted; null in the
  // unanswered case to prevent answer leakage.
  correctIndex: number;
}

export interface ClassQuestionActive {
  id: string;
  prompt: string;
  choices: string[];
  startsAt: string;
  myAttempt: ClassQuestionMyAttempt | null;
}

export interface ClassQuestionActiveResponse {
  question: ClassQuestionActive | null;
}

export interface CreateClassQuestionRequest {
  prompt: string;
  choices: string[];
  correctIndex: number;
}

export interface AnswerClassQuestionRequest {
  answerIndex: number;
}

export interface AnswerClassQuestionResponse {
  correct: boolean;
  correctIndex: number;
  xpAwarded: number;
}

// Instructor list — includes correctIndex and stats.
export interface ClassQuestionListItem {
  id: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  startsAt: string;
  endsAt: string | null;
  attempts: number;
  correctCount: number;
}

export interface ClassQuestionListResponse {
  questions: ClassQuestionListItem[];
}

export interface MyProgressResponse {
  lifetimeXp: number;
  streak: number;
  competitionWins: number;
  xpByDay: MyProgressXpByDay[];
  xpBySource: MyProgressXpBySource[];
  classStandings: MyProgressClassStanding[];
  cosmeticProgress: {
    ownedCount: number;
    totalCosmetics: number;
    ownedSlugs: string[];
  };
  windowDays: number;
}

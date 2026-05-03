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

import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  bio: text("bio"),
  theme: text("theme").notNull().default("system"),
  notifyMentions: integer("notify_mentions", { mode: "boolean" }).notNull().default(true),
  notifyReplies: integer("notify_replies", { mode: "boolean" }).notNull().default(true),
  notifyMastery: integer("notify_mastery", { mode: "boolean" }).notNull().default(true),
  // Set when the user finishes the post-signup onboarding wizard.
  // Null means they haven't onboarded yet (also true for legacy users
  // pre-feature; we treat null as "no longer prompt" to avoid surprising
  // existing accounts).
  onboardedAt: text("onboarded_at"),
  // Optional preferred starting path (slug) chosen during onboarding.
  // Used to seed the dashboard's "Continue learning" tile.
  startingPathSlug: text("starting_path_slug"),
  // Sprint 52 — content approval gate. 'admin' can review proposals;
  // 'member' is everyone else. One admin is bootstrapped from the
  // BOOTSTRAP_ADMIN_USERNAME env var on cold start if no admin exists.
  role: text("role").notNull().default("member"),
  // Sprint 54 — onboarding-stated goal. One of:
  //   'complete_track' | 'finish_path' | 'publish_paper' |
  //   'join_cohort' | 'ship_misconception' | null. Feeds the AI
  //   coach's system prompt and the home dashboard "next step" CTA.
  onboardingGoal: text("onboarding_goal"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

export const wikiPages = sqliteTable("wiki_pages", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  category: text("category").notNull().default("uncategorized"),
  currentVersion: integer("current_version").notNull().default(1),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
});

export const pageVersions = sqliteTable("page_versions", {
  id: text("id").primaryKey(),
  pageId: text("page_id").notNull().references(() => wikiPages.id),
  version: integer("version").notNull(),
  contentIntro: text("content_intro").notNull(),
  contentUndergrad: text("content_undergrad").notNull(),
  contentGrad: text("content_grad").notNull(),
  editedBy: text("edited_by").references(() => users.id),
  editMessage: text("edit_message"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  pageId: text("page_id").notNull().references(() => wikiPages.id),
  parentId: text("parent_id"),
  userId: text("user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  editedAt: text("edited_at"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

export const commentEdits = sqliteTable("comment_edits", {
  id: text("id").primaryKey(),
  commentId: text("comment_id").notNull().references(() => comments.id),
  previousContent: text("previous_content").notNull(),
  editedAt: text("edited_at").default(sql`(datetime('now'))`).notNull(),
});

export const votes = sqliteTable("votes", {
  id: text("id").primaryKey(),
  commentId: text("comment_id").notNull().references(() => comments.id),
  userId: text("user_id").notNull().references(() => users.id),
  value: integer("value").notNull(), // 1 or -1
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

export const masteryPaths = sqliteTable("mastery_paths", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

export const masteryNodes = sqliteTable("mastery_nodes", {
  id: text("id").primaryKey(),
  pathId: text("path_id").notNull().references(() => masteryPaths.id),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  order: integer("order").notNull(),
  level: text("level").notNull(), // apprentice, practitioner, specialist, expert, researcher
  pageIds: text("page_ids").notNull(), // JSON array of page IDs
  prerequisiteNodeIds: text("prerequisite_node_ids").notNull().default("[]"), // JSON array
  quizData: text("quiz_data"), // JSON: canned quiz questions for MockProvider
  // JSON: Brilliant-style lesson — array of slides (text+viz or
  // embedded-question). Loaded from seed-content/lessons/<slug>.json.
  lessonData: text("lesson_data"),
  // Bumped on each PUT to /lesson; mirrors wikiPages.currentVersion.
  // Starts at 1 even for nodes that have never had a lesson edit.
  currentLessonVersion: integer("current_lesson_version").notNull().default(1),
  // Wiki-style open editing keeps `lessonData` as the canonical
  // published payload. `draftLessonData` lets authors stash WIP without
  // exposing it to learners — published reads ignore the draft.
  draftLessonData: text("draft_lesson_data"),
  draftUpdatedAt: text("draft_updated_at"),
  draftEditorId: text("draft_editor_id").references(() => users.id),
  // Set when this node's lesson was derived from a news article via the
  // Paper→Lesson pipeline. Surfaces a "Sourced from @author's article"
  // link on the lesson page.
  sourceArticleId: text("source_article_id"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

// Anyone-can-flag-anything reports for lesson edits. Reports just
// accumulate; admin tooling for reviewing them is a follow-up.
export const lessonEditReports = sqliteTable(
  "lesson_edit_reports",
  {
    id: text("id").primaryKey(),
    nodeId: text("node_id").notNull().references(() => masteryNodes.id),
    version: integer("version").notNull(),
    reporterId: text("reporter_id").notNull().references(() => users.id),
    reason: text("reason").notNull(), // "vandalism" | "spam" | "accuracy" | "other"
    message: text("message"),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    nodeIdx: index("lesson_edit_reports_node_idx").on(t.nodeId, t.version),
    reporterIdx: index("lesson_edit_reports_reporter_idx").on(t.reporterId),
  }),
);

// Lesson edit history. Mirrors pageVersions for wiki: every PUT
// /mastery/nodes/:id/lesson appends a row, and restore semantics
// write a NEW version that points back to the snapshotted lessonData
// rather than overwriting history.
export const lessonVersions = sqliteTable("lesson_versions", {
  id: text("id").primaryKey(),
  nodeId: text("node_id").notNull().references(() => masteryNodes.id),
  version: integer("version").notNull(),
  lessonData: text("lesson_data").notNull(),
  editedBy: text("edited_by").references(() => users.id),
  editMessage: text("edit_message"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  uniq: uniqueIndex("lesson_versions_node_version_idx").on(
    t.nodeId,
    t.version,
  ),
}));

export const userProgress = sqliteTable("user_progress", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  nodeId: text("node_id").notNull().references(() => masteryNodes.id),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  quizScore: real("quiz_score"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

// --- Forum (Pillar 2: discourse) ---

export const domains = sqliteTable("domains", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

// postType is one of: claim, question, derivation, critique, synthesis, prediction.
// Validated at the API layer (Zod enum). SQLite has no native enum.
export const forumTopics = sqliteTable("forum_topics", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  postType: text("post_type").notNull(),
  domainId: text("domain_id").notNull().references(() => domains.id),
  authorId: text("author_id").notNull().references(() => users.id),
  wikiPageId: text("wiki_page_id").references(() => wikiPages.id),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
});

export const forumPosts = sqliteTable("forum_posts", {
  id: text("id").primaryKey(),
  topicId: text("topic_id").notNull().references(() => forumTopics.id),
  parentId: text("parent_id"),
  authorId: text("author_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  editedAt: text("edited_at"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

export const forumPostEdits = sqliteTable("forum_post_edits", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().references(() => forumPosts.id),
  previousBody: text("previous_body").notNull(),
  editedAt: text("edited_at").default(sql`(datetime('now'))`).notNull(),
});

// Polymorphic: subjectType is "topic" | "post". No FK; integrity enforced at app layer.
export const forumVotes = sqliteTable("forum_votes", {
  id: text("id").primaryKey(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  userId: text("user_id").notNull().references(() => users.id),
  value: integer("value").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

// --- Achievements & activity ---
//
// `user_achievements` records which user earned which achievement (and
// when). The achievement catalog itself is hardcoded in
// apps/server/src/lib/achievements.ts so we don't have to seed reference
// rows; the `slug` here is the catalog key.
export const userAchievements = sqliteTable(
  "user_achievements",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    slug: text("slug").notNull(),
    awardedAt: text("awarded_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    uniqIdx: uniqueIndex("user_achievements_uniq_idx").on(t.userId, t.slug),
  }),
);

// Append-only activity log. Each row is an event the user performed
// (completed a node, passed a quiz, saved a flashcard, posted a topic).
// Used to compute daily-activity streaks and to render the heatmap.
export const activityEvents = sqliteTable(
  "activity_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    kind: text("kind").notNull(),
    // Day key in YYYY-MM-DD UTC, computed at insert time. Lets the
    // heatmap aggregate cheaply via GROUP BY.
    day: text("day").notNull(),
    occurredAt: text("occurred_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    userDayIdx: index("activity_user_day_idx").on(t.userId, t.day),
  }),
);

// --- Flashcards (spaced repetition) ---
//
// Cards a user has saved into their personal deck. SM-2 state is stored
// inline (easeFactor / interval / repetitions / dueAt) so the scheduler
// only needs the row itself plus the new rating.
export const flashcards = sqliteTable(
  "flashcards",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    pageSlug: text("page_slug").notNull(),
    pageTitle: text("page_title").notNull(),
    front: text("front").notNull(),
    back: text("back").notNull(),
    easeFactor: real("ease_factor").notNull().default(2.5),
    interval: integer("interval").notNull().default(0),  // days; 0 == new card
    repetitions: integer("repetitions").notNull().default(0),
    dueAt: text("due_at"),  // null == new card, surfaces in "due today"
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    dueIdx: index("flashcards_due_idx").on(t.userId, t.dueAt),
  }),
);

// Append-only history of every review event. Useful for retention
// analytics and for reverting a misclick (we don't surface that yet).
export const flashcardReviews = sqliteTable("flashcard_reviews", {
  id: text("id").primaryKey(),
  cardId: text("card_id").notNull().references(() => flashcards.id),
  userId: text("user_id").notNull().references(() => users.id),
  rating: integer("rating").notNull(),  // 0..5 (SM-2 grade)
  reviewedAt: text("reviewed_at").default(sql`(datetime('now'))`).notNull(),
});

// --- News articles ---
//
// Long-form, article-style posts. Distinguished from forum topics by
// rendering full-width with a colored cover banner + emoji and by
// supporting a propose-then-approve edit flow:
//   - The author edits their own article directly.
//   - Anyone signed in can submit an edit proposal.
//   - The author approves or rejects each proposal; approving copies
//     the proposed fields onto the parent article.
// News bodies are markdown with the same `::viz[name]` directive
// support as wiki pages, so authors can embed live visualizations.
export const newsArticles = sqliteTable("news_articles", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  body: text("body").notNull(),
  // Optional research-paper fields. abstract is a longer-form intro
  // (one to two paragraphs) that renders ABOVE the body in the
  // article view. references is a JSON array of { label, url? }.
  // coauthors is a JSON array of usernames; together with authorId
  // the byline lists everyone who contributed.
  abstract: text("abstract").notNull().default(""),
  referencesJson: text("references_json").notNull().default("[]"),
  coauthorsJson: text("coauthors_json").notNull().default("[]"),
  // Visual flourish — drives the gradient hero on the article and card
  // in the list. coverEmoji is a single emoji (📰 default); accentColor
  // is one of indigo|emerald|rose|amber|sky|violet (validated at API).
  coverEmoji: text("cover_emoji").notNull().default("📰"),
  accentColor: text("accent_color").notNull().default("indigo"),
  // Publication state. Drafts are visible only to the author.
  // Validated at API to be "draft" | "published".
  status: text("status").notNull().default("published"),
  // JSON array of lowercase kebab-case tag strings. Stored as text
  // since SQLite has no native array; parsed by the API layer.
  tags: text("tags").notNull().default("[]"),
  authorId: text("author_id").notNull().references(() => users.id),
  // Tracks the most recent applied edit (the author's direct edit, or
  // an approved proposal). Null on a fresh article — same as authorId.
  lastEditorId: text("last_editor_id").references(() => users.id),
  // Set when an author has used Paper→Lesson to derive a teaching
  // lesson from this article. Surfaces a "📚 Lesson available" badge on
  // the article view that deep-links to the lesson.
  derivedLessonNodeId: text("derived_lesson_node_id"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
});

// Proposed edits from anyone-but-the-author. Status flows pending →
// (approved | rejected). Approving copies the proposed fields onto
// the parent article and stamps lastEditorId = proposerId.
export const newsEditProposals = sqliteTable(
  "news_edit_proposals",
  {
    id: text("id").primaryKey(),
    articleId: text("article_id").notNull().references(() => newsArticles.id),
    proposerId: text("proposer_id").notNull().references(() => users.id),
    proposedTitle: text("proposed_title").notNull(),
    proposedSummary: text("proposed_summary").notNull().default(""),
    proposedBody: text("proposed_body").notNull(),
    message: text("message"),
    status: text("status").notNull().default("pending"),
    reviewerId: text("reviewer_id").references(() => users.id),
    reviewedAt: text("reviewed_at"),
    reviewMessage: text("review_message"),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    articleStatusIdx: index("news_proposals_article_status_idx").on(
      t.articleId,
      t.status,
    ),
  }),
);

// Lightweight per-user reactions on news articles. Three kinds for v1
// (thumbs up, lightbulb, mind-blown). Unique on (article, user, kind)
// so each user can only set each reaction once but can mix kinds.
export const newsReactions = sqliteTable(
  "news_reactions",
  {
    id: text("id").primaryKey(),
    articleId: text("article_id").notNull().references(() => newsArticles.id),
    userId: text("user_id").notNull().references(() => users.id),
    kind: text("kind").notNull(),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    uniqIdx: uniqueIndex("news_reactions_uniq_idx").on(
      t.articleId,
      t.userId,
      t.kind,
    ),
    articleKindIdx: index("news_reactions_article_kind_idx").on(
      t.articleId,
      t.kind,
    ),
  }),
);

// Inline threaded comments scoped to a news article. Mirrors the wiki
// `comments` table shape but anchored to news_articles.id so the two
// surfaces stay decoupled and can evolve independently.
//
// `claimThreadId` is set when this comment lives inside a claim-anchored
// discussion thread (Sprint 14 — like hypothes.is or Genius). When null,
// the comment is a regular article-level comment under the article body.
export const newsComments = sqliteTable(
  "news_comments",
  {
    id: text("id").primaryKey(),
    // Legacy reference. Nullable since Sprint 23: research-paper-
    // targeted rows leave this null and use (targetKind, targetId).
    articleId: text("article_id").references(() => newsArticles.id),
    parentId: text("parent_id"),
    userId: text("user_id").notNull().references(() => users.id),
    content: text("content").notNull(),
    claimThreadId: text("claim_thread_id"),
    // Sprint 23 — polymorphism columns. `targetKind` discriminates
    // 'news_article' (default) vs 'research_paper'; `targetId` carries
    // the foreign id within that kind. `articleId` stays for legacy +
    // backfill.
    targetKind: text("target_kind").notNull().default("news_article"),
    targetId: text("target_id").notNull().default(""),
    editedAt: text("edited_at"),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    articleIdx: index("news_comments_article_idx").on(t.articleId, t.createdAt),
    claimThreadIdx: index("news_comments_claim_thread_idx").on(t.claimThreadId),
    targetIdx: index("news_comments_target_idx").on(t.targetKind, t.targetId, t.createdAt),
  }),
);

// Claim-anchored discussion threads. A thread is pinned to a specific
// passage in an article via text-quote annotation (W3C model). `exact`
// is the highlighted text; `prefix` / `suffix` are short snippets around
// it for fuzzy disambiguation when the text appears multiple times or
// the article is later edited. Replies live in `news_comments` with
// claimThreadId set.
export const claimThreads = sqliteTable(
  "claim_threads",
  {
    id: text("id").primaryKey(),
    // Nullable since Sprint 23 — see news_comments.articleId comment.
    articleId: text("article_id").references(() => newsArticles.id),
    authorId: text("author_id").notNull().references(() => users.id),
    // Sprint 23 — polymorphism: 'news_article' (default) vs 'research_paper'.
    targetKind: text("target_kind").notNull().default("news_article"),
    targetId: text("target_id").notNull().default(""),
    exact: text("exact").notNull(),
    prefix: text("prefix").notNull().default(""),
    suffix: text("suffix").notNull().default(""),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    articleIdx: index("claim_threads_article_idx").on(t.articleId, t.createdAt),
    targetIdx: index("claim_threads_target_idx").on(t.targetKind, t.targetId, t.createdAt),
  }),
);

// Reproducibility receipts (Sprint 15). Authors attach runnable
// artifacts (Colab notebook, GitHub repo, Docker image, dataset hash,
// arXiv link) to their published articles; other researchers submit a
// reproduction receipt with status (success/partial/failed) and
// optional notes. The article view shows a "Reproduced by N" badge
// once any receipts exist.
export const runnableArtifacts = sqliteTable(
  "runnable_artifacts",
  {
    id: text("id").primaryKey(),
    // Nullable since Sprint 23.
    articleId: text("article_id").references(() => newsArticles.id),
    // Sprint 23 — polymorphism: 'news_article' (default) vs 'research_paper'.
    targetKind: text("target_kind").notNull().default("news_article"),
    targetId: text("target_id").notNull().default(""),
    // 'github' | 'colab' | 'docker' | 'dataset' | 'arxiv' | 'other'
    kind: text("kind").notNull(),
    url: text("url").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    articleIdx: index("runnable_artifacts_article_idx").on(t.articleId, t.createdAt),
    targetIdx: index("runnable_artifacts_target_idx").on(t.targetKind, t.targetId, t.createdAt),
  }),
);

export const reproductions = sqliteTable(
  "reproductions",
  {
    id: text("id").primaryKey(),
    // Nullable since Sprint 23.
    articleId: text("article_id").references(() => newsArticles.id),
    // Sprint 23 — polymorphism: 'news_article' (default) vs 'research_paper'.
    targetKind: text("target_kind").notNull().default("news_article"),
    targetId: text("target_id").notNull().default(""),
    // Optional: which specific artifact this receipt covers. Null means
    // the receipt is for the article as a whole (e.g. the author
    // attached no formal artifacts but the reader still reproduced).
    artifactId: text("artifact_id").references(() => runnableArtifacts.id),
    reproducerId: text("reproducer_id").notNull().references(() => users.id),
    // 'success' | 'partial' | 'failed'
    status: text("status").notNull(),
    notes: text("notes"),
    evidenceUrl: text("evidence_url"),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    articleIdx: index("reproductions_article_idx").on(t.articleId, t.createdAt),
    // One receipt per (article, user) so a single researcher can't
    // inflate the badge count.
    uniquePerUser: uniqueIndex("reproductions_unique_per_user").on(
      t.articleId,
      t.reproducerId,
    ),
    // One receipt per (target, user) — the modern polymorphic version.
    uniquePerUserKind: uniqueIndex("reproductions_unique_per_user_kind").on(
      t.targetKind,
      t.targetId,
      t.reproducerId,
    ),
    targetIdx: index("reproductions_target_idx").on(t.targetKind, t.targetId, t.createdAt),
  }),
);

// Save-for-later. Unique on (user, article) so toggling is safe.
export const newsBookmarks = sqliteTable(
  "news_bookmarks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    articleId: text("article_id").notNull().references(() => newsArticles.id),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    uniqIdx: uniqueIndex("news_bookmarks_uniq_idx").on(t.userId, t.articleId),
    userIdx: index("news_bookmarks_user_idx").on(t.userId, t.createdAt),
  }),
);

// --- Forum reactions / bookmarks / polls ---
// Topic-level reactions (per-post deferred). Same three kinds as news.
export const forumReactions = sqliteTable(
  "forum_reactions",
  {
    id: text("id").primaryKey(),
    topicId: text("topic_id").notNull().references(() => forumTopics.id),
    userId: text("user_id").notNull().references(() => users.id),
    kind: text("kind").notNull(),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    uniqIdx: uniqueIndex("forum_reactions_uniq_idx").on(
      t.topicId,
      t.userId,
      t.kind,
    ),
    topicKindIdx: index("forum_reactions_topic_kind_idx").on(t.topicId, t.kind),
  }),
);

export const forumBookmarks = sqliteTable(
  "forum_bookmarks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    topicId: text("topic_id").notNull().references(() => forumTopics.id),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    uniqIdx: uniqueIndex("forum_bookmarks_uniq_idx").on(t.userId, t.topicId),
    userIdx: index("forum_bookmarks_user_idx").on(t.userId, t.createdAt),
  }),
);

// Polls live on a forum topic with postType="poll". One poll per topic;
// 2-8 options; each user votes for exactly one option (and may switch).
export const forumPolls = sqliteTable("forum_polls", {
  id: text("id").primaryKey(),
  topicId: text("topic_id").notNull().unique().references(() => forumTopics.id),
  question: text("question").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

export const forumPollOptions = sqliteTable(
  "forum_poll_options",
  {
    id: text("id").primaryKey(),
    pollId: text("poll_id").notNull().references(() => forumPolls.id),
    label: text("label").notNull(),
    order: integer("order").notNull(),
  },
  (t) => ({
    pollIdx: index("forum_poll_options_poll_idx").on(t.pollId, t.order),
  }),
);

export const forumPollVotes = sqliteTable(
  "forum_poll_votes",
  {
    id: text("id").primaryKey(),
    pollId: text("poll_id").notNull().references(() => forumPolls.id),
    optionId: text("option_id").notNull().references(() => forumPollOptions.id),
    userId: text("user_id").notNull().references(() => users.id),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    uniqIdx: uniqueIndex("forum_poll_votes_uniq_idx").on(t.pollId, t.userId),
  }),
);

// --- Social: one-way follow graph ---
export const userFollows = sqliteTable(
  "user_follows",
  {
    id: text("id").primaryKey(),
    followerId: text("follower_id").notNull().references(() => users.id),
    followeeId: text("followee_id").notNull().references(() => users.id),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    uniqIdx: uniqueIndex("user_follows_uniq_idx").on(
      t.followerId,
      t.followeeId,
    ),
    followerIdx: index("user_follows_follower_idx").on(t.followerId, t.createdAt),
    followeeIdx: index("user_follows_followee_idx").on(t.followeeId, t.createdAt),
  }),
);

// --- Notifications ---
//
// Polymorphic subject (matches forumVotes vocabulary): "topic" | "post" | "comment".
// kind is one of: mention | topic_reply | post_reply | comment_reply (validated at API layer).
// preview is plain text (≤140 chars), NOT markdown — rendered as text by the client.
// readAt is null while unread; the dedup partial index uses this to allow a fresh
// notification once a previous one has been read.
export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    actorId: text("actor_id").references(() => users.id),
    kind: text("kind").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    contextSlug: text("context_slug"),
    preview: text("preview"),
    readAt: text("read_at"),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    listIdx: index("notifications_list_idx").on(t.userId, t.readAt, t.createdAt),
    dedupIdx: uniqueIndex("notifications_dedup_idx")
      .on(t.userId, t.kind, t.subjectType, t.subjectId, t.actorId)
      .where(sql`read_at IS NULL`),
  }),
);

// --- Daily challenge ---
//
// One challenge per day, deterministic from the date so every user
// sees the same question. The challenge is a reference into an
// existing seeded quiz (nodeSlug + question id). Attempts are
// recorded for streaks + leaderboards.
export const dailyChallenges = sqliteTable(
  "daily_challenges",
  {
    id: text("id").primaryKey(),
    // Day key in YYYY-MM-DD UTC.
    day: text("day").notNull().unique(),
    // Source of the question — a node slug + question id within that
    // node's quizData.
    nodeSlug: text("node_slug").notNull(),
    questionId: text("question_id").notNull(),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    dayIdx: uniqueIndex("daily_challenges_day_idx").on(t.day),
  }),
);

export const dailyChallengeAttempts = sqliteTable(
  "daily_challenge_attempts",
  {
    id: text("id").primaryKey(),
    challengeId: text("challenge_id").notNull().references(() => dailyChallenges.id),
    userId: text("user_id").notNull().references(() => users.id),
    correct: integer("correct", { mode: "boolean" }).notNull(),
    answer: text("answer").notNull(),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    uniqIdx: uniqueIndex("daily_challenge_attempts_uniq_idx").on(
      t.challengeId,
      t.userId,
    ),
    userIdx: index("daily_challenge_attempts_user_idx").on(t.userId, t.createdAt),
  }),
);

// --- Per-node lesson progress + per-node notes ---
//
// Lesson progress lets the lesson player resume mid-lesson at the
// slide the user last reached. Notes are a small per-user scratchpad
// scoped to a node (rendered alongside the lesson and surfaced on
// the user's profile).
export const lessonProgress = sqliteTable(
  "lesson_progress",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    nodeId: text("node_id").notNull().references(() => masteryNodes.id),
    slideIdx: integer("slide_idx").notNull().default(0),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    uniqIdx: uniqueIndex("lesson_progress_uniq_idx").on(t.userId, t.nodeId),
  }),
);

export const lessonNotes = sqliteTable(
  "lesson_notes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    nodeId: text("node_id").notNull().references(() => masteryNodes.id),
    body: text("body").notNull().default(""),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    uniqIdx: uniqueIndex("lesson_notes_uniq_idx").on(t.userId, t.nodeId),
  }),
);

// Per-question wrong-answer log. Used to build the /review/mistakes
// page, auto-create flashcards, and weight the daily challenge toward
// a user's weak areas.
export const quizMistakes = sqliteTable(
  "quiz_mistakes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    nodeId: text("node_id").notNull().references(() => masteryNodes.id),
    questionId: text("question_id").notNull(),
    occurrences: integer("occurrences").notNull().default(1),
    lastWrongAt: text("last_wrong_at").default(sql`(datetime('now'))`).notNull(),
    // Set when the user later gets the same question right; the row
    // stays around for the mistakes log but doesn't bias the daily
    // challenge anymore.
    resolvedAt: text("resolved_at"),
  },
  (t) => ({
    uniqIdx: uniqueIndex("quiz_mistakes_uniq_idx").on(t.userId, t.nodeId, t.questionId),
    userIdx: index("quiz_mistakes_user_idx").on(t.userId, t.lastWrongAt),
  }),
);

// Per-slide telemetry powering the LessonAnalyticsPage. We append one
// row per (user, node, slideIdx, kind) the first time a user does the
// thing, ignored otherwise — gives us views, drop-offs, and per-slide
// answer correctness without exposing individual answer history.
export const lessonSlideEvents = sqliteTable(
  "lesson_slide_events",
  {
    id: text("id").primaryKey(),
    nodeId: text("node_id").notNull().references(() => masteryNodes.id),
    userId: text("user_id").notNull().references(() => users.id),
    slideIdx: integer("slide_idx").notNull(),
    kind: text("kind").notNull(), // "viewed" | "answered_correct" | "answered_wrong"
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    nodeIdx: index("lesson_slide_events_node_idx").on(t.nodeId, t.slideIdx),
    userUniqIdx: uniqueIndex("lesson_slide_events_user_uniq_idx").on(
      t.nodeId,
      t.userId,
      t.slideIdx,
      t.kind,
    ),
  }),
);

// User-uploaded files: images (incl. animated GIF/WebP), short videos,
// and the occasional PDF. Used by the rich composer in posts, the wiki
// editor, the lesson editor, and the news editor. We store only
// metadata here; the bytes live on disk under uploads/<id>.<ext>.
export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull().references(() => users.id),
    // "image" (any image/* mime), "video" (mp4 / webm), "file"
    // (anything else we accept, currently just PDF).
    kind: text("kind").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    // Path relative to the uploads root, e.g. "2026/05/<id>.png".
    storagePath: text("storage_path").notNull(),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    ownerIdx: index("attachments_owner_idx").on(t.ownerId, t.createdAt),
  }),
);

// Sprint 25 — embedding cache. Stores per-(corpusKind, corpusId)
// vector embeddings keyed by a content hash so the wizard's
// suggest-references / suggest-concepts endpoints don't re-embed the
// entire corpus on every call. Cache misses fall back to live
// embed-and-store.
export const cachedEmbeddings = sqliteTable(
  "cached_embeddings",
  {
    corpusKind: text("corpus_kind").notNull(),
    corpusId: text("corpus_id").notNull(),
    // Hash of (title + body slice) — when the source content changes
    // the hash changes too, so a stale cache entry is detected and
    // re-embedded on the next read.
    contentHash: text("content_hash").notNull(),
    // JSON-serialized number[] vector.
    vectorJson: text("vector_json").notNull(),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    pk: uniqueIndex("cached_embeddings_pk").on(t.corpusKind, t.corpusId),
  }),
);

// Research papers (Sprint 20). Distinct from news_articles in three
// concrete ways:
//
//   - Tiered content: intro / undergrad / grad bodies stored side by
//     side, like wiki_pages. The reader picks a tier; the author
//     marks one as canonical.
//   - Paper-structure metadata: optional research question, hypothesis,
//     method, results, discussion, future-work fields rendered as a
//     structured panel above the body.
//   - Format flag: research / explainer / survey / opinion drives a
//     handful of default sections + visual flourishes.
//
// Otherwise mirrors the news_articles shape (abstract, references,
// coauthors, status, tags, slug, accent + emoji) so the existing
// authoring patterns port cleanly. Comments / claim threads /
// artifacts / reproductions do NOT yet attach to research papers in
// v1 — those come back in a follow-up sprint once readers exist.
export const researchPapers = sqliteTable("research_papers", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  // 'research' | 'explainer' | 'survey' | 'opinion'
  format: text("format").notNull().default("research"),
  // Long-form intro paragraph rendered above the tier bodies.
  abstract: text("abstract").notNull().default(""),
  // The three-tier bodies. Either or both of intro / grad may be empty
  // when the author hasn't drafted them yet — the reader's tier toggle
  // hides empty tiers gracefully.
  contentIntro: text("content_intro").notNull().default(""),
  contentUndergrad: text("content_undergrad").notNull().default(""),
  contentGrad: text("content_grad").notNull().default(""),
  // Which tier is the source of truth — used by the wizard's
  // derive-tier step. 'intro' | 'undergrad' | 'grad'.
  canonicalTier: text("canonical_tier").notNull().default("undergrad"),
  // Optional structured metadata: { researchQuestion, hypothesis,
  // method, results, discussion, futureWork }. JSON.
  paperStructureJson: text("paper_structure_json").notNull().default("{}"),
  referencesJson: text("references_json").notNull().default("[]"),
  coauthorsJson: text("coauthors_json").notNull().default("[]"),
  coverEmoji: text("cover_emoji").notNull().default("📄"),
  accentColor: text("accent_color").notNull().default("violet"),
  // 'draft' | 'published'
  status: text("status").notNull().default("draft"),
  tags: text("tags").notNull().default("[]"),
  // Sprint 35 — bumped each time a published paper is edited; tracked
  // alongside the per-version snapshot in research_paper_versions.
  currentVersion: integer("current_version").notNull().default(1),
  // Sprint 54 — DOI permalink for academic citation. v1: synthetic
  // `10.5555/axiomic.research.<short-hash>`. Hook is in place for a
  // future Crossref integration.
  doi: text("doi"),
  citationCount: integer("citation_count").notNull().default(0),
  lastCitedAt: text("last_cited_at"),
  authorId: text("author_id").notNull().references(() => users.id),
  lastEditorId: text("last_editor_id").references(() => users.id),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  authorIdx: index("research_papers_author_idx").on(t.authorId, t.createdAt),
  statusIdx: index("research_papers_status_idx").on(t.status, t.createdAt),
}));

// Sprint 35 — Versioned research papers. Snapshot every published
// edit so external citations can pin to a specific version (`v=2`)
// and readers can diff versions side-by-side. Drafts do NOT create
// versions; a version row is appended only when the paper transitions
// to / re-publishes the 'published' status.
export const researchPaperVersions = sqliteTable("research_paper_versions", {
  id: text("id").primaryKey(),
  paperId: text("paper_id")
    .notNull()
    .references(() => researchPapers.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  abstract: text("abstract").notNull().default(""),
  contentIntro: text("content_intro").notNull().default(""),
  contentUndergrad: text("content_undergrad").notNull().default(""),
  contentGrad: text("content_grad").notNull().default(""),
  paperStructureJson: text("paper_structure_json").notNull().default("{}"),
  referencesJson: text("references_json").notNull().default("[]"),
  editedBy: text("edited_by").references(() => users.id),
  editMessage: text("edit_message"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  pk: uniqueIndex("research_paper_versions_pk").on(t.paperId, t.version),
  paperIdx: index("research_paper_versions_paper_idx").on(t.paperId, t.version),
}));

// Capstones (Sprint 26). A capstone is a thesis-scale (4-12 week)
// project a learner builds end-to-end and ships as a public artifact
// page. Authors publish a brief + ordered milestones + a per-milestone
// AI-graded rubric; learners enroll, submit each milestone, and on
// completion get a permanent public URL that proves what they built.
//
// Read this row alongside `capstone_milestones` to understand the
// shape; the brief is tiered (intro / undergrad / grad) like a wiki
// page so a curious novice and a seasoned reviewer both get value
// from the same artifact. `prerequisiteWikiSlugs` + `prerequisiteNodeIds`
// drive the prereq X-ray that surfaces above the brief.
export const capstones = sqliteTable("capstones", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  // Tiered brief mirrors research_papers / wiki_pages.
  contentIntro: text("content_intro").notNull().default(""),
  contentUndergrad: text("content_undergrad").notNull().default(""),
  contentGrad: text("content_grad").notNull().default(""),
  canonicalTier: text("canonical_tier").notNull().default("undergrad"),
  // Pacing hint surfaced on cards; not enforced.
  estimatedWeeks: integer("estimated_weeks").notNull().default(6),
  // JSON arrays. The X-ray reads both — wiki slugs let it green/yellow/
  // red against the user's mastery state directly; nodeIds tie into
  // mastery_paths for "complete this lesson first" hints.
  prerequisiteWikiSlugs: text("prerequisite_wiki_slugs").notNull().default("[]"),
  prerequisiteNodeIds: text("prerequisite_node_ids").notNull().default("[]"),
  tags: text("tags").notNull().default("[]"),
  coverEmoji: text("cover_emoji").notNull().default("🎓"),
  accentColor: text("accent_color").notNull().default("violet"),
  // 'draft' | 'published'
  status: text("status").notNull().default("draft"),
  // Sprint 35 — bumped each time a published capstone is edited.
  currentVersion: integer("current_version").notNull().default(1),
  // Sprint 54 — DOI permalink for capstone citations.
  doi: text("doi"),
  citationCount: integer("citation_count").notNull().default(0),
  lastCitedAt: text("last_cited_at"),
  authorId: text("author_id").notNull().references(() => users.id),
  lastEditorId: text("last_editor_id").references(() => users.id),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  authorIdx: index("capstones_author_idx").on(t.authorId, t.createdAt),
  statusIdx: index("capstones_status_idx").on(t.status, t.createdAt),
}));

// Sprint 35 — Versioned capstones. Snapshots the brief on every
// published edit so external citations can pin to a specific version
// and the artifact page reader can show what changed since enrollment.
export const capstoneVersions = sqliteTable("capstone_versions", {
  id: text("id").primaryKey(),
  capstoneId: text("capstone_id")
    .notNull()
    .references(() => capstones.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  contentIntro: text("content_intro").notNull().default(""),
  contentUndergrad: text("content_undergrad").notNull().default(""),
  contentGrad: text("content_grad").notNull().default(""),
  // Snapshot of the milestone list at this version (JSON: array of
  // milestones with title + description + rubric). Lets readers diff
  // structural changes, not just brief copy.
  milestonesJson: text("milestones_json").notNull().default("[]"),
  editedBy: text("edited_by").references(() => users.id),
  editMessage: text("edit_message"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  pk: uniqueIndex("capstone_versions_pk").on(t.capstoneId, t.version),
  capstoneIdx: index("capstone_versions_capstone_idx").on(t.capstoneId, t.version),
}));

// Per-capstone milestone. Ordered linearly via `order`. Each milestone
// carries a structured rubric (criteria + weights + AI prompts) and
// optional Pyodide-executable tests the learner runs in their browser
// before submitting. The rubric is the contract the AI grader scores
// against in S27.
export const capstoneMilestones = sqliteTable("capstone_milestones", {
  id: text("id").primaryKey(),
  capstoneId: text("capstone_id")
    .notNull()
    .references(() => capstones.id, { onDelete: "cascade" }),
  order: integer("order").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  // JSON: { criteria: [{ id, weight, description, aiPrompt }], passingScore, notes }
  rubricJson: text("rubric_json").notNull().default("{}"),
  // JSON array of artifact kinds the learner must attach
  // (e.g. ['github', 'colab']). Empty array allows any.
  requiredArtifactKinds: text("required_artifact_kinds").notNull().default("[]"),
  // Optional Python code (Pyodide-executable) the learner runs against
  // their solution before submitting. Pass/fail is included in the
  // submission and the AI grader can reference it.
  runnableTests: text("runnable_tests"),
  estimatedDays: integer("estimated_days").notNull().default(7),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  capstoneIdx: index("capstone_milestones_capstone_idx").on(t.capstoneId, t.order),
}));

// Sprint 27 — capstone enrollments. One row per (capstone, learner).
// Created on enroll; `completedAt` flips when every milestone for this
// enrollment has a passing submission, and `artifactPageSlug` is set
// at the same moment so /capstones/c/:slug becomes the public
// portfolio piece.
export const capstoneEnrollments = sqliteTable("capstone_enrollments", {
  id: text("id").primaryKey(),
  capstoneId: text("capstone_id")
    .notNull()
    .references(() => capstones.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id),
  startedAt: text("started_at").default(sql`(datetime('now'))`).notNull(),
  completedAt: text("completed_at"),
  // Set when the enrollment completes. Format: `${username}-${capstoneSlug}`.
  artifactPageSlug: text("artifact_page_slug"),
  // Sprint 54 — DOI on the public artifact page. Minted by an admin
  // via /admin/mint-doi.
  doi: text("doi"),
}, (t) => ({
  pk: uniqueIndex("capstone_enrollments_pk").on(t.capstoneId, t.userId),
  userIdx: index("capstone_enrollments_user_idx").on(t.userId, t.startedAt),
  artifactSlugIdx: uniqueIndex("capstone_enrollments_artifact_slug_idx").on(t.artifactPageSlug),
}));

// Sprint 27 — capstone submissions. One row per (enrollment, milestone).
// Re-submissions update the existing row in place — the previous
// `aiGradeJson` overwrites and the status flips from `needs_revision`
// back to `pending` then `passed`/`needs_revision`. We don't keep a
// full submission history in v1; the grade is a snapshot.
export const capstoneSubmissions = sqliteTable("capstone_submissions", {
  id: text("id").primaryKey(),
  enrollmentId: text("enrollment_id")
    .notNull()
    .references(() => capstoneEnrollments.id, { onDelete: "cascade" }),
  milestoneId: text("milestone_id")
    .notNull()
    .references(() => capstoneMilestones.id, { onDelete: "cascade" }),
  // JSON array of { kind, url, label, description? } — same shape as
  // runnable_artifacts rows but inline (artifacts on a submission are
  // scoped to that submission, not the parent capstone).
  artifactsJson: text("artifacts_json").notNull().default("[]"),
  writeup: text("writeup").notNull().default(""),
  // 'pending' | 'passed' | 'needs_revision'
  status: text("status").notNull().default("pending"),
  // JSON: { score, perCriterion: [{criterionId, score, feedback}], summary, gradedBy }
  aiGradeJson: text("ai_grade_json"),
  // JSON: per-test pass/fail when the milestone has runnable_tests.
  runnableTestResultsJson: text("runnable_test_results_json"),
  // Optional structured lab state captured by interactive labs (S28)
  // so the AI grader sees the learner's final widget state.
  labStateJson: text("lab_state_json"),
  submittedAt: text("submitted_at").default(sql`(datetime('now'))`).notNull(),
  gradedAt: text("graded_at"),
}, (t) => ({
  pk: uniqueIndex("capstone_submissions_pk").on(t.enrollmentId, t.milestoneId),
  milestoneIdx: index("capstone_submissions_milestone_idx").on(t.milestoneId, t.submittedAt),
}));

// Sprint 29 — misconception coaching. The detector runs against
// `quiz_mistakes` + `lesson_slide_events` and produces a typed
// diagnosis row per (user, conceptSlug, misconceptionKey). Coaching
// flips `status` to 'coached' once a tutor session targets it; a
// 'resolved' row means the learner has been getting the relevant
// probes right. `dismissed` rows are hidden from the UI.
export const misconceptionCatalog = sqliteTable("misconception_catalog", {
  id: text("id").primaryKey(),
  conceptSlug: text("concept_slug").notNull(),
  // Stable short id, e.g. 'softmax-temperature-inverted'.
  key: text("key").notNull(),
  label: text("label").notNull(),
  description: text("description").notNull().default(""),
  // JSON: short MCQ probes the AI tutor can ask to confirm.
  probeQuestionsJson: text("probe_questions_json").notNull().default("[]"),
  // System-prompt snippet folded into the misconception-mode tutor.
  correctionPromptTemplate: text("correction_prompt_template").notNull().default(""),
}, (t) => ({
  pk: uniqueIndex("misconception_catalog_pk").on(t.conceptSlug, t.key),
}));

export const misconceptionDiagnoses = sqliteTable("misconception_diagnoses", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  conceptSlug: text("concept_slug").notNull(),
  misconceptionKey: text("misconception_key").notNull(),
  label: text("label").notNull(),
  // JSON array of evidence pointers ({kind, refId, snippet}).
  evidenceJson: text("evidence_json").notNull().default("[]"),
  confidence: real("confidence").notNull().default(0.5),
  // 'active' | 'coached' | 'resolved' | 'dismissed'
  status: text("status").notNull().default("active"),
  firstSeenAt: text("first_seen_at").default(sql`(datetime('now'))`).notNull(),
  lastSeenAt: text("last_seen_at").default(sql`(datetime('now'))`).notNull(),
  resolvedAt: text("resolved_at"),
}, (t) => ({
  pk: uniqueIndex("misconception_diagnoses_pk").on(
    t.userId,
    t.conceptSlug,
    t.misconceptionKey,
  ),
  userIdx: index("misconception_diagnoses_user_idx").on(t.userId, t.status),
}));

// Sprint 38 — Misconception marketplace. Anyone can propose a new
// catalog entry; the community votes; once a submission crosses a
// score threshold it auto-promotes into misconception_catalog and
// the detector picks it up on the next run. Rejected submissions
// stay readable so the discussion isn't lost.
export const misconceptionSubmissions = sqliteTable("misconception_submissions", {
  id: text("id").primaryKey(),
  proposerId: text("proposer_id").notNull().references(() => users.id),
  conceptSlug: text("concept_slug").notNull(),
  // Stable short id mirroring misconception_catalog.key once promoted.
  key: text("key").notNull(),
  label: text("label").notNull(),
  description: text("description").notNull().default(""),
  probeQuestionsJson: text("probe_questions_json").notNull().default("[]"),
  correctionPromptTemplate: text("correction_prompt_template").notNull().default(""),
  // 'open' | 'approved' | 'rejected' | 'merged'
  // 'merged' is the terminal state once the entry is also written
  // into misconception_catalog (so the marketplace shows it as live).
  status: text("status").notNull().default("open"),
  // Cached sum of votes; recomputed by the vote handler in the same
  // transaction so the threshold-promote check is cheap.
  voteScore: integer("vote_score").notNull().default(0),
  catalogId: text("catalog_id").references(() => misconceptionCatalog.id),
  decidedAt: text("decided_at"),
  decidedBy: text("decided_by").references(() => users.id),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  // (conceptSlug, key) uniqueness mirrors the catalog so duplicate
  // proposals aren't allowed at submission time.
  pk: uniqueIndex("misconception_submissions_pk").on(t.conceptSlug, t.key),
  statusIdx: index("misconception_submissions_status_idx").on(
    t.status,
    t.voteScore,
  ),
}));

// Sprint 44 — Server-side execution runs. The API surface is in place
// so a real (Docker / gVisor / firejail) executor can plug in later;
// the default backend returns 'not_enabled' so cells can opt into
// "Run on server" when the deploy gates the feature on.
export const serverRuns = sqliteTable("server_runs", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => users.id),
  kernelKey: text("kernel_key").notNull(),
  language: text("language").notNull(), // 'python' | 'js'
  // Snapshot of the code submitted — stored verbatim so the audit
  // log shows what actually ran.
  source: text("source").notNull(),
  // 'queued' | 'running' | 'succeeded' | 'failed' | 'not_enabled'
  status: text("status").notNull().default("queued"),
  exitCode: integer("exit_code"),
  stdout: text("stdout").notNull().default(""),
  stderr: text("stderr").notNull().default(""),
  error: text("error"),
  durationMs: integer("duration_ms"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
}, (t) => ({
  ownerIdx: index("server_runs_owner_idx").on(t.ownerId, t.createdAt),
  statusIdx: index("server_runs_status_idx").on(t.status, t.createdAt),
}));

// Sprint 43 — Cohorts + mentor relationships.
//
// A cohort is a small named group (e.g. "transformer-fall-2026") with
// a creator, an optional capstone tied to it, and a roster. Members
// share a private space surfaced on the cohort page; cohort progress
// rolls up across members on the page header.
export const cohorts = sqliteTable("cohorts", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  // Optional capstone the cohort is working through together.
  capstoneSlug: text("capstone_slug"),
  // 'open' (anyone can join) | 'invite' (creator must approve)
  visibility: text("visibility").notNull().default("open"),
  creatorId: text("creator_id").notNull().references(() => users.id),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  creatorIdx: index("cohorts_creator_idx").on(t.creatorId, t.createdAt),
  visIdx: index("cohorts_vis_idx").on(t.visibility, t.createdAt),
}));

export const cohortMembers = sqliteTable("cohort_members", {
  id: text("id").primaryKey(),
  cohortId: text("cohort_id")
    .notNull()
    .references(() => cohorts.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id),
  // 'member' | 'mentor' (provides guidance) | 'organizer' (creator role)
  role: text("role").notNull().default("member"),
  joinedAt: text("joined_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  pk: uniqueIndex("cohort_members_pk").on(t.cohortId, t.userId),
  userIdx: index("cohort_members_user_idx").on(t.userId, t.role),
}));

// One-to-one mentor relationships outside of cohorts. A user offers
// themselves as a mentor in their profile; another user can request
// the relationship; once accepted, the mentee's questions surface
// on the mentor's dashboard.
export const mentorRelationships = sqliteTable("mentor_relationships", {
  id: text("id").primaryKey(),
  mentorId: text("mentor_id").notNull().references(() => users.id),
  menteeId: text("mentee_id").notNull().references(() => users.id),
  // 'pending' | 'accepted' | 'declined' | 'ended'
  status: text("status").notNull().default("pending"),
  // Free-text scope written by the mentee, e.g. "ML interpretability".
  scope: text("scope").notNull().default(""),
  requestedAt: text("requested_at").default(sql`(datetime('now'))`).notNull(),
  respondedAt: text("responded_at"),
}, (t) => ({
  pk: uniqueIndex("mentor_relationships_pk").on(t.mentorId, t.menteeId),
  mentorIdx: index("mentor_relationships_mentor_idx").on(t.mentorId, t.status),
  menteeIdx: index("mentor_relationships_mentee_idx").on(t.menteeId, t.status),
}));

// Sprint 42 — Kernel files. Attaches an uploaded file (from the
// shared `attachments` table) to a kernel scope (paper / capstone /
// lesson) so code cells running under that scope can read it from a
// virtual filesystem path. The file is the SAME row in `attachments`
// — this table is just a many-to-many between kernels and files plus
// the per-kernel display name.
export const kernelFiles = sqliteTable("kernel_files", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => users.id),
  // Free-form kernel scope, mirroring the client's CodeCell
  // `kernelKey` prop. Examples: 'paper:flash-attention', 'capstone:
  // build-a-transformer', 'lesson:xxxx-yyyy-zzz'.
  kernelKey: text("kernel_key").notNull(),
  // FK to attachments.id — the actual bytes live there. We keep a
  // separate row so a learner can attach the same uploaded CSV to
  // multiple kernels under different display names.
  attachmentId: text("attachment_id").notNull(),
  // The name the cell sees in the virtual filesystem, e.g. 'data.csv'.
  // Defaults to the attachment's originalName when registered.
  name: text("name").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  pk: uniqueIndex("kernel_files_pk").on(t.kernelKey, t.name, t.ownerId),
  ownerIdx: index("kernel_files_owner_idx").on(t.ownerId, t.kernelKey),
}));

// Sprint 39 — Capstone peer reviews. Anyone other than the
// submission author can endorse or request changes on a passed
// submission. The transcript (S37) folds in counts + average score so
// the signed claim covers both AI grading and peer validation.
export const capstonePeerReviews = sqliteTable("capstone_peer_reviews", {
  id: text("id").primaryKey(),
  submissionId: text("submission_id")
    .notNull()
    .references(() => capstoneSubmissions.id, { onDelete: "cascade" }),
  reviewerId: text("reviewer_id").notNull().references(() => users.id),
  // 'endorsed' | 'requested_changes'
  status: text("status").notNull(),
  // 0..1 normalized score the reviewer gave to the milestone work.
  score: real("score").notNull(),
  feedback: text("feedback").notNull().default(""),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  pk: uniqueIndex("capstone_peer_reviews_pk").on(t.submissionId, t.reviewerId),
  submissionIdx: index("capstone_peer_reviews_submission_idx").on(
    t.submissionId,
    t.createdAt,
  ),
  reviewerIdx: index("capstone_peer_reviews_reviewer_idx").on(
    t.reviewerId,
    t.createdAt,
  ),
}));

// One row per (submissionId, userId). Vote = +1 / -1; row absence
// means no vote. The marketplace re-aggregates voteScore after each
// upsert.
export const misconceptionSubmissionVotes = sqliteTable(
  "misconception_submission_votes",
  {
    id: text("id").primaryKey(),
    submissionId: text("submission_id")
      .notNull()
      .references(() => misconceptionSubmissions.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id),
    value: integer("value").notNull(), // +1 or -1
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    pk: uniqueIndex("misconception_submission_votes_pk").on(
      t.submissionId,
      t.userId,
    ),
    userIdx: index("misconception_submission_votes_user_idx").on(t.userId),
  }),
);

// Sprint 52 — Capstone tracks. A track bundles several capstones into a
// single curated path (the "ML Engineer track" wrapping
// transformer-from-scratch + fine-tuning + training-stability +
// inference-optimization). Completion auto-mints a signed manifest
// containing the user, the track, and the per-capstone artifact slugs.
export const capstoneTracks = sqliteTable("capstone_tracks", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  // Tiered description mirrors capstones / research_papers.
  contentIntro: text("content_intro").notNull().default(""),
  contentUndergrad: text("content_undergrad").notNull().default(""),
  contentGrad: text("content_grad").notNull().default(""),
  canonicalTier: text("canonical_tier").notNull().default("undergrad"),
  coverEmoji: text("cover_emoji").notNull().default("🎯"),
  accentColor: text("accent_color").notNull().default("violet"),
  tags: text("tags").notNull().default("[]"),
  // 'draft' | 'published'
  status: text("status").notNull().default("draft"),
  // Sprint 54 — DOI permalink for the track-level credential.
  doi: text("doi"),
  citationCount: integer("citation_count").notNull().default(0),
  lastCitedAt: text("last_cited_at"),
  authorId: text("author_id").notNull().references(() => users.id),
  lastEditorId: text("last_editor_id").references(() => users.id),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  authorIdx: index("capstone_tracks_author_idx").on(t.authorId, t.createdAt),
  statusIdx: index("capstone_tracks_status_idx").on(t.status, t.createdAt),
}));

// Join between tracks and capstones. `optional = 1` enables "any 4 of
// these 6" tracks; the completion threshold is computed from required
// + an optional minimum (default: complete all required).
export const capstoneTrackCapstones = sqliteTable("capstone_track_capstones", {
  trackId: text("track_id")
    .notNull()
    .references(() => capstoneTracks.id, { onDelete: "cascade" }),
  capstoneId: text("capstone_id")
    .notNull()
    .references(() => capstones.id, { onDelete: "cascade" }),
  order: integer("order").notNull(),
  // 0 = required, 1 = optional
  optional: integer("optional").notNull().default(0),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  pk: uniqueIndex("capstone_track_capstones_pk").on(t.trackId, t.capstoneId),
  trackIdx: index("capstone_track_capstones_track_idx").on(t.trackId, t.order),
}));

// One row per (track, learner) when the threshold is hit. The
// `signedTranscriptJson` is an ed25519-signed manifest of the
// completion: track slug + learner username + ordered list of the
// learner's capstone artifact slugs.
export const capstoneTrackCompletions = sqliteTable("capstone_track_completions", {
  id: text("id").primaryKey(),
  trackId: text("track_id")
    .notNull()
    .references(() => capstoneTracks.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id),
  completedAt: text("completed_at").default(sql`(datetime('now'))`).notNull(),
  // Format: `${username}-${trackSlug}`. The public artifact lives at
  // /tracks/c/:artifactPageSlug.
  artifactPageSlug: text("artifact_page_slug").notNull(),
  signedTranscriptJson: text("signed_transcript_json").notNull().default(""),
}, (t) => ({
  pk: uniqueIndex("capstone_track_completions_pk").on(t.trackId, t.userId),
  artifactSlugIdx: uniqueIndex("capstone_track_completions_artifact_slug_idx").on(
    t.artifactPageSlug,
  ),
  userIdx: index("capstone_track_completions_user_idx").on(t.userId, t.completedAt),
}));

// Sprint 52 — Cohort invitations. Organizers issue invites by email
// (one row per email), the invitee accepts by token, and the cohort
// membership row is created as a side effect. Email send is offline
// in v1 (organizer copies the URL); SMTP integration is a follow-up.
export const cohortInvitations = sqliteTable("cohort_invitations", {
  id: text("id").primaryKey(),
  cohortId: text("cohort_id")
    .notNull()
    .references(() => cohorts.id, { onDelete: "cascade" }),
  inviterId: text("inviter_id").notNull().references(() => users.id),
  email: text("email").notNull(),
  // Random URL-safe token used in /invitations/:token.
  token: text("token").notNull().unique(),
  // 'pending' | 'accepted' | 'declined' | 'revoked'
  status: text("status").notNull().default("pending"),
  message: text("message").notNull().default(""),
  // Set on accept.
  acceptedUserId: text("accepted_user_id").references(() => users.id),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  expiresAt: text("expires_at"),
  decidedAt: text("decided_at"),
}, (t) => ({
  cohortStatusIdx: index("cohort_invitations_cohort_status_idx").on(
    t.cohortId,
    t.status,
  ),
  emailStatusIdx: index("cohort_invitations_email_status_idx").on(
    t.email,
    t.status,
  ),
}));

// Sprint 52 — Content approval gate. Lessons / news articles / wiki
// edits route through this table instead of writing directly. Admins
// review at /admin/approvals; approval dispatches to per-kind apply
// functions (publish lesson / create-or-update news / write wiki).
// Wiki edits apply immediately and revert on reject; lessons + news
// stay private until approved.
export const contentProposals = sqliteTable("content_proposals", {
  id: text("id").primaryKey(),
  // 'lesson_publish' | 'news_publish' | 'news_edit' | 'wiki_edit'
  kind: text("kind").notNull(),
  // nodeId for lesson, articleId for news_edit, pageId for wiki_edit;
  // null for new news_publish (filled in on apply).
  targetId: text("target_id"),
  proposerId: text("proposer_id").notNull().references(() => users.id),
  // Proposed payload (slides JSON for lessons; article fields JSON for
  // news; tiered body JSON for wiki).
  payloadJson: text("payload_json").notNull(),
  // Prior state for revertable kinds (wiki). Null for lessons + news,
  // which simply discard on reject.
  priorSnapshotJson: text("prior_snapshot_json"),
  // 'pending' | 'approved' | 'rejected'
  status: text("status").notNull().default("pending"),
  reviewerId: text("reviewer_id").references(() => users.id),
  reviewNote: text("review_note"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  decidedAt: text("decided_at"),
}, (t) => ({
  statusIdx: index("content_proposals_status_idx").on(t.status, t.createdAt),
  proposerIdx: index("content_proposals_proposer_idx").on(t.proposerId, t.status),
}));

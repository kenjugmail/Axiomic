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
    articleId: text("article_id").notNull().references(() => newsArticles.id),
    parentId: text("parent_id"),
    userId: text("user_id").notNull().references(() => users.id),
    content: text("content").notNull(),
    claimThreadId: text("claim_thread_id"),
    editedAt: text("edited_at"),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    articleIdx: index("news_comments_article_idx").on(t.articleId, t.createdAt),
    claimThreadIdx: index("news_comments_claim_thread_idx").on(t.claimThreadId),
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
    articleId: text("article_id").notNull().references(() => newsArticles.id),
    authorId: text("author_id").notNull().references(() => users.id),
    exact: text("exact").notNull(),
    prefix: text("prefix").notNull().default(""),
    suffix: text("suffix").notNull().default(""),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    articleIdx: index("claim_threads_article_idx").on(t.articleId, t.createdAt),
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

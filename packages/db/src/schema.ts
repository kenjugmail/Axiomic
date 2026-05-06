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
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

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
export const newsComments = sqliteTable(
  "news_comments",
  {
    id: text("id").primaryKey(),
    articleId: text("article_id").notNull().references(() => newsArticles.id),
    parentId: text("parent_id"),
    userId: text("user_id").notNull().references(() => users.id),
    content: text("content").notNull(),
    editedAt: text("edited_at"),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    articleIdx: index("news_comments_article_idx").on(t.articleId, t.createdAt),
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

import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  bio: text("bio"),
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

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
  // S104 — multi-pet. Points at the user's currently-active pet
  // (one of their rows in `pets`). Null pre-hatch. No FK so the
  // ordering between users and pets table declarations doesn't
  // matter; correctness is enforced at the route layer (activate
  // checks ownership, hatch sets this column at insert time).
  activePetId: text("active_pet_id"),
  // Sprint 52 — content approval gate. 'admin' can review proposals;
  // 'member' is everyone else. One admin is bootstrapped from the
  // BOOTSTRAP_ADMIN_USERNAME env var on cold start if no admin exists.
  role: text("role").notNull().default("member"),
  // Sprint 54 — onboarding-stated goal. One of:
  //   'complete_track' | 'finish_path' | 'publish_paper' |
  //   'join_cohort' | 'ship_misconception' | null. Feeds the AI
  //   coach's system prompt and the home dashboard "next step" CTA.
  onboardingGoal: text("onboarding_goal"),
  // Hub-and-spoke onboarding: which audience path describes the user.
  // One of learn | research | build | teach | lab | prove, or null.
  primaryPersona: text("primary_persona"),
  // Sprint 69 — researcher profile fields.
  //   orcid: 0000-0000-0000-0000 format identifier; lets us link
  //     internal users to external author records (OpenAlex, arXiv).
  //   scholarUrl: full https://scholar.google.com/citations?user=…
  //     URL; surfaced on the profile page only.
  //   blueskyHandle: AT-Proto handle (e.g. "@user.bsky.social"). The
  //     S72 social-discovery cron uses this to harvest paper-DOI
  //     mentions.
  //   twitterHandle: parked — Twitter/X integration is gated on a
  //     paid bearer; field exists so we don't have to migrate again.
  //   institution: free-text current affiliation, surfaced on profile.
  //   hIndex: cached integer; refreshed nightly when external author
  //     IDs are present.
  //   publicationCorpusVectorJson: mean of the user's authored-paper
  //     embeddings (internal + claimed-external). Used by the S70
  //     ranker's interestScore so even researchers with zero internal
  //     publications get personalized recommendations once they
  //     claim external work.
  //   externalAuthorIdsJson: JSON array of {source, id} pairs the
  //     user has verified, e.g. [{source:"openalex", id:"A1234"}].
  orcid: text("orcid"),
  scholarUrl: text("scholar_url"),
  blueskyHandle: text("bluesky_handle"),
  twitterHandle: text("twitter_handle"),
  institution: text("institution"),
  hIndex: integer("h_index"),
  publicationCorpusVectorJson: text("publication_corpus_vector_json"),
  externalAuthorIdsJson: text("external_author_ids_json").notNull().default("[]"),
  // S108 — Beta-readiness: email verification + soft account deletion.
  // emailVerifiedAt: null until the user clicks the verify link. Used
  //   by requireVerifiedEmail() to gate publish + upload routes.
  // deletedAt: null for live users. Set to an ISO timestamp on
  //   self-service account deletion. Login is refused; the 30-day
  //   sweeper hard-deletes the row (FK cascades clean content).
  emailVerifiedAt: text("email_verified_at"),
  deletedAt: text("deleted_at"),
  // S109 — Pending email change. When the user requests an email
  // change, we write the new address here and mint a verification
  // token tied to it. The verify-email-change route copies
  // pendingEmail → email when the link is clicked.
  pendingEmail: text("pending_email"),
  // Phase 28A — gates the public credential wallet at
  // /u/:username/credentials. Default true: the artifact pages it
  // aggregates are already public, so the portfolio is too unless
  // the user opts out.
  credentialsPublic: integer("credentials_public", { mode: "boolean" })
    .notNull()
    .default(true),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  // Sprint 78 — uniqueness on the public researcher identifiers.
  // Without this, two users could claim the same ORCID and the
  // ORCID auto-claim cron would route external-paper authorship
  // arbitrarily (last-write-wins via Map.set) — effectively
  // identity theft of any researcher whose ORCID a malicious
  // user knows. Same for the Bluesky handle which drives the
  // social-mentions harvester.
  orcidUq: uniqueIndex("users_orcid_uq").on(t.orcid),
  blueskyHandleUq: uniqueIndex("users_bluesky_handle_uq").on(t.blueskyHandle),
}));

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  expiresAt: text("expires_at").notNull(),
  // S109 — populated at session create. Lets the user see their
  // active sessions and revoke individual devices from settings.
  userAgent: text("user_agent"),
  ip: text("ip"),
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

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    pageId: text("page_id").notNull().references(() => wikiPages.id),
    parentId: text("parent_id"),
    userId: text("user_id").notNull().references(() => users.id),
    content: text("content").notNull(),
    editedAt: text("edited_at"),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    userIdx: index("comments_user_idx").on(t.userId, t.createdAt),
    pageIdx: index("comments_page_idx").on(t.pageId, t.createdAt),
  }),
);

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
  // Sprint 82 — node kind discriminator. 'lesson' (default) keeps the
  // existing slide+quiz renderer; 'protocol' / 'cert' / 'equipment-
  // training' embed the corresponding lab surface and complete when
  // the underlying record reaches its terminal state.
  nodeKind: text("node_kind").notNull().default("lesson"),
  protocolSlug: text("protocol_slug"),
  certSlug: text("cert_slug"),
  equipmentSlug: text("equipment_slug"),
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
export const forumTopics = sqliteTable(
  "forum_topics",
  {
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
  },
  (t) => ({
    authorIdx: index("forum_topics_author_idx").on(t.authorId, t.createdAt),
    domainIdx: index("forum_topics_domain_idx").on(t.domainId, t.createdAt),
  }),
);

export const forumPosts = sqliteTable(
  "forum_posts",
  {
    id: text("id").primaryKey(),
    topicId: text("topic_id").notNull().references(() => forumTopics.id),
    parentId: text("parent_id"),
    authorId: text("author_id").notNull().references(() => users.id),
    body: text("body").notNull(),
    editedAt: text("edited_at"),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    topicIdx: index("forum_posts_topic_idx").on(t.topicId, t.createdAt),
    authorIdx: index("forum_posts_author_idx").on(t.authorId, t.createdAt),
  }),
);

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
    // Phase 15F — covers `WHERE user_id = ? AND kind = ?` filters
    // hit by achievement predicates, currentStreak's pet-kind
    // exclusion, and the heatmap query. Phase 14D widened the table
    // with 9 pet kinds so this seek path matters more.
    userKindIdx: index("activity_user_kind_idx").on(t.userId, t.kind),
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
export const newsArticles = sqliteTable(
  "news_articles",
  {
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
  },
  (t) => ({
    authorIdx: index("news_articles_author_idx").on(t.authorId, t.createdAt),
    statusIdx: index("news_articles_status_idx").on(t.status, t.createdAt),
  }),
);

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
    // Phase 28B — set once a reproduction crosses the peer-review
    // confirmation threshold. Null = not yet credentialed. Gates
    // the signed "Reproduction Verified" credential so it mints
    // exactly once.
    credentialMintedAt: text("credential_minted_at"),
    // Phase 29A — the summed reviewer trust weight at the moment
    // of mint (audit + reversibility; null until minted).
    credentialMintWeight: real("credential_mint_weight"),
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

// ── Phase 0 foundation tables (additive; unblock later phases) ──

// Append-only attempt history. user_progress.quiz_score overwrites
// (no history) and lesson_slide_events is first-touch only, so
// confidence/calibration (Phase 4) and retry analytics need this.
export const quizAttempts = sqliteTable(
  "quiz_attempts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    nodeId: text("node_id").notNull().references(() => masteryNodes.id),
    questionId: text("question_id").notNull(),
    slideIdx: integer("slide_idx"),
    attemptNo: integer("attempt_no").notNull().default(1),
    correct: integer("correct", { mode: "boolean" }).notNull(),
    // 0..3 self-reported confidence; null when not prompted.
    confidence: integer("confidence"),
    answerJson: text("answer_json"),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    userQIdx: index("quiz_attempts_user_q_idx").on(t.userId, t.questionId),
    userNodeIdx: index("quiz_attempts_user_node_idx").on(t.userId, t.nodeId),
  }),
);

// Phase 5 — pet "wants to learn" the user's weak concept; clearing
// the SRS card / re-passing the question completes the quest.
export const petQuests = sqliteTable(
  "pet_quests",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    petId: text("pet_id").notNull().references(() => pets.id),
    conceptSlug: text("concept_slug").notNull(),
    sourceQuizMistakeId: text("source_quiz_mistake_id"),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
    completedAt: text("completed_at"),
  },
  (t) => ({
    userStatusIdx: index("pet_quests_user_status_idx").on(t.userId, t.status),
  }),
);

// Phase 6 — persisted signed Axiomic credential (compositeScore
// signAxiomicScore is currently ephemeral). verify_id is the
// public lookup token.
export const signedCredentials = sqliteTable(
  "signed_credentials",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    kind: text("kind").notNull(),
    payloadJson: text("payload_json").notNull(),
    signature: text("signature").notNull(),
    verifyId: text("verify_id").notNull(),
    issuedAt: text("issued_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    verifyUniq: uniqueIndex("signed_credentials_verify_uniq").on(t.verifyId),
    userIdx: index("signed_credentials_user_idx").on(t.userId, t.issuedAt),
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
  // S85 — year-scale tier discriminator. Existing rows + new skill
  // drills stay 'skill_drill'; year-scale projects opt in to
  // 'long_arc' and must clear the complexity floor (≥3 domains, hour
  // range, deliverable description, ≥1 dated milestone) at create or
  // publish time.
  scaleTier: text("scale_tier").notNull().default("skill_drill"),
  // JSON array of domain tags surfacing complexity. Floor requires
  // ≥3 entries for long_arc.
  domainsJson: text("domains_json").notNull().default("[]"),
  // Hour range for long_arc. Skill drills keep using estimatedWeeks.
  estimatedHoursMin: integer("estimated_hours_min"),
  estimatedHoursMax: integer("estimated_hours_max"),
  // Long_arc only. Tangible end-state — what the learner ships at the
  // end. Floor requires ≥200 chars to force authors past hand-waving.
  realWorldDeliverableMd: text("real_world_deliverable_md"),
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
  // S85 — calendar due date for long_arc capstones. ISO date string.
  // Skill drills leave this null and continue to use estimatedDays
  // as a relative pacing hint.
  dueAt: text("due_at"),
  // S85 — declares an advisor must approve this milestone before the
  // learner advances. Schema-only in S85; gating ships in S86 with the
  // advisor invite/accept flow.
  advisorSignoffRequired: integer("advisor_signoff_required", { mode: "boolean" }).notNull().default(false),
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

// S85 — Advisor / mentor link to a learner's enrollment. Multiple
// rows possible per enrollment (lead advisor + co-advisor + mentor).
// Schema-only in S85; the invite + accept + sign-off-gate UI ships
// in S86 alongside the milestone-advance enforcement.
export const capstoneAdvisorAssignments = sqliteTable("capstone_advisor_assignments", {
  id: text("id").primaryKey(),
  enrollmentId: text("enrollment_id")
    .notNull()
    .references(() => capstoneEnrollments.id, { onDelete: "cascade" }),
  advisorUserId: text("advisor_user_id").notNull().references(() => users.id),
  // 'advisor' | 'co_advisor' | 'mentor'. Free-form for now.
  role: text("role").notNull().default("advisor"),
  invitedAt: text("invited_at").default(sql`(datetime('now'))`).notNull(),
  acceptedAt: text("accepted_at"),
}, (t) => ({
  enrollmentIdx: index("capstone_advisor_enrollment_idx").on(t.enrollmentId),
  advisorIdx: index("capstone_advisor_user_idx").on(t.advisorUserId, t.acceptedAt),
}));

// S85 — Versioned snapshots of a (enrollment, milestone) submission.
// The existing `capstone_submissions` row holds the latest graded
// state (preserving the AI-grading flow); this table captures earlier
// drafts + named milestones (e.g. "mid-year-review", "final"). UI
// for capturing + browsing versions ships in S86.
export const capstoneSubmissionVersions = sqliteTable("capstone_submission_versions", {
  id: text("id").primaryKey(),
  submissionId: text("submission_id")
    .notNull()
    .references(() => capstoneSubmissions.id, { onDelete: "cascade" }),
  versionTag: text("version_tag").notNull(),
  artifactsJson: text("artifacts_json").notNull().default("{}"),
  writeup: text("writeup").notNull().default(""),
  authorNotes: text("author_notes").notNull().default(""),
  capturedAt: text("captured_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  submissionIdx: index("capstone_subver_submission_idx").on(t.submissionId, t.capturedAt),
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
  // Sprint 82 — when set, marks this cohort as a "lab group" the
  // intern dashboard + roster filter on. Reuses the LabDiscipline
  // taxonomy so playbook assignments stay consistent.
  discipline: text("discipline"),
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

// Phase 30B — scheduled live study sessions for a cohort. The
// session row id doubles as the liveBus room id (the
// "roomId = entity id" pattern). Append-only chat reuses the
// Phase 29B reviewRoomMessages model via RoomKind="cohort_study".
export const cohortStudySessions = sqliteTable(
  "cohort_study_sessions",
  {
    id: text("id").primaryKey(),
    cohortId: text("cohort_id")
      .notNull()
      .references(() => cohorts.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    scheduledAt: text("scheduled_at").notNull(),
    roomId: text("room_id").notNull(),
    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    cohortIdx: index("cohort_study_sessions_cohort_idx").on(
      t.cohortId,
      t.scheduledAt,
    ),
  }),
);

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

// Sprint 70 — Researcher for-you feed primitives.
//
// `searches` records every executed query so the recommendation ranker
// can build a recent-query bias term ("show more like the last few
// things this user looked for"). Anonymous traffic is stored with a
// null userId; only the userId-scoped slice is read by the ranker.
//
// `paperSummaries` caches the AI-generated tier-aware paper summary so
// toggling tiers in the drawer doesn't re-burn inference. Keyed by
// (paperKind, paperId, tier, modelId) — modelId in the key means a new
// default model invalidates old summaries automatically.
//
// `feedImpressions` records what the for-you feed has already shown a
// user; the ranker demotes recently-shown items to keep the feed fresh
// across visits.
export const searches = sqliteTable("searches", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  query: text("query").notNull(),
  resultCount: integer("result_count").notNull().default(0),
  // Filled when the user clicks a result; null if they bounced.
  clickedItemKind: text("clicked_item_kind"),
  clickedItemId: text("clicked_item_id"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  userIdx: index("searches_user_idx").on(t.userId, t.createdAt),
}));

export const paperSummaries = sqliteTable("paper_summaries", {
  id: text("id").primaryKey(),
  // 'research' (internal research_papers row) — extends to
  // 'external_paper' once Sprint 69 lands.
  paperKind: text("paper_kind").notNull(),
  paperId: text("paper_id").notNull(),
  // 'intro' | 'undergrad' | 'grad'
  tier: text("tier").notNull(),
  modelId: text("model_id").notNull(),
  summaryMd: text("summary_md").notNull(),
  generatedAt: text("generated_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  pk: uniqueIndex("paper_summaries_pk").on(t.paperKind, t.paperId, t.tier, t.modelId),
}));

export const feedImpressions = sqliteTable("feed_impressions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  paperKind: text("paper_kind").notNull(),
  paperId: text("paper_id").notNull(),
  shownAt: text("shown_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  userIdx: index("feed_impressions_user_idx").on(t.userId, t.shownAt),
  // Used by the ranker to demote-or-skip already-shown items.
  lookupIdx: index("feed_impressions_lookup_idx").on(t.userId, t.paperKind, t.paperId),
}));

// Sprint 69 — External research papers from arXiv, OpenAlex, and
// PubMed. Distinct from `research_papers` which holds papers authored
// inside the platform; this table is a normalized landing zone for
// upstream-source rows we ingest periodically.
//
// `source` + `sourceId` is the natural primary key; `id` is a stable
// UUID we mint on insert so internal references (search index,
// recommendations, comments) survive a re-ingest. `contentHash` is
// computed from title + abstract + author list so a passthrough
// re-fetch (no real change upstream) doesn't bust the search-index
// embedding cache.
// Sprint 73 — Exam mastery framework.
//
// Exams are timed multi-section assessments (SAT, GRE, MCAT, USMLE)
// distinct from the existing mastery_paths surface: they need timed
// runtime, section-aware navigation, raw → scaled scoring with a
// percentile lookup, and shared question banks. A future revision
// can link an exam back to a mastery_path (`pathSlug` column) so
// completing the path's lessons unlocks the diagnostic.
//
// Scoring is stored as a JSON blob on the exam row to keep the
// schema small — each exam has its own scaled-score formula and
// percentile lookup table. The scoring shape:
//   { min, max, mean, sd, percentileTable: [{ raw, scaled, percentile }, ...] }
export const exams = sqliteTable("exams", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  // Short label, e.g. "SAT", "USMLE Step 1".
  shortName: text("short_name").notNull(),
  // Optional link into mastery_paths.slug — lets a study path
  // anchor on the exam (e.g. sat-prep → sat).
  pathSlug: text("path_slug"),
  totalDurationMinutes: integer("total_duration_minutes").notNull(),
  scoringJson: text("scoring_json").notNull().default("{}"),
  description: text("description").notNull().default(""),
  // Sprint 74 — content version. Bumped when the seed file changes;
  // the seed loader compares against the persisted value and
  // rebuilds the exam (cascade-deletes old sections + questions +
  // bumps version) so re-runs pick up new content. In-flight
  // attempts are NOT touched — they reference the questions that
  // existed when the attempt started.
  contentVersion: integer("content_version").notNull().default(1),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

export const examSections = sqliteTable(
  "exam_sections",
  {
    id: text("id").primaryKey(),
    examId: text("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    ordinal: integer("ordinal").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    questionCount: integer("question_count").notNull(),
  },
  (t) => ({
    examOrdUq: uniqueIndex("exam_sections_pk").on(t.examId, t.ordinal),
    examSlugUq: uniqueIndex("exam_sections_slug_uq").on(t.examId, t.slug),
  }),
);

export const examQuestions = sqliteTable(
  "exam_questions",
  {
    id: text("id").primaryKey(),
    sectionId: text("section_id")
      .notNull()
      .references(() => examSections.id, { onDelete: "cascade" }),
    // Sprint 75 — question type discriminator. 'multiple_choice' is
    // the default and matches the SAT runtime; 'essay' is for
    // free-text questions like GRE Analytical Writing tasks (AI
    // grader scores against rubricMd, no optionsJson/correctIndex).
    type: text("type").notNull().default("multiple_choice"),
    // 1..5; the adaptive runner picks against this.
    difficulty: integer("difficulty").notNull().default(3),
    promptMd: text("prompt_md").notNull(),
    // JSON array of {label, text} options. Empty for essay questions.
    optionsJson: text("options_json").notNull(),
    // 0-based index into optionsJson. For essay questions this stays
    // 0 (unused) — never read by the grader on essays.
    correctIndex: integer("correct_index").notNull(),
    explanationMd: text("explanation_md").notNull().default(""),
    // Markdown rubric used by the AI essay grader. Null for
    // multiple-choice questions.
    rubricMd: text("rubric_md"),
    // Maximum score the essay grader can award. Null for MC
    // (which is implicitly 1). GRE Analytical Writing prompts
    // typically use 6.
    maxEssayScore: integer("max_essay_score"),
    topicTagsJson: text("topic_tags_json").notNull().default("[]"),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    sectionIdx: index("exam_questions_section_idx").on(
      t.sectionId,
      t.difficulty,
    ),
    typeIdx: index("exam_questions_type_idx").on(t.sectionId, t.type),
  }),
);

// One row per attempt at an exam. `answersJson` carries the question
// manifest the runner is iterating (the order + ids it picked at
// start-time) so a refresh / cross-device resume doesn't reshuffle.
export const examAttempts = sqliteTable(
  "exam_attempts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    examId: text("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    // 'full_mock' | 'section' | 'adaptive'
    mode: text("mode").notNull(),
    // For 'section' mode — null for full_mock + adaptive.
    sectionSlug: text("section_slug"),
    startedAt: text("started_at").default(sql`(datetime('now'))`).notNull(),
    completedAt: text("completed_at"),
    // Drop-dead time when this attempt auto-submits if the user
    // doesn't finalize. Null for adaptive (untimed).
    expiresAt: text("expires_at"),
    scoreRaw: integer("score_raw"),
    scoreScaled: integer("score_scaled"),
    scorePercentile: integer("score_percentile"),
    // Per-section raw → scaled breakdown when the exam has multiple
    // sections. JSON: { sectionSlug: { raw, scaled, percentile } }.
    sectionScoresJson: text("section_scores_json"),
    // Picked-question manifest at start time:
    //   { sections: [{ slug, questionIds: string[] }] }
    answersJson: text("answers_json").notNull().default("{}"),
  },
  (t) => ({
    userIdx: index("exam_attempts_user_idx").on(t.userId, t.startedAt),
    examIdx: index("exam_attempts_exam_idx").on(t.examId, t.startedAt),
    expiryIdx: index("exam_attempts_expiry_idx").on(t.expiresAt),
  }),
);

export const examAttemptAnswers = sqliteTable(
  "exam_attempt_answers",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => examAttempts.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull(),
    selectedIndex: integer("selected_index"),
    // 0/1 set on submit; null while the attempt is still in-flight
    // OR when the question was skipped (selectedIndex IS NULL).
    isCorrect: integer("is_correct"),
    // Sprint 75 — essay-question fields. Empty/null for MC
    // questions. `essayResponse` is the user's free-text answer
    // (saved on every PUT /answer); `essayScore` is the AI
    // grader's score (0..maxEssayScore on the question);
    // `essayFeedbackMd` is the rubric-aligned feedback the
    // score report renders to the test-taker.
    essayResponse: text("essay_response"),
    essayScore: integer("essay_score"),
    essayFeedbackMd: text("essay_feedback_md"),
    timeSpentMs: integer("time_spent_ms").notNull().default(0),
    // The question grid sidebar's "mark for review" toggle.
    flagged: integer("flagged").notNull().default(0),
    updatedAt: text("updated_at")
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (t) => ({
    attemptQuestionUq: uniqueIndex(
      "exam_attempt_answers_attempt_question_uq",
    ).on(t.attemptId, t.questionId),
  }),
);

// Sprint 72 — Engagement: external-paper author claims + social
// discovery.
//
// `external_paper_authorships` is sparse — only contains rows for
// authorships that have been CLAIMED by an internal user. This
// avoids the cost of denormalizing every external_papers.authorsJson
// entry into a row. Keyed on (externalPaperId, ordinal) so a paper
// with N authors can have at most N rows here, one per claimed
// position. The `userId` column carries the internal claimant.
//
// Verification path: an admin checks the claim_request and either
// approves (insert into external_paper_authorships) or rejects.
// ORCID auto-match is the happy path: when an external_paper has an
// author whose ORCID equals a user's `users.orcid`, a job inserts
// the authorship row directly without going through the request
// queue.
export const externalPaperAuthorships = sqliteTable(
  "external_paper_authorships",
  {
    id: text("id").primaryKey(),
    externalPaperId: text("external_paper_id").notNull(),
    // Position in the externalPapers.authorsJson array (0-based).
    ordinal: integer("ordinal").notNull(),
    userId: text("user_id").notNull().references(() => users.id),
    // 'orcid_auto' | 'admin_verified'
    verifiedVia: text("verified_via").notNull(),
    verifiedAt: text("verified_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    paperOrdinalUq: uniqueIndex(
      "external_paper_authorships_paper_ordinal_uq",
    ).on(t.externalPaperId, t.ordinal),
    userIdx: index("external_paper_authorships_user_idx").on(t.userId),
  }),
);

// Manual author-claim requests — submitted by users who can't
// auto-claim via ORCID (because the upstream record didn't have
// their ORCID, or they don't have one set). Reviewed by admins.
export const authorClaimRequests = sqliteTable(
  "author_claim_requests",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    externalPaperId: text("external_paper_id").notNull(),
    // Position the user is claiming.
    ordinal: integer("ordinal").notNull(),
    // Free-text + URL evidence: ORCID profile URL with the paper
    // listed, institutional bio page, etc.
    evidenceText: text("evidence_text").notNull().default(""),
    evidenceUrl: text("evidence_url"),
    // 'pending' | 'approved' | 'rejected'
    status: text("status").notNull().default("pending"),
    reviewerId: text("reviewer_id").references(() => users.id),
    reviewNote: text("review_note"),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
    decidedAt: text("decided_at"),
  },
  (t) => ({
    statusIdx: index("author_claim_requests_status_idx").on(t.status, t.createdAt),
    userIdx: index("author_claim_requests_user_idx").on(t.userId),
    paperIdx: index("author_claim_requests_paper_idx").on(t.externalPaperId),
  }),
);

// BlueSky / social-source post cache. Each row is a post we've
// seen from one of the platform's claimed-author handles that
// references at least one paper. The DOI / arXiv ID is extracted
// from the post text and surfaced on the linked paper's detail
// page + the author's profile.
export const socialPosts = sqliteTable(
  "social_posts",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(), // 'bluesky'
    sourceId: text("source_id").notNull(),
    // The handle/identifier of the upstream author (e.g.
    // 'user.bsky.social'). Maps to users.blueskyHandle when an
    // internal user owns it.
    authorRef: text("author_ref").notNull(),
    // Internal user id when the social handle is claimed in
    // `users.blueskyHandle`; null otherwise.
    userId: text("user_id").references(() => users.id),
    text: text("text").notNull(),
    url: text("url").notNull(),
    postedAt: text("posted_at"),
    // 'arxiv' | 'doi' | 'openalex' (mirrors externalPapers.source).
    referencedSource: text("referenced_source"),
    referencedSourceId: text("referenced_source_id"),
    // Resolved foreign key when we found the referenced paper in our
    // local externalPapers store.
    referencedPaperId: text("referenced_paper_id"),
    fetchedAt: text("fetched_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    sourceUq: uniqueIndex("social_posts_source_uq").on(t.source, t.sourceId),
    authorIdx: index("social_posts_author_idx").on(t.authorRef, t.postedAt),
    paperIdx: index("social_posts_paper_idx").on(t.referencedPaperId, t.postedAt),
    userIdx: index("social_posts_user_idx").on(t.userId, t.postedAt),
  }),
);

// Sprint 71 — Funding feed.
//
// Aggregated grant opportunities pulled from NIH RePORTER, NSF Award
// Search, and grants.gov (CDC funding flows through grants.gov so
// there's no separate CDC table — the source column carries the
// agency). Embedding-based matching ranks each grant against the
// user's publication interest vector for the personalized "for you"
// rail and the deadline-soon notification trigger.
export const grants = sqliteTable("grants", {
  id: text("id").primaryKey(),
  // 'nih' | 'nsf' | 'grants_gov' (covers CDC + many others)
  source: text("source").notNull(),
  // Stable upstream identifier (NIH project number, NSF award ID,
  // grants.gov OPPORTUNITY_NUMBER).
  sourceId: text("source_id").notNull(),
  // For grants.gov entries this carries the originating sub-agency
  // (CDC, HHS, NSF, ED, ...). Surfaced as a filter chip.
  agency: text("agency").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  // Longer body — used for embedding + the detail-page render.
  fullDescription: text("full_description").notNull().default(""),
  // Mechanism / activity code — R01, K99, NSF-CAREER, OPPORTUNITY,
  // etc. Free-text because the upstream sources don't share a
  // taxonomy.
  mechanism: text("mechanism"),
  // Award ceiling in USD. Null when upstream doesn't publish one.
  amountCeiling: integer("amount_ceiling"),
  postedAt: text("posted_at"),
  deadlineAt: text("deadline_at"),
  url: text("url").notNull(),
  topicsJson: text("topics_json").notNull().default("[]"),
  rawJson: text("raw_json").notNull().default("{}"),
  fetchedAt: text("fetched_at").default(sql`(datetime('now'))`).notNull(),
  contentHash: text("content_hash").notNull(),
}, (t) => ({
  sourceUq: uniqueIndex("grants_source_uq").on(t.source, t.sourceId),
  // Indexed for the "deadlines this month" filter + the
  // notify-on-deadline cron.
  deadlineIdx: index("grants_deadline_idx").on(t.deadlineAt),
  agencyIdx: index("grants_agency_idx").on(t.agency, t.deadlineAt),
}));

// Save-for-later. Mirrors news_bookmarks shape so the existing
// list/toggle UI patterns port cleanly.
export const grantBookmarks = sqliteTable(
  "grant_bookmarks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    grantId: text("grant_id").notNull().references(() => grants.id, { onDelete: "cascade" }),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    uniqIdx: uniqueIndex("grant_bookmarks_uniq_idx").on(t.userId, t.grantId),
    userIdx: index("grant_bookmarks_user_idx").on(t.userId, t.createdAt),
  }),
);

// Tracks which (user, grant, deadline-window) notification we've
// already sent so the deadline cron doesn't spam the same user
// every day. The `windowDays` column is one of 14 / 7 / 3 — when a
// grant rolls into the next-tighter window, a new row is allowed.
export const grantNotificationsSent = sqliteTable(
  "grant_notifications_sent",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    grantId: text("grant_id").notNull().references(() => grants.id, { onDelete: "cascade" }),
    // 'match' | 'deadline_soon'
    kind: text("kind").notNull(),
    // Only meaningful for 'deadline_soon': 14 / 7 / 3.
    windowDays: integer("window_days"),
    sentAt: text("sent_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    uniqIdx: uniqueIndex("grant_notifications_sent_uniq_idx").on(
      t.userId,
      t.grantId,
      t.kind,
      t.windowDays,
    ),
  }),
);

export const externalPapers = sqliteTable("external_papers", {
  id: text("id").primaryKey(),
  source: text("source").notNull(), // 'arxiv' | 'openalex' | 'pubmed'
  sourceId: text("source_id").notNull(),
  doi: text("doi"),
  title: text("title").notNull(),
  abstract: text("abstract").notNull().default(""),
  // JSON array of {name, orcid?, openAlexAuthorId?} entries. Not yet
  // linked to internal users; S72 author-claims add that bridge.
  authorsJson: text("authors_json").notNull().default("[]"),
  venue: text("venue"),
  publishedAt: text("published_at"),
  pdfUrl: text("pdf_url"),
  htmlUrl: text("html_url"),
  // OpenAlex concept tags / arXiv categories / PubMed MeSH terms.
  // JSON array of strings.
  topicsJson: text("topics_json").notNull().default("[]"),
  citationCount: integer("citation_count").notNull().default(0),
  // Full upstream-source JSON for forensics + future fields.
  rawJson: text("raw_json").notNull().default("{}"),
  fetchedAt: text("fetched_at").default(sql`(datetime('now'))`).notNull(),
  contentHash: text("content_hash").notNull(),
}, (t) => ({
  sourceUq: uniqueIndex("external_papers_source_uq").on(t.source, t.sourceId),
  doiIdx: index("external_papers_doi_idx").on(t.doi),
  pubIdx: index("external_papers_published_idx").on(t.publishedAt),
}));

// Sprint 69 — Distributed lease for the in-process job runner. One
// row per registered job; whichever process holds a non-expired
// lease runs it. Other processes that find an expired lease can
// take over via an UPDATE… WHERE expiresAt < now().
export const jobLeases = sqliteTable("job_leases", {
  jobName: text("job_name").primaryKey(),
  // Unique identifier for the leasing process (random UUID minted at
  // boot). Lets a process verify it still owns the lease before
  // running.
  leaseHolder: text("lease_holder").notNull(),
  leaseExpiresAt: text("lease_expires_at").notNull(),
  // Telemetry — last successful run timestamp + status string. Read
  // by the admin /admin/jobs panel.
  lastRunAt: text("last_run_at"),
  lastStatus: text("last_status"),
  lastErrorMessage: text("last_error_message"),
  lastDurationMs: integer("last_duration_ms"),
});

// Sprint 69 — Per-run history (last ~50 rows per job) so the admin
// panel can show a "last 5 runs" trail without spamming logs. Cron
// jobs that ingest a lot of items also write `itemsProcessed` so the
// panel surfaces "ingested 230 papers in last run".
export const jobRuns = sqliteTable("job_runs", {
  id: text("id").primaryKey(),
  jobName: text("job_name").notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  status: text("status").notNull(), // 'running' | 'success' | 'error'
  errorMessage: text("error_message"),
  itemsProcessed: integer("items_processed").notNull().default(0),
  durationMs: integer("duration_ms"),
}, (t) => ({
  byJobIdx: index("job_runs_by_job_idx").on(t.jobName, t.startedAt),
}));

// Sprint 79 — Lab protocols + equipment library. The hands-on layer:
// PIs author + version protocols and equipment manuals, interns
// browse and read them. Sign-offs (S80) and bookings (S81) layer on
// top of these tables; this sprint is read-only library content.

export const protocols = sqliteTable("protocols", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  // Validated at the route layer against a fixed taxonomy: 'biology'
  // | 'chemistry' | 'mechanical' | 'electrical' | 'materials' |
  // 'cs-lab' | 'physics'.
  discipline: text("discipline").notNull(),
  category: text("category"),
  summary: text("summary").notNull().default(""),
  contentIntro: text("content_intro").notNull().default(""),
  contentUndergrad: text("content_undergrad").notNull().default(""),
  contentGrad: text("content_grad").notNull().default(""),
  // Biological safety level 1-4. Null for non-bio protocols.
  biosafetyLevel: integer("biosafety_level"),
  hazardsMd: text("hazards_md").notNull().default(""),
  // JSON array of equipment slugs referenced from this protocol.
  equipmentRequiredJson: text("equipment_required_json").notNull().default("[]"),
  // JSON array of {name, amount, unit, hazardClass?} reagent entries.
  reagentsJson: text("reagents_json").notNull().default("[]"),
  estimatedMinutes: integer("estimated_minutes"),
  // safety_certs.slug list — read by S80 to gate a protocol_run start
  // on non-expired certs. Persisted here in S79 so authoring captures
  // the requirement up front.
  requiredCertsJson: text("required_certs_json").notNull().default("[]"),
  version: integer("version").notNull().default(1),
  // 'draft' | 'published'.
  status: text("status").notNull().default("draft"),
  authorId: text("author_id").notNull().references(() => users.id),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  disciplineIdx: index("protocols_discipline_idx").on(t.discipline, t.status),
  authorIdx: index("protocols_author_idx").on(t.authorId, t.createdAt),
}));

export const protocolSteps = sqliteTable("protocol_steps", {
  id: text("id").primaryKey(),
  protocolId: text("protocol_id").notNull()
    .references(() => protocols.id, { onDelete: "cascade" }),
  ordinal: integer("ordinal").notNull(),
  title: text("title").notNull(),
  instructionMd: text("instruction_md").notNull(),
  safetyNotesMd: text("safety_notes_md").notNull().default(""),
  verificationMd: text("verification_md").notNull().default(""),
  // Optional inline quiz to gate step completion. Reuses
  // masteryNodes.quizData JSON shape so the existing renderer +
  // grader work unchanged.
  inlineQuizJson: text("inline_quiz_json"),
  attachmentRefsJson: text("attachment_refs_json").notNull().default("[]"),
}, (t) => ({
  protocolOrdUq: uniqueIndex("protocol_steps_pk").on(t.protocolId, t.ordinal),
}));

// Mirrors researchPaperVersions: snapshot the protocol every time
// it's published / republished so the run table (S80) can pin to a
// specific version that was followed.
export const protocolVersions = sqliteTable("protocol_versions", {
  id: text("id").primaryKey(),
  protocolId: text("protocol_id").notNull()
    .references(() => protocols.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  // Snapshot of title + bodies + steps JSON for pin-to-version.
  snapshotJson: text("snapshot_json").notNull(),
  editedBy: text("edited_by").references(() => users.id),
  editMessage: text("edit_message"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  protocolVersionUq: uniqueIndex("protocol_versions_uq").on(t.protocolId, t.version),
}));

export const equipment = sqliteTable("equipment", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  discipline: text("discipline").notNull(),
  manufacturer: text("manufacturer"),
  model: text("model"),
  manualMd: text("manual_md").notNull().default(""),
  locationHint: text("location_hint"),
  // safety_certs.slug required to operate. Null = no formal training
  // beyond a read of the manual.
  trainingCertSlug: text("training_cert_slug"),
  hazardsMd: text("hazards_md").notNull().default(""),
  attachmentRefsJson: text("attachment_refs_json").notNull().default("[]"),
  // 'open' | 'reserve' | 'supervised-only'. Read by S81 booking; in
  // S79 this is a metadata field surfaced in the manual UI.
  bookingPolicy: text("booking_policy").notNull().default("open"),
  status: text("status").notNull().default("active"),
  authorId: text("author_id").notNull().references(() => users.id),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  disciplineIdx: index("equipment_discipline_idx").on(t.discipline, t.status),
}));

// Per-equipment "common operations" — calibration, daily checks,
// common-fault recipes, post-use checklists. Same ordered-step shape
// as protocolSteps so renderers can be shared.
export const equipmentOperations = sqliteTable("equipment_operations", {
  id: text("id").primaryKey(),
  equipmentId: text("equipment_id").notNull()
    .references(() => equipment.id, { onDelete: "cascade" }),
  ordinal: integer("ordinal").notNull(),
  title: text("title").notNull(),
  bodyMd: text("body_md").notNull(),
  // 'calibration' | 'daily-check' | 'common-fault' | 'post-use'.
  kind: text("kind").notNull(),
}, (t) => ({
  equipOrdUq: uniqueIndex("equipment_operations_pk").on(t.equipmentId, t.ordinal),
}));

// Sprint 80 — Safety certifications + protocol-run sign-offs. The
// operational unlock: an intern can't start a run for BSL-2 work until
// they've passed BSL-2 + non-expired. Sign-off chain: intern marks all
// steps done, requests sign-off, mentor/PI in their cohort approves.

export const safetyCertifications = sqliteTable("safety_certifications", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  discipline: text("discipline").notNull(),
  description: text("description"),
  // Reuses masteryNodes.quizData JSON shape exactly so the existing
  // quiz renderer + grader work unchanged. {questions: Question[]}.
  quizDataJson: text("quiz_data_json").notNull(),
  passingScore: real("passing_score").notNull().default(0.7),
  // Days until expiration. Null = never expires (e.g., general chem
  // hygiene). 730 for BSL-2 (typical 2y refresher).
  validityDays: integer("validity_days"),
  authorId: text("author_id").notNull().references(() => users.id),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

export const userSafetyCertifications = sqliteTable(
  "user_safety_certifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    certSlug: text("cert_slug").notNull(),
    passedAt: text("passed_at").notNull(),
    expiresAt: text("expires_at"),
    score: real("score"),
  },
  (t) => ({
    userCertIdx: index("user_certs_idx").on(
      t.userId,
      t.certSlug,
      t.expiresAt,
    ),
  }),
);

export const protocolRuns = sqliteTable(
  "protocol_runs",
  {
    id: text("id").primaryKey(),
    protocolId: text("protocol_id").notNull()
      .references(() => protocols.id, { onDelete: "cascade" }),
    // Pinned version: an intern's run-state persists even if the
    // protocol is later edited. Snapshot resolved via protocolVersions.
    protocolVersion: integer("protocol_version").notNull(),
    userId: text("user_id").notNull().references(() => users.id),
    // 'in_progress' | 'awaiting_signoff' | 'signed_off' | 'rejected'.
    status: text("status").notNull().default("in_progress"),
    startedAt: text("started_at").default(sql`(datetime('now'))`).notNull(),
    completedAt: text("completed_at"),
    signedOffAt: text("signed_off_at"),
    signedOffById: text("signed_off_by_id").references(() => users.id),
    // { ordinal: { done, doneAt, observation, attachmentRefs[] } }.
    stepStateJson: text("step_state_json").notNull().default("{}"),
    notesMd: text("notes_md").notNull().default(""),
    signOffNotesMd: text("sign_off_notes_md"),
  },
  (t) => ({
    userIdx: index("protocol_runs_user_idx").on(t.userId, t.startedAt),
    protocolIdx: index("protocol_runs_protocol_idx").on(
      t.protocolId,
      t.status,
    ),
    signoffIdx: index("protocol_runs_signoff_idx").on(t.status, t.startedAt),
  }),
);

// Sprint 82 — PI-issued lab assignments. Distinct from mastery-path
// completion: a PI can pin a single protocol or cert to one or more
// interns even when no full path applies (e.g. "everyone redo the
// gel-electrophoresis run after that contamination scare"). Exactly
// one of {masteryPathSlug, protocolSlug, certSlug} is set per row.

export const labAssignments = sqliteTable(
  "lab_assignments",
  {
    id: text("id").primaryKey(),
    cohortId: text("cohort_id").notNull()
      .references(() => cohorts.id, { onDelete: "cascade" }),
    assignedToUserId: text("assigned_to_user_id").notNull()
      .references(() => users.id),
    assignedById: text("assigned_by_id").notNull().references(() => users.id),
    masteryPathSlug: text("mastery_path_slug"),
    protocolSlug: text("protocol_slug"),
    certSlug: text("cert_slug"),
    dueAt: text("due_at"),
    // 'pending' | 'in_progress' | 'completed' | 'overdue'.
    status: text("status").notNull().default("pending"),
    notesMd: text("notes_md"),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    cohortUserIdx: index("lab_assign_cohort_user_idx").on(
      t.cohortId,
      t.assignedToUserId,
    ),
    userStatusIdx: index("lab_assign_user_status_idx").on(
      t.assignedToUserId,
      t.status,
    ),
  }),
);

// =============================================================
// S86 — Classroom engagement (classes, XP, pets, cosmetics)
// =============================================================
//
// A college-style class: instructor + enrolled students + scheduled
// term + roster + tasks. Distinct from cohorts (which serve lab
// groups + general grouping). joinCode lets students self-enroll
// without a manual invite flow.
export const classes = sqliteTable("classes", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  // 'Fall 2026', 'Spring 2027', etc. Free-form short label.
  term: text("term").notNull().default(""),
  description: text("description").notNull().default(""),
  syllabusMd: text("syllabus_md").notNull().default(""),
  // S99 — instructor-authored welcome message. Rendered as markdown
  // in a banner on the class page so new students get a friendly
  // pointer on day one.
  welcomeMessageMd: text("welcome_message_md").notNull().default(""),
  // S102 — public discovery. When true, the class shows up on the
  // /classes/discover directory so students can find it without a
  // share link or join code dictation. Default false: instructors
  // explicitly opt in.
  discoverable: integer("discoverable", { mode: "boolean" }).notNull().default(false),
  // S106 — optional link to a cohort. When set, capstone-track
  // completions by members of that cohort grant class XP (via the
  // grantXp source 'cohort-capstone-completed'). Set by the
  // instructor on edit; route validates that the caller owns both
  // the class and the cohort. No FK so the schema-load order stays
  // simple; correctness lives at the route layer.
  linkedCohortId: text("linked_cohort_id"),
  // Short alphanumeric code students enter to self-enroll. Generated
  // server-side; rotatable by the instructor.
  joinCode: text("join_code").notNull(),
  // 'active' | 'archived'. Archived classes stay readable but stop
  // accepting new enrollments + new tasks.
  status: text("status").notNull().default("active"),
  instructorId: text("instructor_id").notNull().references(() => users.id),
  // Phase 21 — class difficulty calibration. 'intro' | 'undergrad' |
  // 'grad' | null. Feeds the AI variant generator so a transformer
  // class for ML PhDs gets very different prompts from one for first-
  // year CS students.
  level: text("level"),
  // Phase 21 — JSON array of wiki/concept slugs the class covers.
  // The weakness aggregator filters signal sources to this scope so
  // an ML class doesn't pull in a student's organic chemistry
  // mistakes. Empty array (default) = use all signals.
  topicSlugsJson: text("topic_slugs_json").notNull().default("[]"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  instructorIdx: index("classes_instructor_idx").on(t.instructorId, t.createdAt),
  joinCodeIdx: uniqueIndex("classes_join_code_idx").on(t.joinCode),
}));

// One row per (class, user). role='student'|'ta'|'observer'.
// Instructor is implicit via classes.instructorId; they don't need
// a row here. TA gets some instructor permissions (record
// attendance, grant cosmetics) but cannot edit the class itself.
export const classEnrollments = sqliteTable("class_enrollments", {
  id: text("id").primaryKey(),
  classId: text("class_id").notNull()
    .references(() => classes.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id),
  role: text("role").notNull().default("student"),
  joinedAt: text("joined_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  pk: uniqueIndex("class_enrollments_pk").on(t.classId, t.userId),
  userIdx: index("class_enrollments_user_idx").on(t.userId, t.joinedAt),
}));

// Reading or homework. kind='reading' uses url + dueAt (student
// just ticks "done"). kind='homework' uses dueAt + accepts a
// writeup/url submission via class_task_completions.xpReward is
// the XP awarded on completion; falls back to a kind-based default
// (see XP_AMOUNTS in apps/server/src/lib/xp.ts) if null.
export const classTasks = sqliteTable("class_tasks", {
  id: text("id").primaryKey(),
  classId: text("class_id").notNull()
    .references(() => classes.id, { onDelete: "cascade" }),
  // 'reading' | 'homework'.
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  descriptionMd: text("description_md").notNull().default(""),
  // Reading: where the reading lives (URL, wiki slug, paper slug).
  // Homework: ignored.
  url: text("url"),
  dueAt: text("due_at"),
  xpReward: integer("xp_reward"),
  // Phase 23C — optional grouping label for the Classwork tab
  // ("Week 1: Linear Algebra"). Free-form so instructors can
  // organize however the class needs. Null = "(no topic)" bucket.
  topic: text("topic"),
  createdById: text("created_by_id").notNull().references(() => users.id),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  classKindIdx: index("class_tasks_class_kind_idx").on(t.classId, t.kind, t.dueAt),
}));

// Reading-done click OR homework submission. Same row shape;
// readings have null content, homework has the writeup/url.
// Unique per (task, user) — re-submission updates in place.
export const classTaskCompletions = sqliteTable("class_task_completions", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull()
    .references(() => classTasks.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id),
  // Free-form for homework (markdown writeup, github URL, etc.).
  // Null for readings.
  content: text("content"),
  // Late-flag computed at completion time vs task.dueAt.
  wasLate: integer("was_late", { mode: "boolean" }).notNull().default(false),
  // Grade JSON: {score, feedback, perCriterion?, aiGenerated?}.
  // Null until graded. Phase 21 added the auto-grader path for
  // submissions of personalized variants; manual instructor grades
  // still win on conflict.
  gradeJson: text("grade_json"),
  submittedAt: text("submitted_at").default(sql`(datetime('now'))`).notNull(),
  gradedAt: text("graded_at"),
}, (t) => ({
  pk: uniqueIndex("class_task_completions_pk").on(t.taskId, t.userId),
  userIdx: index("class_task_completions_user_idx").on(t.userId, t.submittedAt),
}));

// Phase 21 — per-student personalized variant of a class task.
// An instructor authors a base classTask; the AI generator produces
// one variant per enrolled student, tuned to their weakness profile
// and the class's level. Variants share the base task's learning
// objective but emphasize concepts the student is weak on. The
// existing classTaskCompletions row (keyed on taskId + userId) still
// holds the student's submission; the variant only carries the
// generated prompt + rubric.
export const classTaskVariants = sqliteTable("class_task_variants", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull()
    .references(() => classTasks.id, { onDelete: "cascade" }),
  studentId: text("student_id").notNull().references(() => users.id),
  // The personalized prompt markdown shown to the student in place
  // of the base task's descriptionMd.
  promptMd: text("prompt_md").notNull(),
  // Structured rubric the auto-grader reads. JSON:
  // { criteria: [{ id, description, weight? }], passingScore }.
  rubricJson: text("rubric_json").notNull(),
  // Compact snapshot of the weakness signals that informed
  // generation, so we can re-rank or audit later without re-querying.
  weaknessSnapshotJson: text("weakness_snapshot_json").notNull(),
  // Deterministic seed (hash of taskId + studentId + signal digest)
  // so mock-provider tests stay reproducible.
  generationSeed: text("generation_seed").notNull(),
  // Free-form "why we wrote it this way" string returned by the
  // generator; surfaced to the instructor in the variant preview.
  rationale: text("rationale").notNull().default(""),
  generatedAt: text("generated_at").default(sql`(datetime('now'))`).notNull(),
  // The instructor who triggered the generation. Null for lazy
  // first-view generation (new enrollee joining after the initial
  // bulk run).
  generatedById: text("generated_by_id").references(() => users.id),
}, (t) => ({
  pk: uniqueIndex("class_task_variants_pk").on(t.taskId, t.studentId),
  studentIdx: index("class_task_variants_student_idx").on(t.studentId, t.generatedAt),
}));

// Phase 24A — per-task discussion thread. Flat (no parentId) so the
// UI stays simple; matches the GC pattern where assignment comments
// are a flat list. Any enrollee can post; author can edit own; author
// or instructor can delete (moderation escape hatch).
export const classTaskDiscussions = sqliteTable("class_task_discussions", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull()
    .references(() => classTasks.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id),
  bodyMd: text("body_md").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  taskIdx: index("class_task_discussions_task_idx").on(t.taskId, t.createdAt),
}));

// Phase 24B — non-graded class materials. Distinct from classTasks
// so no submission / XP / variant affordances surface in the UI.
// Instructor authors; any enrollee reads. sortOrder is set by
// instructor's up/down controls (no drag library in v1).
export const classMaterials = sqliteTable("class_materials", {
  id: text("id").primaryKey(),
  classId: text("class_id").notNull()
    .references(() => classes.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  descriptionMd: text("description_md").notNull().default(""),
  url: text("url"),
  // 'note' | 'link' | 'file'. 'file' is a placeholder for future
  // upload integration — for now it renders the same as 'link'.
  kind: text("kind").notNull().default("note"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdById: text("created_by_id").notNull().references(() => users.id),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  classIdx: index("class_materials_class_idx").on(t.classId, t.sortOrder, t.createdAt),
}));

// One row per (class, user, sessionDate). Instructor or TA records.
// status='present'|'absent'|'late'|'excused'. Present + late grant
// XP; absent + excused grant none. sessionDate is YYYY-MM-DD.
export const classAttendance = sqliteTable("class_attendance", {
  id: text("id").primaryKey(),
  classId: text("class_id").notNull()
    .references(() => classes.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id),
  sessionDate: text("session_date").notNull(),
  status: text("status").notNull(),
  recordedById: text("recorded_by_id").notNull().references(() => users.id),
  recordedAt: text("recorded_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  pk: uniqueIndex("class_attendance_pk").on(t.classId, t.userId, t.sessionDate),
  classDateIdx: index("class_attendance_class_date_idx").on(t.classId, t.sessionDate),
}));

// Phase 23A — class stream / announcements. Persistent
// instructor-authored posts that show in chronological feed at
// the top of the class page. Anyone enrolled reads; instructor
// + TAs post / edit / delete. Pinned items sort first.
//
// Replaces the prior pattern of stuffing announcements into
// classes.welcomeMessageMd (single string, no history).
export const classAnnouncements = sqliteTable("class_announcements", {
  id: text("id").primaryKey(),
  classId: text("class_id").notNull()
    .references(() => classes.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => users.id),
  bodyMd: text("body_md").notNull(),
  // Boolean stored as 0/1 (matches the rest of this schema).
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  // Stream feed reads: pinned-first, then newest. The composite
  // index covers the typical sort.
  feedIdx: index("class_announcements_feed_idx").on(
    t.classId,
    t.pinned,
    t.createdAt,
  ),
}));

// XP ledger. Append-only; the leaderboard query sums this per user
// per class. classId is null for non-class XP (e.g.
// lesson_completed from outside any class context — those grants
// still count toward the user's global XP but not to any class
// leaderboard).
//
// source identifies WHY the grant fired: 'reading-done',
// 'homework-submitted', 'attendance-present', 'lesson-completed',
// 'quiz-passed', etc. sourceRefId points back to the triggering
// row (taskId, attendance row id, mastery node id).
//
// Idempotency: (userId, source, sourceRefId) is unique so re-emits
// never double-count.
export const xpGrants = sqliteTable("xp_grants", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  classId: text("class_id").references(() => classes.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  sourceRefId: text("source_ref_id").notNull(),
  amount: integer("amount").notNull(),
  awardedAt: text("awarded_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  uniq: uniqueIndex("xp_grants_uniq").on(t.userId, t.source, t.sourceRefId),
  userClassIdx: index("xp_grants_user_class_idx").on(t.userId, t.classId, t.awardedAt),
  classIdx: index("xp_grants_class_idx").on(t.classId, t.awardedAt),
}));

// One pet per user (S86; multi-pet later). species is a slug from
// the hardcoded catalog in apps/server/src/lib/pets.ts. name is
// the user's chosen nickname. Auto-created when the user crosses
// the first XP threshold; cannot be deleted in S86.
export const pets = sqliteTable("pets", {
  id: text("id").primaryKey(),
  // S104 — dropped .unique() so users can own multiple pets. The
  // user's chosen active pet is tracked via users.activePetId.
  userId: text("user_id").notNull().references(() => users.id),
  species: text("species").notNull(),
  name: text("name").notNull().default(""),
  hatchedAt: text("hatched_at").default(sql`(datetime('now'))`).notNull(),
  // S90 — pet evolution. Level is 1, 2, or 3 in v1. Recomputed on
  // every grantXp via maybeLevelUp() against the user's lifetime
  // XP. Stored on the pet (rather than derived on read) so we can
  // detect a level-up exactly once and emit a notification when it
  // happens.
  level: integer("level").notNull().default(1),
  // Phase L — pet skin slug. Resolved at read-time against pet_skins
  // catalog. 'default' is the always-owned baseline so the column is
  // never nullable; users get the visual baseline even before they've
  // touched the skin picker.
  activeSkinSlug: text("active_skin_slug").notNull().default("default"),
}, (t) => ({
  speciesIdx: index("pets_species_idx").on(t.species),
  // S104 — replaces the prior UNIQUE on userId. Non-unique now;
  // we still want the index for "all pets for this user" reads.
  userIdx: index("pets_user_idx").on(t.userId),
}));

// Cosmetic catalog. slot='head'|'eyes'|'accessory' constrains
// where it renders so a hat doesn't conflict with a cap on the
// same pet. renderKind='emoji' for S86; 'svg' is the planned
// future value. emoji is the unicode glyph for emoji-rendered
// cosmetics. rarity is a UI label; doesn't enforce anything
// mechanically. grantOnly=true means students can't earn it via
// XP threshold — only an instructor can grant it.
export const petCosmetics = sqliteTable("pet_cosmetics", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  slot: text("slot").notNull(),
  renderKind: text("render_kind").notNull().default("emoji"),
  emoji: text("emoji"),
  // 'common' | 'rare' | 'epic' | 'legendary'. UI flair only.
  rarity: text("rarity").notNull().default("common"),
  grantOnly: integer("grant_only", { mode: "boolean" }).notNull().default(true),
  description: text("description").notNull().default(""),
  // S89 — XP shop. NULL means the cosmetic is not for sale (still
  // available via instructor grant or competition prize).
  // Non-null = students can spend XP to buy it.
  xpCost: integer("xp_cost"),
  // Phase M — when true, this cosmetic doesn't render well below 36px
  // and the PetAvatar hides it for tiny avatars (24-36px bylines /
  // class roster). False (default) cosmetics render at all sizes ≥24px.
  failSmall: integer("fail_small", { mode: "boolean" }).notNull().default(false),
});

// What each user owns + which pieces are equipped on their pet.
// equipped=true means it's currently rendered on the pet; only
// one equipped item per slot enforced at the route layer.
// grantedById non-null means an instructor granted it; null means
// the user earned it (not used in S86 since all S86 cosmetics are
// grant-only). grantedNote is the instructor's optional message.
export const petInventory = sqliteTable("pet_inventory", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  cosmeticSlug: text("cosmetic_slug").notNull(),
  equipped: integer("equipped", { mode: "boolean" }).notNull().default(false),
  acquiredAt: text("acquired_at").default(sql`(datetime('now'))`).notNull(),
  grantedById: text("granted_by_id").references(() => users.id),
  grantedInClassId: text("granted_in_class_id").references(() => classes.id),
  grantedNote: text("granted_note"),
}, (t) => ({
  uniq: uniqueIndex("pet_inventory_uniq").on(t.userId, t.cosmeticSlug),
  userIdx: index("pet_inventory_user_idx").on(t.userId, t.equipped),
}));

// Phase L — Skin catalog. A skin is a full-pet visual treatment
// (gradient/glow/particles/filter) layered behind + around the pet
// emoji or future SVG silhouette. Unlike cosmetics, only one skin
// is equipped per pet (tracked on pets.activeSkinSlug). The FX
// fields are flat columns rather than JSON so we can query/type
// them directly; nullable for skins that don't use that effect.
export const petSkins = sqliteTable("pet_skins", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  // 'common' | 'rare' | 'epic' | 'legendary'. UI flair only.
  rarity: text("rarity").notNull().default("common"),
  // 'xp' | 'grant' | 'comp' | 'default'. Mirrors petCosmetics.
  // 'default' = always owned, can't be granted (the baseline skin).
  obtain: text("obtain").notNull().default("xp"),
  // NULL = not for sale (granted/competition-only); positive int =
  // purchasable via XP shop.
  xpCost: integer("xp_cost"),
  description: text("description").notNull().default(""),
  // FX layer — see Phase L plan for the source-of-truth shape. All
  // nullable so a skin can opt into any subset of effects.
  fxFilter: text("fx_filter"),
  fxOpacity: real("fx_opacity").notNull().default(1.0),
  fxGlowColor: text("fx_glow_color"),
  fxGlowBlur: real("fx_glow_blur"),
  fxGlowAlpha: real("fx_glow_alpha"),
  fxBg: text("fx_bg"),
  // 'stars' | 'embers' | 'petals' | 'snow' | null.
  fxParticles: text("fx_particles"),
  fxRing: text("fx_ring"),
  // 'aurora' | 'crystal' | null.
  fxAnimated: text("fx_animated"),
});

// Phase L — Per-user ownership of skins. Mirrors petInventory shape
// (acquiredAt + grantedById + grantedInClassId + grantedNote) so
// the grant pipelines look identical. No 'equipped' flag here —
// equipped state lives on pets.activeSkinSlug because skins are
// per-pet, not per-user.
export const petSkinInventory = sqliteTable("pet_skin_inventory", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  skinSlug: text("skin_slug").notNull(),
  acquiredAt: text("acquired_at").default(sql`(datetime('now'))`).notNull(),
  grantedById: text("granted_by_id").references(() => users.id),
  grantedInClassId: text("granted_in_class_id").references(() => classes.id),
  grantedNote: text("granted_note"),
}, (t) => ({
  uniq: uniqueIndex("pet_skin_inventory_uniq").on(t.userId, t.skinSlug),
  userIdx: index("pet_skin_inventory_user_idx").on(t.userId),
}));

// =============================================================
// S87 — Class competitions.
// =============================================================
//
// Timed event scoped to a class. Instructor (or TA) creates a draft,
// publishes it (status='active'), and at endsAt the system runs a
// lazy distribution: top-N students by `scoringRule` win a copy of
// `prizeCosmeticSlug` in their inventory. Distribution is idempotent
// via the existing pet_inventory unique-on-(userId,cosmeticSlug)
// index, so the lazy pass is safe to call multiple times.
//
// Re-uses pet_cosmetics.slug as the prize ref but no FK — letting
// authors name a cosmetic before it's seeded is occasionally useful
// (and the route validates existence at create/publish time).
export const classCompetitions = sqliteTable("class_competitions", {
  id: text("id").primaryKey(),
  classId: text("class_id").notNull()
    .references(() => classes.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  descriptionMd: text("description_md").notNull().default(""),
  // ISO datetime strings so the UI can render countdowns + the
  // prize-distribution check is a simple string compare.
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  // 'class-xp' for v1. Schema accepts other rules so adding them
  // (reading-completions, homework-passes, attendance-streak) later
  // doesn't need a migration.
  scoringRule: text("scoring_rule").notNull().default("class-xp"),
  prizeCosmeticSlug: text("prize_cosmetic_slug").notNull(),
  prizeWinnerCount: integer("prize_winner_count").notNull().default(3),
  // 'draft' | 'active' | 'ended'. Transitions: draft -> active on
  // publish; active -> ended lazily on read past endsAt OR via
  // explicit POST /end. Ended is terminal in S87.
  status: text("status").notNull().default("draft"),
  // Flips true once auto-distribution runs. The unique-index on
  // pet_inventory means re-runs are safe at the data layer too,
  // but this short-circuits the standings computation after first
  // pass.
  prizesAwarded: integer("prizes_awarded", { mode: "boolean" })
    .notNull().default(false),
  createdById: text("created_by_id").notNull().references(() => users.id),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  classStatusIdx: index("class_competitions_class_idx").on(t.classId, t.status, t.endsAt),
}));

// =============================================================
// S89 — XP shop ledger.
// =============================================================
//
// Two-sided XP economy. xp_grants is the credits side (grants in,
// always positive); xp_purchases is the debits side (XP spent on
// shop cosmetics). Spendable balance is
//   xpBalance(user) = sum(xp_grants.amount) - sum(xp_purchases.amount)
//
// We deliberately keep purchases in a separate table rather than
// negative xp_grants so the leaderboard's
// `SUM(xp_grants.amount)` query keeps measuring lifetime
// achievement (not balance) — buying cosmetics shouldn't penalize
// you on the class leaderboard.
//
// One row per purchase (no idempotency on a "user buys cosmetic
// twice" because already-owned is rejected at the route layer).
// amount is captured at purchase time so a future xpCost change
// doesn't retroactively rewrite history.
export const xpPurchases = sqliteTable("xp_purchases", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  cosmeticSlug: text("cosmetic_slug").notNull(),
  amount: integer("amount").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  userIdx: index("xp_purchases_user_idx").on(t.userId, t.createdAt),
}));

// =============================================================
// S107a — Web Push subscriptions.
// =============================================================
//
// One row per (user, browser/device). Endpoint comes from the
// browser's PushManager.subscribe() result; p256dh + auth keys are
// the ECDH/HMAC keys the server uses to encrypt push payloads via
// web-push. UNIQUE on endpoint so re-subscribing from the same
// browser updates the row in place rather than duplicating.
//
// HTTP 410 from the push endpoint at send time means the
// subscription is gone (user revoked, browser cleared); pushSender
// deletes that row on receiving 410.
export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dhKey: text("p256dh_key").notNull(),
  authKey: text("auth_key").notNull(),
  userAgent: text("user_agent"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  lastUsedAt: text("last_used_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  userIdx: index("push_subscriptions_user_idx").on(t.userId),
}));

// =============================================================
// S96 — Class-scoped "question of the day".
// =============================================================
//
// Instructor-authored multiple-choice question that lives at the
// class level. Reuses the per-class membership + role gating from
// S86; reuses the daily-challenge submission shape from
// gamification.ts. Students get one shot per question (no retry on
// wrong) — emphasizes engagement rather than mastery so the XP
// reward is small.
export const classQuestions = sqliteTable("class_questions", {
  id: text("id").primaryKey(),
  classId: text("class_id").notNull()
    .references(() => classes.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => users.id),
  prompt: text("prompt").notNull(),
  // JSON array of choice strings; min 2, max 8 enforced at the
  // route layer.
  choicesJson: text("choices_json").notNull(),
  // 0-indexed into choices.
  correctIndex: integer("correct_index").notNull(),
  // Null endsAt = no automatic close. Closing is by explicit POST or
  // by the next question being published in the same class.
  startsAt: text("starts_at").default(sql`(datetime('now'))`).notNull(),
  endsAt: text("ends_at"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  classActiveIdx: index("class_questions_class_active_idx").on(t.classId, t.endsAt),
}));

// One-shot attempts. Unique per (question, user) so re-submission
// is rejected at the data layer. correct=true grants XP; the
// wrong-answer path still records the attempt so the instructor
// can see who tried.
export const classQuestionAttempts = sqliteTable("class_question_attempts", {
  id: text("id").primaryKey(),
  questionId: text("question_id").notNull()
    .references(() => classQuestions.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id),
  answerIndex: integer("answer_index").notNull(),
  correct: integer("correct", { mode: "boolean" }).notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  uniq: uniqueIndex("class_question_attempts_uniq").on(t.questionId, t.userId),
  questionIdx: index("class_question_attempts_question_idx").on(t.questionId),
}));

// =================================================================
// S108 — Beta-readiness: auth abuse + email verification + feedback.
// =================================================================

// Per-attempt log of login activity. Used by the lockout middleware
// to count failures in the last 15 minutes per (email, ip). Cleaned
// up by an existing periodic job in lib/jobs.ts (24h retention is
// enough for the lockout window).
export const authLoginAttempts = sqliteTable("auth_login_attempts", {
  id: text("id").primaryKey(),
  // email is the field the login route accepts; we bucket by it so
  // an attacker can't bypass lockout by rotating IPs.
  email: text("email").notNull(),
  ip: text("ip"),
  success: integer("success", { mode: "boolean" }).notNull(),
  attemptedAt: text("attempted_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  // Hot path for the lockout query: count failures in last N minutes
  // for an email. Index lets the lookup stay O(log N).
  emailIdx: index("auth_login_attempts_email_idx").on(t.email, t.attemptedAt),
}));

// Email-verification tokens. Issued on signup and on /me/resend-verify.
// Single-use: deleted (or marked used) on successful verify.
// Expires after 24h. Token is a random hex string.
export const emailVerificationTokens = sqliteTable("email_verification_tokens", {
  token: text("token").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  userIdx: index("email_verification_tokens_user_idx").on(t.userId),
}));

// Bug-report / feedback inbox. Beta testers click the floating widget
// to drop a row here. Admin reads them at /admin/feedback. Kind is a
// rough triage hint ("bug" | "idea" | "praise") — not validated as a
// strict enum at the DB layer to keep the schema flexible.
export const feedbackReports = sqliteTable("feedback_reports", {
  id: text("id").primaryKey(),
  // Anonymous reports allowed: userId null is OK.
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),
  message: text("message").notNull(),
  currentUrl: text("current_url"),
  browserUa: text("browser_ua"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  createdIdx: index("feedback_reports_created_idx").on(t.createdAt),
}));

// =================================================================
// S109 — Auth recovery + account hygiene.
// =================================================================

// Password reset tokens. Issued by POST /auth/forgot-password,
// consumed by POST /auth/reset-password. Single-use: row deleted on
// successful reset. 1-hour expiry.
export const passwordResetTokens = sqliteTable("password_reset_tokens", {
  token: text("token").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  userIdx: index("password_reset_tokens_user_idx").on(t.userId),
}));

// ============================================================
// Phase 27 — Hackathons + engineering competitions.
//
// Distinct from classCompetitions (which is hard-scoped to one
// class). Hackathons are tenant-level entities that can be
// public, scoped to a class, or scoped to a cohort. Hosts
// define teams, submissions, judging mode, and prize tiers
// that fan out XP + pet cosmetics/skins + badges to winning
// teams via the existing grant infrastructure.
// ============================================================

export const hackathons = sqliteTable("hackathons", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  descriptionMd: text("description_md").notNull().default(""),
  rulesMd: text("rules_md").notNull().default(""),
  // Free-form so we can host "all fields" — recommended values
  // surfaced in the UI datalist but anything's accepted.
  fieldTag: text("field_tag").notNull().default("other"),
  coverEmoji: text("cover_emoji").notNull().default("🏆"),
  // 'public' | 'class' | 'cohort'. For 'class' hostClassId is
  // required; for 'cohort' hostCohortId is required. Validated
  // at the route layer, not via DB constraint.
  hostMode: text("host_mode").notNull().default("public"),
  hostClassId: text("host_class_id"),
  hostCohortId: text("host_cohort_id"),
  // Publicly listed in /hackathons/discover when true. Flips on
  // publish; organizer can toggle.
  discoverable: integer("discoverable", { mode: "boolean" }).notNull().default(false),
  // 'draft' | 'registration' | 'active' | 'judging' | 'ended'.
  // draft -> registration via /publish; registration -> active
  // when startsAt is reached; active -> judging via /judge;
  // judging -> ended when judging completes.
  status: text("status").notNull().default("draft"),
  // Soft cap; team-join refuses when at this size. Solo = 1.
  maxTeamSize: integer("max_team_size").notNull().default(4),
  // 'manual' | 'ai_rubric'. v1 supports both; peer-vote deferred.
  judgingMode: text("judging_mode").notNull().default("manual"),
  // Same shape as Phase 21B variant rubric:
  // { criteria: [{id, description, weight?}], passingScore }.
  // Null when judgingMode='manual'.
  rubricJson: text("rubric_json"),
  registrationOpensAt: text("registration_opens_at"),
  registrationClosesAt: text("registration_closes_at"),
  startsAt: text("starts_at"),
  endsAt: text("ends_at"),
  createdById: text("created_by_id").notNull().references(() => users.id),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  // Directory: /hackathons/discover scans discoverable + status
  // + soonest-starting first.
  discoverIdx: index("hackathons_discover_idx").on(
    t.discoverable,
    t.status,
    t.startsAt,
  ),
  // "My hosted hackathons" list.
  organizerIdx: index("hackathons_organizer_idx").on(t.createdById, t.createdAt),
}));

export const hackathonTeams = sqliteTable("hackathon_teams", {
  id: text("id").primaryKey(),
  hackathonId: text("hackathon_id").notNull()
    .references(() => hackathons.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // The team captain submits on behalf of the team and is the
  // sole edit gate. Promotes oldest member if captain leaves.
  captainId: text("captain_id").notNull().references(() => users.id),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  hackathonIdx: index("hackathon_teams_hackathon_idx").on(t.hackathonId),
}));

// One row per (team, user). The denormalized hackathonId lets us
// enforce one-team-per-user-per-hackathon at the DB level.
export const hackathonTeamMembers = sqliteTable("hackathon_team_members", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull()
    .references(() => hackathonTeams.id, { onDelete: "cascade" }),
  hackathonId: text("hackathon_id").notNull()
    .references(() => hackathons.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id),
  // 'captain' | 'member'. Captain stored on team.captainId too;
  // mirror here for fast role lookups without a join.
  role: text("role").notNull().default("member"),
  joinedAt: text("joined_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  // One team per user per hackathon.
  perHackathonUq: uniqueIndex("hackathon_team_members_user_uq")
    .on(t.hackathonId, t.userId),
  // Standard team-membership uniqueness.
  perTeamUq: uniqueIndex("hackathon_team_members_team_uq")
    .on(t.teamId, t.userId),
}));

export const hackathonSubmissions = sqliteTable("hackathon_submissions", {
  id: text("id").primaryKey(),
  hackathonId: text("hackathon_id").notNull()
    .references(() => hackathons.id, { onDelete: "cascade" }),
  teamId: text("team_id").notNull()
    .references(() => hackathonTeams.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  writeup: text("writeup").notNull().default(""),
  // JSON array of {kind: 'github'|'colab'|'demo'|'paper'|'other',
  // url: string, label: string}.
  artifactsJson: text("artifacts_json").notNull().default("[]"),
  submittedAt: text("submitted_at").default(sql`(datetime('now'))`).notNull(),
  // AI grader output (Phase 21B essayGrader shape) — populated
  // by /judge when judgingMode='ai_rubric'. Null otherwise.
  aiGradeJson: text("ai_grade_json"),
  gradedAt: text("graded_at"),
  // Organizer scratchpad — never shown to the team. Manual notes
  // surface alongside aiGradeJson in the organizer view.
  manualNotesMd: text("manual_notes_md").notNull().default(""),
}, (t) => ({
  // One submission per team (re-submit overwrites in place).
  teamUq: uniqueIndex("hackathon_submissions_team_uq").on(t.teamId),
}));

export const hackathonPrizes = sqliteTable("hackathon_prizes", {
  id: text("id").primaryKey(),
  hackathonId: text("hackathon_id").notNull()
    .references(() => hackathons.id, { onDelete: "cascade" }),
  // 1 = winner, 2 = runner-up, 3 = third place, 0 = non-tier
  // (e.g. "Best UX", "People's Choice"). Used for sort + label.
  rank: integer("rank").notNull().default(0),
  title: text("title").notNull(),
  descriptionMd: text("description_md").notNull().default(""),
  // Reward bundle. xpAmount goes through grantXp's idempotent
  // grant; cosmetic/skin/badge slugs grant the matching reward
  // when set. All optional — at least one is the practical
  // requirement, but enforced only as good-vibe by the UI.
  xpAmount: integer("xp_amount").notNull().default(0),
  cosmeticSlug: text("cosmetic_slug"),
  skinSlug: text("skin_slug"),
  // Mints a userAchievements row (existing table). First-time
  // only thanks to the unique index on (userId, slug).
  badgeSlug: text("badge_slug"),
  // Number of teams this prize can be awarded to (1 = single
  // winner, >1 = ties allowed, e.g. multiple runners-up).
  maxWinners: integer("max_winners").notNull().default(1),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  hackathonIdx: index("hackathon_prizes_hackathon_idx").on(t.hackathonId, t.rank),
}));

export const hackathonPrizeAwards = sqliteTable("hackathon_prize_awards", {
  id: text("id").primaryKey(),
  prizeId: text("prize_id").notNull()
    .references(() => hackathonPrizes.id, { onDelete: "cascade" }),
  teamId: text("team_id").notNull()
    .references(() => hackathonTeams.id, { onDelete: "cascade" }),
  awardedById: text("awarded_by_id").notNull().references(() => users.id),
  awardedAt: text("awarded_at").default(sql`(datetime('now'))`).notNull(),
}, (t) => ({
  // Idempotent award — same prize can't go to the same team twice.
  prizeTeamUq: uniqueIndex("hackathon_prize_awards_uq").on(t.prizeId, t.teamId),
}));

// ============================================================
// Phase 28 — the differentiation chain.
//   28B: reproduction peer review → signed credential
//   28C/D: research bounty marketplace → signed credential
//   28E: longitudinal mastery snapshots → readiness model
// (28A credential wallet is read-only aggregation; no tables.)
// ============================================================

// Phase 28B — peer review of a reproduction. Mirrors
// capstonePeerReviews. Two 'confirmed' verdicts mint the
// reproduction's signed credential (reproductions.credentialMintedAt).
export const reproductionReviews = sqliteTable(
  "reproduction_reviews",
  {
    id: text("id").primaryKey(),
    reproductionId: text("reproduction_id")
      .notNull()
      .references(() => reproductions.id, { onDelete: "cascade" }),
    reviewerId: text("reviewer_id").notNull().references(() => users.id),
    // 'confirmed' | 'refuted' | 'inconclusive'
    verdict: text("verdict").notNull(),
    notesMd: text("notes_md").notNull().default(""),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    // One review per (reproduction, reviewer).
    uq: uniqueIndex("reproduction_reviews_uq").on(
      t.reproductionId,
      t.reviewerId,
    ),
    reproIdx: index("reproduction_reviews_repro_idx").on(t.reproductionId),
  }),
);

// Phase 29B — collaborative review rooms. A live (WebSocket-
// backed) discussion thread attached to a reproduction or a
// capstone submission so co-reviewers / mentor + reviewee can
// hash it out together. Polymorphic (roomKind+roomId, no FK) —
// mirrors reproductions.targetKind/targetId + the liveBus
// draft:{kind}:{id} precedent. Append-only; single-level threads.
export const reviewRoomMessages = sqliteTable(
  "review_room_messages",
  {
    id: text("id").primaryKey(),
    // 'reproduction' | 'capstone_submission'
    roomKind: text("room_kind").notNull(),
    roomId: text("room_id").notNull(),
    authorId: text("author_id").notNull().references(() => users.id),
    bodyMd: text("body_md").notNull().default(""),
    // null = top-level; else the parent message id (one level).
    parentId: text("parent_id"),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    roomIdx: index("review_room_messages_room_idx").on(
      t.roomKind,
      t.roomId,
      t.createdAt,
    ),
  }),
);

// Phase 28C — research bounty. A poster (researcher / institution)
// publishes a unit of real work; learners claim + complete it for
// XP + an optional badge + a signed "Bounty Completed" credential.
export const researchBounties = sqliteTable(
  "research_bounties",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    descriptionMd: text("description_md").notNull().default(""),
    // 'reproduce' | 'extend' | 'analyze' | 'other'
    kind: text("kind").notNull().default("other"),
    // Optional linkage to the research artifact this bounty is about.
    linkedPaperId: text("linked_paper_id"),
    linkedArticleId: text("linked_article_id"),
    rewardXp: integer("reward_xp").notNull().default(0),
    rewardBadgeSlug: text("reward_badge_slug"),
    // 'open' | 'in_review' | 'completed' | 'closed'
    status: text("status").notNull().default("open"),
    maxClaimants: integer("max_claimants").notNull().default(1),
    deadlineAt: text("deadline_at"),
    discoverable: integer("discoverable", { mode: "boolean" })
      .notNull()
      .default(true),
    posterId: text("poster_id").notNull().references(() => users.id),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    discoverIdx: index("research_bounties_discover_idx").on(
      t.discoverable,
      t.status,
      t.createdAt,
    ),
    posterIdx: index("research_bounties_poster_idx").on(
      t.posterId,
      t.createdAt,
    ),
  }),
);

export const bountyClaims = sqliteTable(
  "bounty_claims",
  {
    id: text("id").primaryKey(),
    bountyId: text("bounty_id")
      .notNull()
      .references(() => researchBounties.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id),
    // 'claimed' | 'submitted' | 'accepted' | 'rejected'
    status: text("status").notNull().default("claimed"),
    claimedAt: text("claimed_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    // One claim per user per bounty.
    uq: uniqueIndex("bounty_claims_uq").on(t.bountyId, t.userId),
    bountyIdx: index("bounty_claims_bounty_idx").on(t.bountyId, t.status),
  }),
);

export const bountySubmissions = sqliteTable(
  "bounty_submissions",
  {
    id: text("id").primaryKey(),
    claimId: text("claim_id")
      .notNull()
      .references(() => bountyClaims.id, { onDelete: "cascade" }),
    writeup: text("writeup").notNull().default(""),
    // JSON array of {kind, url, label} — same shape as Phase 27.
    artifactsJson: text("artifacts_json").notNull().default("[]"),
    // Advisory AI sanity pass (gradeEssay output). Never gates
    // acceptance — the poster decides.
    aiReviewJson: text("ai_review_json"),
    submittedAt: text("submitted_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    // One submission per claim (re-submit overwrites in place).
    claimUq: uniqueIndex("bounty_submissions_claim_uq").on(t.claimId),
  }),
);

// Phase 28E — daily longitudinal snapshot of a user's mastery
// posture. Upserted once per user per day when the Knowledge MRI
// builds. Powers the readiness trajectory + dated study plan.
export const masterySnapshots = sqliteTable(
  "mastery_snapshots",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    // YYYY-MM-DD (UTC) — the dedup key alongside userId.
    capturedOn: text("captured_on").notNull(),
    masteredCount: integer("mastered_count").notNull().default(0),
    inProgressCount: integer("in_progress_count").notNull().default(0),
    untouchedCount: integer("untouched_count").notNull().default(0),
    avgQuizScore: real("avg_quiz_score"),
    weakConceptCount: integer("weak_concept_count").notNull().default(0),
    capturedAt: text("captured_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    uq: uniqueIndex("mastery_snapshots_uq").on(t.userId, t.capturedOn),
    userIdx: index("mastery_snapshots_user_idx").on(t.userId, t.capturedOn),
  }),
);

// Phase 30C — denormalized per-user skill index for the recruiter
// search. Self-healing: refreshed best-effort whenever a user's
// wallet is built (any view). credentialsPublic=false deletes the
// user's rows so opting out removes discoverability. Nothing
// authoritative reads it — it's a search accelerator only.
export const userSkillIndex = sqliteTable(
  "user_skill_index",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    skillSlug: text("skill_slug").notNull(),
    skillTitle: text("skill_title").notNull(),
    proofCount: integer("proof_count").notNull().default(0),
    latestProofAt: text("latest_proof_at"),
  },
  (t) => ({
    uq: uniqueIndex("user_skill_index_uq").on(t.userId, t.skillSlug),
    skillIdx: index("user_skill_index_skill_idx").on(
      t.skillSlug,
      t.proofCount,
    ),
  }),
);

// Phase 30C — recruiter-saved candidate lists (talent pools).
export const userTalentPools = sqliteTable(
  "user_talent_pools",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull().references(() => users.id),
    name: text("name").notNull(),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    ownerIdx: index("user_talent_pools_owner_idx").on(t.ownerId),
  }),
);

export const talentPoolMembers = sqliteTable(
  "talent_pool_members",
  {
    id: text("id").primaryKey(),
    poolId: text("pool_id")
      .notNull()
      .references(() => userTalentPools.id, { onDelete: "cascade" }),
    candidateUserId: text("candidate_user_id")
      .notNull()
      .references(() => users.id),
    addedAt: text("added_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    uq: uniqueIndex("talent_pool_members_uq").on(
      t.poolId,
      t.candidateUserId,
    ),
  }),
);

// Phase 32A — verifiable credential revocation registry. Signing
// + /keys/verify are UNCHANGED; this is an additive issuer-asserted
// layer (CRL/OCSP-style): the ed25519 signature still verifies
// `valid:true`, but the issuer can mark the underlying claim
// revoked (e.g. a reproduction refuted after its credential was
// minted). One row per (kind, ref), toggled via `active` so an
// over-turned refute can un-revoke. Nothing reads the signed bytes
// — wallet/provenance/score/verify just consult this table.
export const credentialRevocations = sqliteTable(
  "credential_revocations",
  {
    id: text("id").primaryKey(),
    // 'reproduction' | 'bounty' | 'composite_score' | 'capstone'
    credentialKind: text("credential_kind").notNull(),
    // The credential's natural ref: reproId / bountyId / userId / …
    credentialRef: text("credential_ref").notNull(),
    reason: text("reason").notNull().default(""),
    // null = system (auto-revoke on refute weight); else the
    // issuer/admin who pulled it.
    revokedByUserId: text("revoked_by_user_id").references(() => users.id),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    revokedAt: text("revoked_at").default(sql`(datetime('now'))`).notNull(),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    uq: uniqueIndex("credential_revocations_uq").on(
      t.credentialKind,
      t.credentialRef,
    ),
    activeIdx: index("credential_revocations_active_idx").on(
      t.active,
      t.revokedAt,
    ),
  }),
);

// Phase 32C — curated target-role catalog for the skill-gap
// analyzer. A role names a set of skill slugs; the analyzer diffs
// a user's signed-proof skills (userSkillIndex) + mastery against
// it. Ad-hoc skill-slug arrays also work with ZERO rows here — the
// catalog is a convenience, not a requirement.
export const roleProfiles = sqliteTable(
  "role_profiles",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    descriptionMd: text("description_md").notNull().default(""),
    // JSON array of skill slugs the role requires.
    requiredSkillSlugsJson: text("required_skill_slugs_json")
      .notNull()
      .default("[]"),
    // 'curated' | 'user' — seeded roles vs. future user-defined.
    source: text("source").notNull().default("curated"),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    slugIdx: index("role_profiles_slug_idx").on(t.slug),
  }),
);

// Phase 33B — Certificate-Transparency-style append-only log of
// credential lifecycle events. Each row hash-chains to the prior
// (leafHash = sha256(prevHash + canonicalJson(payload))), so any
// silent rewrite of history breaks the chain and the signed tree
// head. Two append points: reproduction mint + revoke/unrevoke.
// Append-only — never UPDATE/DELETE a row.
export const credentialLog = sqliteTable(
  "credential_log",
  {
    id: text("id").primaryKey(),
    // Dense, gap-free sequence assigned under a short transaction.
    leafIndex: integer("leaf_index").notNull(),
    // 'issued' | 'revoked' | 'unrevoked'
    eventKind: text("event_kind").notNull(),
    credentialKind: text("credential_kind").notNull(),
    credentialRef: text("credential_ref").notNull(),
    leafHash: text("leaf_hash").notNull(),
    // Genesis row uses the empty string.
    prevHash: text("prev_hash").notNull().default(""),
    payloadJson: text("payload_json").notNull().default("{}"),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    leafUq: uniqueIndex("credential_log_leaf_uq").on(t.leafIndex),
    refIdx: index("credential_log_ref_idx").on(
      t.credentialKind,
      t.credentialRef,
    ),
  }),
);

// Phase 33B — periodically-signed tree head. The signature (via
// signing.ts, the same ed25519 key as every credential) commits
// to (treeSize, rootHash); a verifier checks the chain up to a
// signed head and trusts nothing was backdated or silently pulled.
export const transparencyTreeHeads = sqliteTable(
  "transparency_tree_heads",
  {
    id: text("id").primaryKey(),
    treeSize: integer("tree_size").notNull(),
    rootHash: text("root_hash").notNull(),
    signature: text("signature").notNull(),
    signedAt: text("signed_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    sizeIdx: index("transparency_tree_heads_size_idx").on(t.treeSize),
  }),
);

// Phase 33C — signed peer skill endorsement. weightAtEndorsement
// is a snapshot of the endorser's OWN proven competency on this
// skill (userSkillIndex) + reviewer trust at endorsement time —
// so an endorser with no proof contributes ~0. This is a SEPARATE
// web-of-trust band; it never mutates userSkillIndex.proofCount
// (signed-credential proof stays the authoritative signal).
export const skillEndorsements = sqliteTable(
  "skill_endorsements",
  {
    id: text("id").primaryKey(),
    endorserId: text("endorser_id").notNull().references(() => users.id),
    endorseeId: text("endorsee_id").notNull().references(() => users.id),
    skillSlug: text("skill_slug").notNull(),
    skillTitle: text("skill_title").notNull().default(""),
    weightAtEndorsement: real("weight_at_endorsement").notNull().default(0),
    note: text("note").notNull().default(""),
    signedJson: text("signed_json").notNull().default(""),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
    revokedAt: text("revoked_at"),
  },
  (t) => ({
    uq: uniqueIndex("skill_endorsements_uq").on(
      t.endorserId,
      t.endorseeId,
      t.skillSlug,
    ),
    endorseeIdx: index("skill_endorsements_endorsee_idx").on(
      t.endorseeId,
      t.skillSlug,
    ),
  }),
);

// Phase 33D — learner-controlled selective-disclosure share link.
// The raw token is shown once to the owner and stored only as a
// sha256 hash at rest (improves on the plaintext auth-token
// convention — these links are shareable). scopeJson limits which
// credentials a holder of the link can see, bypassing the
// all-or-nothing credentialsPublic gate ONLY for that subset.
export const credentialShareTokens = sqliteTable(
  "credential_share_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    // { mode: 'all' } | { mode:'kinds', kinds:[] } | { mode:'ids', ids:[] }
    scopeJson: text("scope_json").notNull().default('{"mode":"all"}'),
    label: text("label").notNull().default(""),
    // null = never expires.
    expiresAt: text("expires_at"),
    revokedAt: text("revoked_at"),
    accessCount: integer("access_count").notNull().default(0),
    lastAccessedAt: text("last_accessed_at"),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    tokenUq: uniqueIndex("credential_share_tokens_token_uq").on(t.tokenHash),
    ownerIdx: index("credential_share_tokens_owner_idx").on(
      t.userId,
      t.createdAt,
    ),
  }),
);

// Phase 34A — consented recruiter↔candidate match handshake. A
// recruiter sends a role-scoped, Ed25519-signed match offer with
// a snapshot of the verifiable skill gap; the candidate accepts
// (auto-minting a scoped credential share token) or declines.
// Mirrors mentorRelationships' two-party request/respond shape.
export const recruiterMatchOffers = sqliteTable(
  "recruiter_match_offers",
  {
    id: text("id").primaryKey(),
    recruiterId: text("recruiter_id").notNull().references(() => users.id),
    candidateId: text("candidate_id").notNull().references(() => users.id),
    roleSlug: text("role_slug").notNull(),
    roleTitle: text("role_title").notNull().default(""),
    // 'pending' | 'accepted' | 'declined' | 'withdrawn'
    status: text("status").notNull().default("pending"),
    messageMd: text("message_md").notNull().default(""),
    // Snapshot of analyzeSkillGap at offer time.
    skillGapJson: text("skill_gap_json").notNull().default("{}"),
    // signCredential("match_offer", …) JSON.
    signedOfferJson: text("signed_offer_json").notNull().default(""),
    // Set on accept: the scoped credentialShareTokens row id.
    shareTokenId: text("share_token_id"),
    // The raw share URL, surfaced back to the recruiter once.
    shareUrl: text("share_url"),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
    respondedAt: text("responded_at"),
  },
  (t) => ({
    // One live offer per (recruiter, candidate, role).
    uq: uniqueIndex("recruiter_match_offers_uq").on(
      t.recruiterId,
      t.candidateId,
      t.roleSlug,
    ),
    candidateIdx: index("recruiter_match_offers_candidate_idx").on(
      t.candidateId,
      t.status,
    ),
    recruiterIdx: index("recruiter_match_offers_recruiter_idx").on(
      t.recruiterId,
      t.createdAt,
    ),
  }),
);

// Phase 34B — organization / institution accounts. The signing
// key stays per-instance; an org credential is the instance key
// signing on behalf of a NAMED issuer in the manifest (no per-org
// keypair). Membership/role mirrors cohortMembers + gateCohort.
export const orgs = sqliteTable(
  "orgs",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    descriptionMd: text("description_md").notNull().default(""),
    website: text("website").notNull().default(""),
    // 'unverified' | 'verified' — display-only trust badge.
    verificationStatus: text("verification_status")
      .notNull()
      .default("unverified"),
    creatorId: text("creator_id").notNull().references(() => users.id),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    slugIdx: index("orgs_slug_idx").on(t.slug),
    creatorIdx: index("orgs_creator_idx").on(t.creatorId),
  }),
);

export const orgMembers = sqliteTable(
  "org_members",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id),
    // 'member' | 'admin' | 'verifier' (verifier/admin may attest).
    role: text("role").notNull().default("member"),
    joinedAt: text("joined_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    uq: uniqueIndex("org_members_uq").on(t.orgId, t.userId),
    orgIdx: index("org_members_org_idx").on(t.orgId),
    userIdx: index("org_members_user_idx").on(t.userId),
  }),
);

// Phase 34D — signed learning commitments. A learner commits to a
// goal (capstone/track/exam/skills) by a deadline, optionally
// witnessed by a mentor or cohort; completion mints a signed
// "commitment_kept" credential + a transparency leaf.
export const learningCommitments = sqliteTable(
  "learning_commitments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    // 'capstone' | 'track' | 'exam' | 'skills'
    goalKind: text("goal_kind").notNull(),
    goalSlug: text("goal_slug").notNull(),
    goalTitle: text("goal_title").notNull().default(""),
    deadlineAt: text("deadline_at").notNull(),
    // 'active' | 'completed' | 'lapsed' | 'abandoned'
    status: text("status").notNull().default("active"),
    witnessUserId: text("witness_user_id").references(() => users.id),
    cohortId: text("cohort_id"),
    isPublic: integer("is_public", { mode: "boolean" })
      .notNull()
      .default(true),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
    completedAt: text("completed_at"),
  },
  (t) => ({
    userIdx: index("learning_commitments_user_idx").on(
      t.userId,
      t.status,
    ),
    deadlineIdx: index("learning_commitments_deadline_idx").on(
      t.status,
      t.deadlineAt,
    ),
  }),
);

// Phase 34B — an org's signed attestation OF a member's artifact
// (a reproduction / bounty / skill). The instance key signs on
// behalf of the named org (issuer in the manifest); the event is
// also written to the Phase 33B transparency log. Surfaces in the
// member's wallet as an `org_attested` band and on the org's
// public verify page. revokedAt nullable for withdrawal.
export const orgAttestations = sqliteTable(
  "org_attestations",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    subjectUserId: text("subject_user_id")
      .notNull()
      .references(() => users.id),
    attestedByUserId: text("attested_by_user_id")
      .notNull()
      .references(() => users.id),
    // 'reproduction' | 'bounty' | 'skill'
    attestKind: text("attest_kind").notNull(),
    // The artifact ref (reproId / bountyId / skillSlug).
    attestRef: text("attest_ref").notNull().default(""),
    statement: text("statement").notNull().default(""),
    signedJson: text("signed_json").notNull().default(""),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
    revokedAt: text("revoked_at"),
  },
  (t) => ({
    subjectIdx: index("org_attestations_subject_idx").on(
      t.subjectUserId,
    ),
    orgIdx: index("org_attestations_org_idx").on(t.orgId),
  }),
);

// Phase 39 — "Goodness" Missions: open collaborative
// problem-solving on big global problems. A Mission decomposes a
// problem into sub-problems; members contribute analysis/data/
// solutions (links+writeups); peer+expert review verifies a
// contribution into a signed, transparency-logged credential
// (reuses the reproduction rigor). Backing orgs lend expert
// attestation. All additive; no existing-table changes.
export const missions = sqliteTable(
  "missions",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    problemMd: text("problem_md").notNull().default(""),
    summaryMd: text("summary_md").notNull().default(""),
    // Free-text theme, e.g. "climate" | "poverty" | "health".
    theme: text("theme").notNull().default("other"),
    topicTagsJson: text("topic_tags_json").notNull().default("[]"),
    // 'open' | 'active' | 'completed' | 'archived'
    status: text("status").notNull().default("open"),
    creatorId: text("creator_id").notNull().references(() => users.id),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    slugIdx: index("missions_slug_idx").on(t.slug),
    statusIdx: index("missions_status_idx").on(t.status, t.createdAt),
  }),
);

// Open self-join membership (mirrors cohortMembers). Creator =
// 'organizer'. No visibility gate — missions are public-read.
export const missionMembers = sqliteTable(
  "mission_members",
  {
    id: text("id").primaryKey(),
    missionId: text("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id),
    // 'member' | 'organizer'
    role: text("role").notNull().default("member"),
    joinedAt: text("joined_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    pk: uniqueIndex("mission_members_pk").on(t.missionId, t.userId),
    userIdx: index("mission_members_user_idx").on(t.userId),
  }),
);

export const missionSubproblems = sqliteTable(
  "mission_subproblems",
  {
    id: text("id").primaryKey(),
    missionId: text("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    descriptionMd: text("description_md").notNull().default(""),
    // 'open' | 'in_progress' | 'solved'
    status: text("status").notNull().default("open"),
    order: integer("order").notNull().default(0),
    createdById: text("created_by_id").notNull().references(() => users.id),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    missionIdx: index("mission_subproblems_mission_idx").on(
      t.missionId,
      t.order,
    ),
    slugUq: uniqueIndex("mission_subproblems_slug_uq").on(
      t.missionId,
      t.slug,
    ),
  }),
);

// A contribution; verified→signed credential (credentialMintedAt
// set, credentialMintWeight snapshot — mirrors reproductions).
export const missionContributions = sqliteTable(
  "mission_contributions",
  {
    id: text("id").primaryKey(),
    missionId: text("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    subproblemId: text("subproblem_id").references(
      () => missionSubproblems.id,
      { onDelete: "set null" },
    ),
    userId: text("user_id").notNull().references(() => users.id),
    // 'analysis' | 'data' | 'solution' | 'synthesis'
    kind: text("kind").notNull().default("analysis"),
    bodyMd: text("body_md").notNull().default(""),
    // [{kind,url,label}] — links+writeups only, no uploads.
    artifactsJson: text("artifacts_json").notNull().default("[]"),
    credentialMintedAt: text("credential_minted_at"),
    credentialMintWeight: real("credential_mint_weight"),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    missionIdx: index("mission_contributions_mission_idx").on(
      t.missionId,
      t.createdAt,
    ),
    userIdx: index("mission_contributions_user_idx").on(t.userId),
  }),
);

// Exact reproductionReviews twin (verdict-weighted verification).
export const missionContributionReviews = sqliteTable(
  "mission_contribution_reviews",
  {
    id: text("id").primaryKey(),
    contributionId: text("contribution_id")
      .notNull()
      .references(() => missionContributions.id, { onDelete: "cascade" }),
    reviewerId: text("reviewer_id").notNull().references(() => users.id),
    // 'confirmed' | 'refuted' | 'inconclusive'
    verdict: text("verdict").notNull(),
    notesMd: text("notes_md").notNull().default(""),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    uq: uniqueIndex("mission_contribution_reviews_uq").on(
      t.contributionId,
      t.reviewerId,
    ),
    contribIdx: index("mission_contribution_reviews_contrib_idx").on(
      t.contributionId,
    ),
  }),
);

// An org "backs" a mission; a backer's verifier/admin may attest
// contributions (reuses orgs.attestForMember).
export const missionOrgBackers = sqliteTable(
  "mission_org_backers",
  {
    id: text("id").primaryKey(),
    missionId: text("mission_id")
      .notNull()
      .references(() => missions.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    addedByUserId: text("added_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (t) => ({
    uq: uniqueIndex("mission_org_backers_uq").on(t.missionId, t.orgId),
    missionIdx: index("mission_org_backers_mission_idx").on(t.missionId),
  }),
);

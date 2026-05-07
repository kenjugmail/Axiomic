-- Sprint 23 — drop NOT NULL on the four shared tables' `article_id`
-- columns so research-paper-targeted rows can leave it null and use
-- (target_kind, target_id) instead. SQLite doesn't support
-- ALTER COLUMN DROP NOT NULL directly; the canonical workaround is
-- a per-table rebuild.

PRAGMA foreign_keys = OFF;
--> statement-breakpoint

-- news_comments rebuild ----------------------------------------------
CREATE TABLE `__new_news_comments` (
  `id` text PRIMARY KEY NOT NULL,
  `article_id` text,
  `parent_id` text,
  `user_id` text NOT NULL,
  `content` text NOT NULL,
  `claim_thread_id` text,
  `target_kind` text DEFAULT 'news_article' NOT NULL,
  `target_id` text DEFAULT '' NOT NULL,
  `edited_at` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (`article_id`) REFERENCES `news_articles`(`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);--> statement-breakpoint
INSERT INTO `__new_news_comments` SELECT
  `id`, `article_id`, `parent_id`, `user_id`, `content`, `claim_thread_id`,
  `target_kind`, `target_id`, `edited_at`, `created_at`
FROM `news_comments`;--> statement-breakpoint
DROP TABLE `news_comments`;--> statement-breakpoint
ALTER TABLE `__new_news_comments` RENAME TO `news_comments`;--> statement-breakpoint
CREATE INDEX `news_comments_article_idx` ON `news_comments` (`article_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `news_comments_claim_thread_idx` ON `news_comments` (`claim_thread_id`);--> statement-breakpoint
CREATE INDEX `news_comments_target_idx` ON `news_comments` (`target_kind`,`target_id`,`created_at`);--> statement-breakpoint

-- claim_threads rebuild ----------------------------------------------
CREATE TABLE `__new_claim_threads` (
  `id` text PRIMARY KEY NOT NULL,
  `article_id` text,
  `author_id` text NOT NULL,
  `target_kind` text DEFAULT 'news_article' NOT NULL,
  `target_id` text DEFAULT '' NOT NULL,
  `exact` text NOT NULL,
  `prefix` text DEFAULT '' NOT NULL,
  `suffix` text DEFAULT '' NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (`article_id`) REFERENCES `news_articles`(`id`),
  FOREIGN KEY (`author_id`) REFERENCES `users`(`id`)
);--> statement-breakpoint
INSERT INTO `__new_claim_threads` SELECT
  `id`, `article_id`, `author_id`, `target_kind`, `target_id`,
  `exact`, `prefix`, `suffix`, `created_at`
FROM `claim_threads`;--> statement-breakpoint
DROP TABLE `claim_threads`;--> statement-breakpoint
ALTER TABLE `__new_claim_threads` RENAME TO `claim_threads`;--> statement-breakpoint
CREATE INDEX `claim_threads_article_idx` ON `claim_threads` (`article_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `claim_threads_target_idx` ON `claim_threads` (`target_kind`,`target_id`,`created_at`);--> statement-breakpoint

-- runnable_artifacts rebuild -----------------------------------------
CREATE TABLE `__new_runnable_artifacts` (
  `id` text PRIMARY KEY NOT NULL,
  `article_id` text,
  `target_kind` text DEFAULT 'news_article' NOT NULL,
  `target_id` text DEFAULT '' NOT NULL,
  `kind` text NOT NULL,
  `url` text NOT NULL,
  `label` text NOT NULL,
  `description` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (`article_id`) REFERENCES `news_articles`(`id`)
);--> statement-breakpoint
INSERT INTO `__new_runnable_artifacts` SELECT
  `id`, `article_id`, `target_kind`, `target_id`, `kind`, `url`,
  `label`, `description`, `created_at`
FROM `runnable_artifacts`;--> statement-breakpoint
DROP TABLE `runnable_artifacts`;--> statement-breakpoint
ALTER TABLE `__new_runnable_artifacts` RENAME TO `runnable_artifacts`;--> statement-breakpoint
CREATE INDEX `runnable_artifacts_article_idx` ON `runnable_artifacts` (`article_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `runnable_artifacts_target_idx` ON `runnable_artifacts` (`target_kind`,`target_id`,`created_at`);--> statement-breakpoint

-- reproductions rebuild ----------------------------------------------
CREATE TABLE `__new_reproductions` (
  `id` text PRIMARY KEY NOT NULL,
  `article_id` text,
  `target_kind` text DEFAULT 'news_article' NOT NULL,
  `target_id` text DEFAULT '' NOT NULL,
  `artifact_id` text,
  `reproducer_id` text NOT NULL,
  `status` text NOT NULL,
  `notes` text,
  `evidence_url` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (`article_id`) REFERENCES `news_articles`(`id`),
  FOREIGN KEY (`artifact_id`) REFERENCES `runnable_artifacts`(`id`),
  FOREIGN KEY (`reproducer_id`) REFERENCES `users`(`id`)
);--> statement-breakpoint
INSERT INTO `__new_reproductions` SELECT
  `id`, `article_id`, `target_kind`, `target_id`, `artifact_id`,
  `reproducer_id`, `status`, `notes`, `evidence_url`, `created_at`
FROM `reproductions`;--> statement-breakpoint
DROP TABLE `reproductions`;--> statement-breakpoint
ALTER TABLE `__new_reproductions` RENAME TO `reproductions`;--> statement-breakpoint
CREATE INDEX `reproductions_article_idx` ON `reproductions` (`article_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `reproductions_unique_per_user` ON `reproductions` (`article_id`,`reproducer_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `reproductions_unique_per_user_kind` ON `reproductions` (`target_kind`,`target_id`,`reproducer_id`);--> statement-breakpoint
CREATE INDEX `reproductions_target_idx` ON `reproductions` (`target_kind`,`target_id`,`created_at`);--> statement-breakpoint

PRAGMA foreign_keys = ON;

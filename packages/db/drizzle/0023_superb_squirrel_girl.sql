ALTER TABLE `claim_threads` ADD `target_kind` text DEFAULT 'news_article' NOT NULL;--> statement-breakpoint
ALTER TABLE `claim_threads` ADD `target_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `news_comments` ADD `target_kind` text DEFAULT 'news_article' NOT NULL;--> statement-breakpoint
ALTER TABLE `news_comments` ADD `target_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `reproductions` ADD `target_kind` text DEFAULT 'news_article' NOT NULL;--> statement-breakpoint
ALTER TABLE `reproductions` ADD `target_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `runnable_artifacts` ADD `target_kind` text DEFAULT 'news_article' NOT NULL;--> statement-breakpoint
ALTER TABLE `runnable_artifacts` ADD `target_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Sprint 23 — backfill: every legacy row was scoped to news_articles
-- by article_id; mirror that into the new (target_kind, target_id) pair
-- so the polymorphic queries see existing data without a code-level fallback.
UPDATE `news_comments` SET `target_id` = `article_id` WHERE `target_id` = '';--> statement-breakpoint
UPDATE `claim_threads` SET `target_id` = `article_id` WHERE `target_id` = '';--> statement-breakpoint
UPDATE `runnable_artifacts` SET `target_id` = `article_id` WHERE `target_id` = '';--> statement-breakpoint
UPDATE `reproductions` SET `target_id` = `article_id` WHERE `target_id` = '';--> statement-breakpoint
CREATE INDEX `claim_threads_target_idx` ON `claim_threads` (`target_kind`,`target_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `news_comments_target_idx` ON `news_comments` (`target_kind`,`target_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `reproductions_unique_per_user_kind` ON `reproductions` (`target_kind`,`target_id`,`reproducer_id`);--> statement-breakpoint
CREATE INDEX `reproductions_target_idx` ON `reproductions` (`target_kind`,`target_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `runnable_artifacts_target_idx` ON `runnable_artifacts` (`target_kind`,`target_id`,`created_at`);
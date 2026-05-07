CREATE TABLE `claim_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`article_id` text NOT NULL,
	`author_id` text NOT NULL,
	`exact` text NOT NULL,
	`prefix` text DEFAULT '' NOT NULL,
	`suffix` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `news_articles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `news_comments` ADD `claim_thread_id` text;--> statement-breakpoint
CREATE INDEX `claim_threads_article_idx` ON `claim_threads` (`article_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `news_comments_claim_thread_idx` ON `news_comments` (`claim_thread_id`);
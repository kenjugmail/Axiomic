CREATE TABLE `reproductions` (
	`id` text PRIMARY KEY NOT NULL,
	`article_id` text NOT NULL,
	`artifact_id` text,
	`reproducer_id` text NOT NULL,
	`status` text NOT NULL,
	`notes` text,
	`evidence_url` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `news_articles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artifact_id`) REFERENCES `runnable_artifacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reproducer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `runnable_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`article_id` text NOT NULL,
	`kind` text NOT NULL,
	`url` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `news_articles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reproductions_article_idx` ON `reproductions` (`article_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `reproductions_unique_per_user` ON `reproductions` (`article_id`,`reproducer_id`);--> statement-breakpoint
CREATE INDEX `runnable_artifacts_article_idx` ON `runnable_artifacts` (`article_id`,`created_at`);
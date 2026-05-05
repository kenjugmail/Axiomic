CREATE TABLE `news_articles` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`body` text NOT NULL,
	`cover_emoji` text DEFAULT '📰' NOT NULL,
	`accent_color` text DEFAULT 'indigo' NOT NULL,
	`author_id` text NOT NULL,
	`last_editor_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`last_editor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `news_edit_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`article_id` text NOT NULL,
	`proposer_id` text NOT NULL,
	`proposed_title` text NOT NULL,
	`proposed_summary` text DEFAULT '' NOT NULL,
	`proposed_body` text NOT NULL,
	`message` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewer_id` text,
	`reviewed_at` text,
	`review_message` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `news_articles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `news_reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`article_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `news_articles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `news_articles_slug_unique` ON `news_articles` (`slug`);--> statement-breakpoint
CREATE INDEX `news_proposals_article_status_idx` ON `news_edit_proposals` (`article_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `news_reactions_uniq_idx` ON `news_reactions` (`article_id`,`user_id`,`kind`);--> statement-breakpoint
CREATE INDEX `news_reactions_article_kind_idx` ON `news_reactions` (`article_id`,`kind`);
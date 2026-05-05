CREATE TABLE `news_bookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`article_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`article_id`) REFERENCES `news_articles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `news_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`article_id` text NOT NULL,
	`parent_id` text,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`edited_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `news_articles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `news_bookmarks_uniq_idx` ON `news_bookmarks` (`user_id`,`article_id`);--> statement-breakpoint
CREATE INDEX `news_bookmarks_user_idx` ON `news_bookmarks` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `news_comments_article_idx` ON `news_comments` (`article_id`,`created_at`);
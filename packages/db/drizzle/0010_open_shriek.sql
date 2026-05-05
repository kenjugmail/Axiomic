ALTER TABLE `news_articles` ADD `status` text DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE `news_articles` ADD `tags` text DEFAULT '[]' NOT NULL;
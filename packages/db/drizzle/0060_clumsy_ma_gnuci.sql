CREATE INDEX `comments_user_idx` ON `comments` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `comments_page_idx` ON `comments` (`page_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `forum_posts_topic_idx` ON `forum_posts` (`topic_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `forum_posts_author_idx` ON `forum_posts` (`author_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `forum_topics_author_idx` ON `forum_topics` (`author_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `forum_topics_domain_idx` ON `forum_topics` (`domain_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `news_articles_author_idx` ON `news_articles` (`author_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `news_articles_status_idx` ON `news_articles` (`status`,`created_at`);
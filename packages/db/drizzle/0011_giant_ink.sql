CREATE TABLE `forum_bookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`topic_id`) REFERENCES `forum_topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `forum_poll_options` (
	`id` text PRIMARY KEY NOT NULL,
	`poll_id` text NOT NULL,
	`label` text NOT NULL,
	`order` integer NOT NULL,
	FOREIGN KEY (`poll_id`) REFERENCES `forum_polls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `forum_poll_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`poll_id` text NOT NULL,
	`option_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`poll_id`) REFERENCES `forum_polls`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`option_id`) REFERENCES `forum_poll_options`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `forum_polls` (
	`id` text PRIMARY KEY NOT NULL,
	`topic_id` text NOT NULL,
	`question` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `forum_topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `forum_reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`topic_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `forum_topics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_follows` (
	`id` text PRIMARY KEY NOT NULL,
	`follower_id` text NOT NULL,
	`followee_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`follower_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`followee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `forum_bookmarks_uniq_idx` ON `forum_bookmarks` (`user_id`,`topic_id`);--> statement-breakpoint
CREATE INDEX `forum_bookmarks_user_idx` ON `forum_bookmarks` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `forum_poll_options_poll_idx` ON `forum_poll_options` (`poll_id`,`order`);--> statement-breakpoint
CREATE UNIQUE INDEX `forum_poll_votes_uniq_idx` ON `forum_poll_votes` (`poll_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `forum_polls_topic_id_unique` ON `forum_polls` (`topic_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `forum_reactions_uniq_idx` ON `forum_reactions` (`topic_id`,`user_id`,`kind`);--> statement-breakpoint
CREATE INDEX `forum_reactions_topic_kind_idx` ON `forum_reactions` (`topic_id`,`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_follows_uniq_idx` ON `user_follows` (`follower_id`,`followee_id`);--> statement-breakpoint
CREATE INDEX `user_follows_follower_idx` ON `user_follows` (`follower_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `user_follows_followee_idx` ON `user_follows` (`followee_id`,`created_at`);
CREATE TABLE `daily_challenge_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`challenge_id` text NOT NULL,
	`user_id` text NOT NULL,
	`correct` integer NOT NULL,
	`answer` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`challenge_id`) REFERENCES `daily_challenges`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `daily_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`node_slug` text NOT NULL,
	`question_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `news_articles` ADD `abstract` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `news_articles` ADD `references_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `news_articles` ADD `coauthors_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `daily_challenge_attempts_uniq_idx` ON `daily_challenge_attempts` (`challenge_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `daily_challenge_attempts_user_idx` ON `daily_challenge_attempts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `daily_challenges_day_unique` ON `daily_challenges` (`day`);--> statement-breakpoint
CREATE UNIQUE INDEX `daily_challenges_day_idx` ON `daily_challenges` (`day`);
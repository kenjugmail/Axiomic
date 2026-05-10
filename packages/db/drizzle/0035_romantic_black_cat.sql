CREATE TABLE `feed_impressions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`paper_kind` text NOT NULL,
	`paper_id` text NOT NULL,
	`shown_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `paper_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`paper_kind` text NOT NULL,
	`paper_id` text NOT NULL,
	`tier` text NOT NULL,
	`model_id` text NOT NULL,
	`summary_md` text NOT NULL,
	`generated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `searches` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`query` text NOT NULL,
	`result_count` integer DEFAULT 0 NOT NULL,
	`clicked_item_kind` text,
	`clicked_item_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `feed_impressions_user_idx` ON `feed_impressions` (`user_id`,`shown_at`);--> statement-breakpoint
CREATE INDEX `feed_impressions_lookup_idx` ON `feed_impressions` (`user_id`,`paper_kind`,`paper_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `paper_summaries_pk` ON `paper_summaries` (`paper_kind`,`paper_id`,`tier`,`model_id`);--> statement-breakpoint
CREATE INDEX `searches_user_idx` ON `searches` (`user_id`,`created_at`);
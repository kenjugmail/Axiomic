CREATE TABLE `grant_bookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`grant_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`grant_id`) REFERENCES `grants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `grant_notifications_sent` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`grant_id` text NOT NULL,
	`kind` text NOT NULL,
	`window_days` integer,
	`sent_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`grant_id`) REFERENCES `grants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `grants` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`agency` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`full_description` text DEFAULT '' NOT NULL,
	`mechanism` text,
	`amount_ceiling` integer,
	`posted_at` text,
	`deadline_at` text,
	`url` text NOT NULL,
	`topics_json` text DEFAULT '[]' NOT NULL,
	`raw_json` text DEFAULT '{}' NOT NULL,
	`fetched_at` text DEFAULT (datetime('now')) NOT NULL,
	`content_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `grant_bookmarks_uniq_idx` ON `grant_bookmarks` (`user_id`,`grant_id`);--> statement-breakpoint
CREATE INDEX `grant_bookmarks_user_idx` ON `grant_bookmarks` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `grant_notifications_sent_uniq_idx` ON `grant_notifications_sent` (`user_id`,`grant_id`,`kind`,`window_days`);--> statement-breakpoint
CREATE UNIQUE INDEX `grants_source_uq` ON `grants` (`source`,`source_id`);--> statement-breakpoint
CREATE INDEX `grants_deadline_idx` ON `grants` (`deadline_at`);--> statement-breakpoint
CREATE INDEX `grants_agency_idx` ON `grants` (`agency`,`deadline_at`);
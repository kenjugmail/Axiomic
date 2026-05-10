CREATE TABLE `class_competitions` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`title` text NOT NULL,
	`description_md` text DEFAULT '' NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`scoring_rule` text DEFAULT 'class-xp' NOT NULL,
	`prize_cosmetic_slug` text NOT NULL,
	`prize_winner_count` integer DEFAULT 3 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`prizes_awarded` integer DEFAULT false NOT NULL,
	`created_by_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `class_competitions_class_idx` ON `class_competitions` (`class_id`,`status`,`ends_at`);
CREATE TABLE `hackathon_prize_awards` (
	`id` text PRIMARY KEY NOT NULL,
	`prize_id` text NOT NULL,
	`team_id` text NOT NULL,
	`awarded_by_id` text NOT NULL,
	`awarded_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`prize_id`) REFERENCES `hackathon_prizes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `hackathon_teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`awarded_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `hackathon_prizes` (
	`id` text PRIMARY KEY NOT NULL,
	`hackathon_id` text NOT NULL,
	`rank` integer DEFAULT 0 NOT NULL,
	`title` text NOT NULL,
	`description_md` text DEFAULT '' NOT NULL,
	`xp_amount` integer DEFAULT 0 NOT NULL,
	`cosmetic_slug` text,
	`skin_slug` text,
	`badge_slug` text,
	`max_winners` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`hackathon_id`) REFERENCES `hackathons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `hackathon_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`hackathon_id` text NOT NULL,
	`team_id` text NOT NULL,
	`title` text NOT NULL,
	`writeup` text DEFAULT '' NOT NULL,
	`artifacts_json` text DEFAULT '[]' NOT NULL,
	`submitted_at` text DEFAULT (datetime('now')) NOT NULL,
	`ai_grade_json` text,
	`graded_at` text,
	`manual_notes_md` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`hackathon_id`) REFERENCES `hackathons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `hackathon_teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `hackathon_team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`hackathon_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`joined_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `hackathon_teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`hackathon_id`) REFERENCES `hackathons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `hackathon_teams` (
	`id` text PRIMARY KEY NOT NULL,
	`hackathon_id` text NOT NULL,
	`name` text NOT NULL,
	`captain_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`hackathon_id`) REFERENCES `hackathons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`captain_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `hackathons` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description_md` text DEFAULT '' NOT NULL,
	`rules_md` text DEFAULT '' NOT NULL,
	`field_tag` text DEFAULT 'other' NOT NULL,
	`cover_emoji` text DEFAULT '🏆' NOT NULL,
	`host_mode` text DEFAULT 'public' NOT NULL,
	`host_class_id` text,
	`host_cohort_id` text,
	`discoverable` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`max_team_size` integer DEFAULT 4 NOT NULL,
	`judging_mode` text DEFAULT 'manual' NOT NULL,
	`rubric_json` text,
	`registration_opens_at` text,
	`registration_closes_at` text,
	`starts_at` text,
	`ends_at` text,
	`created_by_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hackathon_prize_awards_uq` ON `hackathon_prize_awards` (`prize_id`,`team_id`);--> statement-breakpoint
CREATE INDEX `hackathon_prizes_hackathon_idx` ON `hackathon_prizes` (`hackathon_id`,`rank`);--> statement-breakpoint
CREATE UNIQUE INDEX `hackathon_submissions_team_uq` ON `hackathon_submissions` (`team_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `hackathon_team_members_user_uq` ON `hackathon_team_members` (`hackathon_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `hackathon_team_members_team_uq` ON `hackathon_team_members` (`team_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `hackathon_teams_hackathon_idx` ON `hackathon_teams` (`hackathon_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `hackathons_slug_unique` ON `hackathons` (`slug`);--> statement-breakpoint
CREATE INDEX `hackathons_discover_idx` ON `hackathons` (`discoverable`,`status`,`starts_at`);--> statement-breakpoint
CREATE INDEX `hackathons_organizer_idx` ON `hackathons` (`created_by_id`,`created_at`);
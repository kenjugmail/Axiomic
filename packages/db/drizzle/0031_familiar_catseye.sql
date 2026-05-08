CREATE TABLE `cohort_members` (
	`id` text PRIMARY KEY NOT NULL,
	`cohort_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`joined_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`cohort_id`) REFERENCES `cohorts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `cohorts` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`capstone_slug` text,
	`visibility` text DEFAULT 'open' NOT NULL,
	`creator_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `mentor_relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`mentor_id` text NOT NULL,
	`mentee_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`scope` text DEFAULT '' NOT NULL,
	`requested_at` text DEFAULT (datetime('now')) NOT NULL,
	`responded_at` text,
	FOREIGN KEY (`mentor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mentee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cohort_members_pk` ON `cohort_members` (`cohort_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `cohort_members_user_idx` ON `cohort_members` (`user_id`,`role`);--> statement-breakpoint
CREATE UNIQUE INDEX `cohorts_slug_unique` ON `cohorts` (`slug`);--> statement-breakpoint
CREATE INDEX `cohorts_creator_idx` ON `cohorts` (`creator_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `cohorts_vis_idx` ON `cohorts` (`visibility`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `mentor_relationships_pk` ON `mentor_relationships` (`mentor_id`,`mentee_id`);--> statement-breakpoint
CREATE INDEX `mentor_relationships_mentor_idx` ON `mentor_relationships` (`mentor_id`,`status`);--> statement-breakpoint
CREATE INDEX `mentor_relationships_mentee_idx` ON `mentor_relationships` (`mentee_id`,`status`);
CREATE TABLE `cohort_study_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`cohort_id` text NOT NULL,
	`title` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`room_id` text NOT NULL,
	`created_by_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`cohort_id`) REFERENCES `cohorts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `talent_pool_members` (
	`id` text PRIMARY KEY NOT NULL,
	`pool_id` text NOT NULL,
	`candidate_user_id` text NOT NULL,
	`added_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`pool_id`) REFERENCES `user_talent_pools`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`candidate_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_skill_index` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`skill_slug` text NOT NULL,
	`skill_title` text NOT NULL,
	`proof_count` integer DEFAULT 0 NOT NULL,
	`latest_proof_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_talent_pools` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cohort_study_sessions_cohort_idx` ON `cohort_study_sessions` (`cohort_id`,`scheduled_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `talent_pool_members_uq` ON `talent_pool_members` (`pool_id`,`candidate_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_skill_index_uq` ON `user_skill_index` (`user_id`,`skill_slug`);--> statement-breakpoint
CREATE INDEX `user_skill_index_skill_idx` ON `user_skill_index` (`skill_slug`,`proof_count`);--> statement-breakpoint
CREATE INDEX `user_talent_pools_owner_idx` ON `user_talent_pools` (`owner_id`);
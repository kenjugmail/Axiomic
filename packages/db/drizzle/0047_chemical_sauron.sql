CREATE TABLE `class_attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`user_id` text NOT NULL,
	`session_date` text NOT NULL,
	`status` text NOT NULL,
	`recorded_by_id` text NOT NULL,
	`recorded_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recorded_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `class_enrollments` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'student' NOT NULL,
	`joined_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `class_task_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	`content` text,
	`was_late` integer DEFAULT false NOT NULL,
	`grade_json` text,
	`submitted_at` text DEFAULT (datetime('now')) NOT NULL,
	`graded_at` text,
	FOREIGN KEY (`task_id`) REFERENCES `class_tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `class_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`description_md` text DEFAULT '' NOT NULL,
	`url` text,
	`due_at` text,
	`xp_reward` integer,
	`created_by_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `classes` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`term` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`syllabus_md` text DEFAULT '' NOT NULL,
	`join_code` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`instructor_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`instructor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pet_cosmetics` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`slot` text NOT NULL,
	`render_kind` text DEFAULT 'emoji' NOT NULL,
	`emoji` text,
	`rarity` text DEFAULT 'common' NOT NULL,
	`grant_only` integer DEFAULT true NOT NULL,
	`description` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pet_inventory` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`cosmetic_slug` text NOT NULL,
	`equipped` integer DEFAULT false NOT NULL,
	`acquired_at` text DEFAULT (datetime('now')) NOT NULL,
	`granted_by_id` text,
	`granted_in_class_id` text,
	`granted_note` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`granted_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`granted_in_class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`species` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`hatched_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `xp_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`class_id` text,
	`source` text NOT NULL,
	`source_ref_id` text NOT NULL,
	`amount` integer NOT NULL,
	`awarded_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `class_attendance_pk` ON `class_attendance` (`class_id`,`user_id`,`session_date`);--> statement-breakpoint
CREATE INDEX `class_attendance_class_date_idx` ON `class_attendance` (`class_id`,`session_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `class_enrollments_pk` ON `class_enrollments` (`class_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `class_enrollments_user_idx` ON `class_enrollments` (`user_id`,`joined_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `class_task_completions_pk` ON `class_task_completions` (`task_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `class_task_completions_user_idx` ON `class_task_completions` (`user_id`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `class_tasks_class_kind_idx` ON `class_tasks` (`class_id`,`kind`,`due_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `classes_slug_unique` ON `classes` (`slug`);--> statement-breakpoint
CREATE INDEX `classes_instructor_idx` ON `classes` (`instructor_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `classes_join_code_idx` ON `classes` (`join_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `pet_cosmetics_slug_unique` ON `pet_cosmetics` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `pet_inventory_uniq` ON `pet_inventory` (`user_id`,`cosmetic_slug`);--> statement-breakpoint
CREATE INDEX `pet_inventory_user_idx` ON `pet_inventory` (`user_id`,`equipped`);--> statement-breakpoint
CREATE UNIQUE INDEX `pets_user_id_unique` ON `pets` (`user_id`);--> statement-breakpoint
CREATE INDEX `pets_species_idx` ON `pets` (`species`);--> statement-breakpoint
CREATE UNIQUE INDEX `xp_grants_uniq` ON `xp_grants` (`user_id`,`source`,`source_ref_id`);--> statement-breakpoint
CREATE INDEX `xp_grants_user_class_idx` ON `xp_grants` (`user_id`,`class_id`,`awarded_at`);--> statement-breakpoint
CREATE INDEX `xp_grants_class_idx` ON `xp_grants` (`class_id`,`awarded_at`);
CREATE TABLE `level_checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`path_id` text NOT NULL,
	`level` text NOT NULL,
	`question_refs_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`path_id`) REFERENCES `mastery_paths`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pet_quests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`pet_id` text NOT NULL,
	`concept_slug` text NOT NULL,
	`source_quiz_mistake_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pet_id`) REFERENCES `pets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `quiz_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`node_id` text NOT NULL,
	`question_id` text NOT NULL,
	`slide_idx` integer,
	`attempt_no` integer DEFAULT 1 NOT NULL,
	`correct` integer NOT NULL,
	`confidence` integer,
	`answer_json` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`node_id`) REFERENCES `mastery_nodes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `signed_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload_json` text NOT NULL,
	`signature` text NOT NULL,
	`verify_id` text NOT NULL,
	`issued_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `study_room_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`slide_idx` integer DEFAULT 0 NOT NULL,
	`joined_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_seen_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `cohort_study_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_checkpoint_results` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`path_id` text NOT NULL,
	`level` text NOT NULL,
	`score` real DEFAULT 0 NOT NULL,
	`passed_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`path_id`) REFERENCES `mastery_paths`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `level_checkpoints_path_level_uniq` ON `level_checkpoints` (`path_id`,`level`);--> statement-breakpoint
CREATE INDEX `pet_quests_user_status_idx` ON `pet_quests` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `quiz_attempts_user_q_idx` ON `quiz_attempts` (`user_id`,`question_id`);--> statement-breakpoint
CREATE INDEX `quiz_attempts_user_node_idx` ON `quiz_attempts` (`user_id`,`node_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `signed_credentials_verify_uniq` ON `signed_credentials` (`verify_id`);--> statement-breakpoint
CREATE INDEX `signed_credentials_user_idx` ON `signed_credentials` (`user_id`,`issued_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `study_room_participants_uniq` ON `study_room_participants` (`session_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_checkpoint_results_uniq` ON `user_checkpoint_results` (`user_id`,`path_id`,`level`);
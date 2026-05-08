CREATE TABLE `capstone_enrollments` (
	`id` text PRIMARY KEY NOT NULL,
	`capstone_id` text NOT NULL,
	`user_id` text NOT NULL,
	`started_at` text DEFAULT (datetime('now')) NOT NULL,
	`completed_at` text,
	`artifact_page_slug` text,
	FOREIGN KEY (`capstone_id`) REFERENCES `capstones`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `capstone_milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`capstone_id` text NOT NULL,
	`order` integer NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`rubric_json` text DEFAULT '{}' NOT NULL,
	`required_artifact_kinds` text DEFAULT '[]' NOT NULL,
	`runnable_tests` text,
	`estimated_days` integer DEFAULT 7 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`capstone_id`) REFERENCES `capstones`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `capstone_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`enrollment_id` text NOT NULL,
	`milestone_id` text NOT NULL,
	`artifacts_json` text DEFAULT '[]' NOT NULL,
	`writeup` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`ai_grade_json` text,
	`runnable_test_results_json` text,
	`lab_state_json` text,
	`submitted_at` text DEFAULT (datetime('now')) NOT NULL,
	`graded_at` text,
	FOREIGN KEY (`enrollment_id`) REFERENCES `capstone_enrollments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`milestone_id`) REFERENCES `capstone_milestones`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `capstones` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`content_intro` text DEFAULT '' NOT NULL,
	`content_undergrad` text DEFAULT '' NOT NULL,
	`content_grad` text DEFAULT '' NOT NULL,
	`canonical_tier` text DEFAULT 'undergrad' NOT NULL,
	`estimated_weeks` integer DEFAULT 6 NOT NULL,
	`prerequisite_wiki_slugs` text DEFAULT '[]' NOT NULL,
	`prerequisite_node_ids` text DEFAULT '[]' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`cover_emoji` text DEFAULT '🎓' NOT NULL,
	`accent_color` text DEFAULT 'violet' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`author_id` text NOT NULL,
	`last_editor_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`last_editor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `misconception_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`concept_slug` text NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`probe_questions_json` text DEFAULT '[]' NOT NULL,
	`correction_prompt_template` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `misconception_diagnoses` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`concept_slug` text NOT NULL,
	`misconception_key` text NOT NULL,
	`label` text NOT NULL,
	`evidence_json` text DEFAULT '[]' NOT NULL,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`first_seen_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_seen_at` text DEFAULT (datetime('now')) NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `capstone_enrollments_pk` ON `capstone_enrollments` (`capstone_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `capstone_enrollments_user_idx` ON `capstone_enrollments` (`user_id`,`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `capstone_enrollments_artifact_slug_idx` ON `capstone_enrollments` (`artifact_page_slug`);--> statement-breakpoint
CREATE INDEX `capstone_milestones_capstone_idx` ON `capstone_milestones` (`capstone_id`,`order`);--> statement-breakpoint
CREATE UNIQUE INDEX `capstone_submissions_pk` ON `capstone_submissions` (`enrollment_id`,`milestone_id`);--> statement-breakpoint
CREATE INDEX `capstone_submissions_milestone_idx` ON `capstone_submissions` (`milestone_id`,`submitted_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `capstones_slug_unique` ON `capstones` (`slug`);--> statement-breakpoint
CREATE INDEX `capstones_author_idx` ON `capstones` (`author_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `capstones_status_idx` ON `capstones` (`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `misconception_catalog_pk` ON `misconception_catalog` (`concept_slug`,`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `misconception_diagnoses_pk` ON `misconception_diagnoses` (`user_id`,`concept_slug`,`misconception_key`);--> statement-breakpoint
CREATE INDEX `misconception_diagnoses_user_idx` ON `misconception_diagnoses` (`user_id`,`status`);
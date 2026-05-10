CREATE TABLE `exam_attempt_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`question_id` text NOT NULL,
	`selected_index` integer,
	`is_correct` integer,
	`time_spent_ms` integer DEFAULT 0 NOT NULL,
	`flagged` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `exam_attempts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `exam_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`exam_id` text NOT NULL,
	`mode` text NOT NULL,
	`section_slug` text,
	`started_at` text DEFAULT (datetime('now')) NOT NULL,
	`completed_at` text,
	`expires_at` text,
	`score_raw` integer,
	`score_scaled` integer,
	`score_percentile` integer,
	`section_scores_json` text,
	`answers_json` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `exam_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`section_id` text NOT NULL,
	`difficulty` integer DEFAULT 3 NOT NULL,
	`prompt_md` text NOT NULL,
	`options_json` text NOT NULL,
	`correct_index` integer NOT NULL,
	`explanation_md` text DEFAULT '' NOT NULL,
	`topic_tags_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`section_id`) REFERENCES `exam_sections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `exam_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`ordinal` integer NOT NULL,
	`duration_minutes` integer NOT NULL,
	`question_count` integer NOT NULL,
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `exams` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`short_name` text NOT NULL,
	`path_slug` text,
	`total_duration_minutes` integer NOT NULL,
	`scoring_json` text DEFAULT '{}' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exam_attempt_answers_attempt_question_uq` ON `exam_attempt_answers` (`attempt_id`,`question_id`);--> statement-breakpoint
CREATE INDEX `exam_attempts_user_idx` ON `exam_attempts` (`user_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `exam_attempts_exam_idx` ON `exam_attempts` (`exam_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `exam_attempts_expiry_idx` ON `exam_attempts` (`expires_at`);--> statement-breakpoint
CREATE INDEX `exam_questions_section_idx` ON `exam_questions` (`section_id`,`difficulty`);--> statement-breakpoint
CREATE UNIQUE INDEX `exam_sections_pk` ON `exam_sections` (`exam_id`,`ordinal`);--> statement-breakpoint
CREATE UNIQUE INDEX `exam_sections_slug_uq` ON `exam_sections` (`exam_id`,`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `exams_slug_unique` ON `exams` (`slug`);
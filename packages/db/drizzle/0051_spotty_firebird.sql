CREATE TABLE `class_question_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`user_id` text NOT NULL,
	`answer_index` integer NOT NULL,
	`correct` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `class_questions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `class_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`author_id` text NOT NULL,
	`prompt` text NOT NULL,
	`choices_json` text NOT NULL,
	`correct_index` integer NOT NULL,
	`starts_at` text DEFAULT (datetime('now')) NOT NULL,
	`ends_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `class_question_attempts_uniq` ON `class_question_attempts` (`question_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `class_question_attempts_question_idx` ON `class_question_attempts` (`question_id`);--> statement-breakpoint
CREATE INDEX `class_questions_class_active_idx` ON `class_questions` (`class_id`,`ends_at`);
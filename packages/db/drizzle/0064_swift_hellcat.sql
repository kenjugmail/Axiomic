CREATE TABLE `class_task_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`student_id` text NOT NULL,
	`prompt_md` text NOT NULL,
	`rubric_json` text NOT NULL,
	`weakness_snapshot_json` text NOT NULL,
	`generation_seed` text NOT NULL,
	`rationale` text DEFAULT '' NOT NULL,
	`generated_at` text DEFAULT (datetime('now')) NOT NULL,
	`generated_by_id` text,
	FOREIGN KEY (`task_id`) REFERENCES `class_tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`generated_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `classes` ADD `level` text;--> statement-breakpoint
ALTER TABLE `classes` ADD `topic_slugs_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `class_task_variants_pk` ON `class_task_variants` (`task_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `class_task_variants_student_idx` ON `class_task_variants` (`student_id`,`generated_at`);
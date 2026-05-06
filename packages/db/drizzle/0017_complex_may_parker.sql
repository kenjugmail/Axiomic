CREATE TABLE `lesson_edit_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`version` integer NOT NULL,
	`reporter_id` text NOT NULL,
	`reason` text NOT NULL,
	`message` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `mastery_nodes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `mastery_nodes` ADD `draft_lesson_data` text;--> statement-breakpoint
ALTER TABLE `mastery_nodes` ADD `draft_updated_at` text;--> statement-breakpoint
ALTER TABLE `mastery_nodes` ADD `draft_editor_id` text REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `lesson_edit_reports_node_idx` ON `lesson_edit_reports` (`node_id`,`version`);--> statement-breakpoint
CREATE INDEX `lesson_edit_reports_reporter_idx` ON `lesson_edit_reports` (`reporter_id`);

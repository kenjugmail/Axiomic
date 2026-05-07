CREATE TABLE `lesson_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`version` integer NOT NULL,
	`lesson_data` text NOT NULL,
	`edited_by` text,
	`edit_message` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `mastery_nodes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`edited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `mastery_nodes` ADD `current_lesson_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `lesson_versions_node_version_idx` ON `lesson_versions` (`node_id`,`version`);
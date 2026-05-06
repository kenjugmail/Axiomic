CREATE TABLE `lesson_slide_events` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`user_id` text NOT NULL,
	`slide_idx` integer NOT NULL,
	`kind` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `mastery_nodes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lesson_slide_events_node_idx` ON `lesson_slide_events` (`node_id`,`slide_idx`);--> statement-breakpoint
CREATE UNIQUE INDEX `lesson_slide_events_user_uniq_idx` ON `lesson_slide_events` (`node_id`,`user_id`,`slide_idx`,`kind`);
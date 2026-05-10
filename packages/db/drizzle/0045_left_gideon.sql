CREATE TABLE `lab_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`cohort_id` text NOT NULL,
	`assigned_to_user_id` text NOT NULL,
	`assigned_by_id` text NOT NULL,
	`mastery_path_slug` text,
	`protocol_slug` text,
	`cert_slug` text,
	`due_at` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`notes_md` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`cohort_id`) REFERENCES `cohorts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `cohorts` ADD `discipline` text;--> statement-breakpoint
ALTER TABLE `mastery_nodes` ADD `node_kind` text DEFAULT 'lesson' NOT NULL;--> statement-breakpoint
ALTER TABLE `mastery_nodes` ADD `protocol_slug` text;--> statement-breakpoint
ALTER TABLE `mastery_nodes` ADD `cert_slug` text;--> statement-breakpoint
ALTER TABLE `mastery_nodes` ADD `equipment_slug` text;--> statement-breakpoint
CREATE INDEX `lab_assign_cohort_user_idx` ON `lab_assignments` (`cohort_id`,`assigned_to_user_id`);--> statement-breakpoint
CREATE INDEX `lab_assign_user_status_idx` ON `lab_assignments` (`assigned_to_user_id`,`status`);
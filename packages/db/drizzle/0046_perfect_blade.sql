CREATE TABLE `capstone_advisor_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`enrollment_id` text NOT NULL,
	`advisor_user_id` text NOT NULL,
	`role` text DEFAULT 'advisor' NOT NULL,
	`invited_at` text DEFAULT (datetime('now')) NOT NULL,
	`accepted_at` text,
	FOREIGN KEY (`enrollment_id`) REFERENCES `capstone_enrollments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`advisor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `capstone_submission_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`version_tag` text NOT NULL,
	`artifacts_json` text DEFAULT '{}' NOT NULL,
	`writeup` text DEFAULT '' NOT NULL,
	`author_notes` text DEFAULT '' NOT NULL,
	`captured_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `capstone_submissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `capstone_milestones` ADD `due_at` text;--> statement-breakpoint
ALTER TABLE `capstone_milestones` ADD `advisor_signoff_required` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `capstones` ADD `scale_tier` text DEFAULT 'skill_drill' NOT NULL;--> statement-breakpoint
ALTER TABLE `capstones` ADD `domains_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `capstones` ADD `estimated_hours_min` integer;--> statement-breakpoint
ALTER TABLE `capstones` ADD `estimated_hours_max` integer;--> statement-breakpoint
ALTER TABLE `capstones` ADD `real_world_deliverable_md` text;--> statement-breakpoint
CREATE INDEX `capstone_advisor_enrollment_idx` ON `capstone_advisor_assignments` (`enrollment_id`);--> statement-breakpoint
CREATE INDEX `capstone_advisor_user_idx` ON `capstone_advisor_assignments` (`advisor_user_id`,`accepted_at`);--> statement-breakpoint
CREATE INDEX `capstone_subver_submission_idx` ON `capstone_submission_versions` (`submission_id`,`captured_at`);
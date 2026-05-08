CREATE TABLE `misconception_submission_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`user_id` text NOT NULL,
	`value` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `misconception_submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `misconception_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`proposer_id` text NOT NULL,
	`concept_slug` text NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`probe_questions_json` text DEFAULT '[]' NOT NULL,
	`correction_prompt_template` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`vote_score` integer DEFAULT 0 NOT NULL,
	`catalog_id` text,
	`decided_at` text,
	`decided_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`proposer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`catalog_id`) REFERENCES `misconception_catalog`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `misconception_submission_votes_pk` ON `misconception_submission_votes` (`submission_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `misconception_submission_votes_user_idx` ON `misconception_submission_votes` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `misconception_submissions_pk` ON `misconception_submissions` (`concept_slug`,`key`);--> statement-breakpoint
CREATE INDEX `misconception_submissions_status_idx` ON `misconception_submissions` (`status`,`vote_score`);
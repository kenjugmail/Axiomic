CREATE TABLE `protocol_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`protocol_id` text NOT NULL,
	`protocol_version` integer NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`started_at` text DEFAULT (datetime('now')) NOT NULL,
	`completed_at` text,
	`signed_off_at` text,
	`signed_off_by_id` text,
	`step_state_json` text DEFAULT '{}' NOT NULL,
	`notes_md` text DEFAULT '' NOT NULL,
	`sign_off_notes_md` text,
	FOREIGN KEY (`protocol_id`) REFERENCES `protocols`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`signed_off_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `safety_certifications` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`discipline` text NOT NULL,
	`description` text,
	`quiz_data_json` text NOT NULL,
	`passing_score` real DEFAULT 0.7 NOT NULL,
	`validity_days` integer,
	`author_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_safety_certifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`cert_slug` text NOT NULL,
	`passed_at` text NOT NULL,
	`expires_at` text,
	`score` real,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `protocol_runs_user_idx` ON `protocol_runs` (`user_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `protocol_runs_protocol_idx` ON `protocol_runs` (`protocol_id`,`status`);--> statement-breakpoint
CREATE INDEX `protocol_runs_signoff_idx` ON `protocol_runs` (`status`,`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `safety_certifications_slug_unique` ON `safety_certifications` (`slug`);--> statement-breakpoint
CREATE INDEX `user_certs_idx` ON `user_safety_certifications` (`user_id`,`cert_slug`,`expires_at`);
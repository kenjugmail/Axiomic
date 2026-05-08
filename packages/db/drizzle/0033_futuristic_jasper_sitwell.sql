CREATE TABLE `capstone_track_capstones` (
	`track_id` text NOT NULL,
	`capstone_id` text NOT NULL,
	`order` integer NOT NULL,
	`optional` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `capstone_tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`capstone_id`) REFERENCES `capstones`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `capstone_track_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text NOT NULL,
	`user_id` text NOT NULL,
	`completed_at` text DEFAULT (datetime('now')) NOT NULL,
	`artifact_page_slug` text NOT NULL,
	`signed_transcript_json` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `capstone_tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `capstone_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`content_intro` text DEFAULT '' NOT NULL,
	`content_undergrad` text DEFAULT '' NOT NULL,
	`content_grad` text DEFAULT '' NOT NULL,
	`canonical_tier` text DEFAULT 'undergrad' NOT NULL,
	`cover_emoji` text DEFAULT '🎯' NOT NULL,
	`accent_color` text DEFAULT 'violet' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`author_id` text NOT NULL,
	`last_editor_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`last_editor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `cohort_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`cohort_id` text NOT NULL,
	`inviter_id` text NOT NULL,
	`email` text NOT NULL,
	`token` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`accepted_user_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`expires_at` text,
	`decided_at` text,
	FOREIGN KEY (`cohort_id`) REFERENCES `cohorts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`accepted_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `content_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`target_id` text,
	`proposer_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`prior_snapshot_json` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewer_id` text,
	`review_note` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`decided_at` text,
	FOREIGN KEY (`proposer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `users` ADD `role` text DEFAULT 'member' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `capstone_track_capstones_pk` ON `capstone_track_capstones` (`track_id`,`capstone_id`);--> statement-breakpoint
CREATE INDEX `capstone_track_capstones_track_idx` ON `capstone_track_capstones` (`track_id`,`order`);--> statement-breakpoint
CREATE UNIQUE INDEX `capstone_track_completions_pk` ON `capstone_track_completions` (`track_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `capstone_track_completions_artifact_slug_idx` ON `capstone_track_completions` (`artifact_page_slug`);--> statement-breakpoint
CREATE INDEX `capstone_track_completions_user_idx` ON `capstone_track_completions` (`user_id`,`completed_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `capstone_tracks_slug_unique` ON `capstone_tracks` (`slug`);--> statement-breakpoint
CREATE INDEX `capstone_tracks_author_idx` ON `capstone_tracks` (`author_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `capstone_tracks_status_idx` ON `capstone_tracks` (`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `cohort_invitations_token_unique` ON `cohort_invitations` (`token`);--> statement-breakpoint
CREATE INDEX `cohort_invitations_cohort_status_idx` ON `cohort_invitations` (`cohort_id`,`status`);--> statement-breakpoint
CREATE INDEX `cohort_invitations_email_status_idx` ON `cohort_invitations` (`email`,`status`);--> statement-breakpoint
CREATE INDEX `content_proposals_status_idx` ON `content_proposals` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `content_proposals_proposer_idx` ON `content_proposals` (`proposer_id`,`status`);
CREATE TABLE `learning_commitments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`goal_kind` text NOT NULL,
	`goal_slug` text NOT NULL,
	`goal_title` text DEFAULT '' NOT NULL,
	`deadline_at` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`witness_user_id` text,
	`cohort_id` text,
	`is_public` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`witness_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `org_attestations` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`subject_user_id` text NOT NULL,
	`attested_by_user_id` text NOT NULL,
	`attest_kind` text NOT NULL,
	`attest_ref` text DEFAULT '' NOT NULL,
	`statement` text DEFAULT '' NOT NULL,
	`signed_json` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`attested_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `org_members` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`joined_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `orgs` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description_md` text DEFAULT '' NOT NULL,
	`website` text DEFAULT '' NOT NULL,
	`verification_status` text DEFAULT 'unverified' NOT NULL,
	`creator_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recruiter_match_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`recruiter_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`role_slug` text NOT NULL,
	`role_title` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`message_md` text DEFAULT '' NOT NULL,
	`skill_gap_json` text DEFAULT '{}' NOT NULL,
	`signed_offer_json` text DEFAULT '' NOT NULL,
	`share_token_id` text,
	`share_url` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`responded_at` text,
	FOREIGN KEY (`recruiter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`candidate_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `learning_commitments_user_idx` ON `learning_commitments` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `learning_commitments_deadline_idx` ON `learning_commitments` (`status`,`deadline_at`);--> statement-breakpoint
CREATE INDEX `org_attestations_subject_idx` ON `org_attestations` (`subject_user_id`);--> statement-breakpoint
CREATE INDEX `org_attestations_org_idx` ON `org_attestations` (`org_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `org_members_uq` ON `org_members` (`org_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `org_members_org_idx` ON `org_members` (`org_id`);--> statement-breakpoint
CREATE INDEX `org_members_user_idx` ON `org_members` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `orgs_slug_unique` ON `orgs` (`slug`);--> statement-breakpoint
CREATE INDEX `orgs_slug_idx` ON `orgs` (`slug`);--> statement-breakpoint
CREATE INDEX `orgs_creator_idx` ON `orgs` (`creator_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `recruiter_match_offers_uq` ON `recruiter_match_offers` (`recruiter_id`,`candidate_id`,`role_slug`);--> statement-breakpoint
CREATE INDEX `recruiter_match_offers_candidate_idx` ON `recruiter_match_offers` (`candidate_id`,`status`);--> statement-breakpoint
CREATE INDEX `recruiter_match_offers_recruiter_idx` ON `recruiter_match_offers` (`recruiter_id`,`created_at`);
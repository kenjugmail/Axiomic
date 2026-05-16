CREATE TABLE `credential_log` (
	`id` text PRIMARY KEY NOT NULL,
	`leaf_index` integer NOT NULL,
	`event_kind` text NOT NULL,
	`credential_kind` text NOT NULL,
	`credential_ref` text NOT NULL,
	`leaf_hash` text NOT NULL,
	`prev_hash` text DEFAULT '' NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `credential_share_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`scope_json` text DEFAULT '{"mode":"all"}' NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`expires_at` text,
	`revoked_at` text,
	`access_count` integer DEFAULT 0 NOT NULL,
	`last_accessed_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `skill_endorsements` (
	`id` text PRIMARY KEY NOT NULL,
	`endorser_id` text NOT NULL,
	`endorsee_id` text NOT NULL,
	`skill_slug` text NOT NULL,
	`skill_title` text DEFAULT '' NOT NULL,
	`weight_at_endorsement` real DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`signed_json` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`endorser_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`endorsee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transparency_tree_heads` (
	`id` text PRIMARY KEY NOT NULL,
	`tree_size` integer NOT NULL,
	`root_hash` text NOT NULL,
	`signature` text NOT NULL,
	`signed_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credential_log_leaf_uq` ON `credential_log` (`leaf_index`);--> statement-breakpoint
CREATE INDEX `credential_log_ref_idx` ON `credential_log` (`credential_kind`,`credential_ref`);--> statement-breakpoint
CREATE UNIQUE INDEX `credential_share_tokens_token_uq` ON `credential_share_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `credential_share_tokens_owner_idx` ON `credential_share_tokens` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `skill_endorsements_uq` ON `skill_endorsements` (`endorser_id`,`endorsee_id`,`skill_slug`);--> statement-breakpoint
CREATE INDEX `skill_endorsements_endorsee_idx` ON `skill_endorsements` (`endorsee_id`,`skill_slug`);--> statement-breakpoint
CREATE INDEX `transparency_tree_heads_size_idx` ON `transparency_tree_heads` (`tree_size`);
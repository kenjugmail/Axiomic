CREATE TABLE `credential_revocations` (
	`id` text PRIMARY KEY NOT NULL,
	`credential_kind` text NOT NULL,
	`credential_ref` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`revoked_by_user_id` text,
	`active` integer DEFAULT true NOT NULL,
	`revoked_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`revoked_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `role_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description_md` text DEFAULT '' NOT NULL,
	`required_skill_slugs_json` text DEFAULT '[]' NOT NULL,
	`source` text DEFAULT 'curated' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credential_revocations_uq` ON `credential_revocations` (`credential_kind`,`credential_ref`);--> statement-breakpoint
CREATE INDEX `credential_revocations_active_idx` ON `credential_revocations` (`active`,`revoked_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `role_profiles_slug_unique` ON `role_profiles` (`slug`);--> statement-breakpoint
CREATE INDEX `role_profiles_slug_idx` ON `role_profiles` (`slug`);
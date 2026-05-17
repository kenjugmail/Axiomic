CREATE TABLE `mission_contribution_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`contribution_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`verdict` text NOT NULL,
	`notes_md` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`contribution_id`) REFERENCES `mission_contributions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `mission_contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`mission_id` text NOT NULL,
	`subproblem_id` text,
	`user_id` text NOT NULL,
	`kind` text DEFAULT 'analysis' NOT NULL,
	`body_md` text DEFAULT '' NOT NULL,
	`artifacts_json` text DEFAULT '[]' NOT NULL,
	`credential_minted_at` text,
	`credential_mint_weight` real,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`mission_id`) REFERENCES `missions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subproblem_id`) REFERENCES `mission_subproblems`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `mission_members` (
	`id` text PRIMARY KEY NOT NULL,
	`mission_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`joined_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`mission_id`) REFERENCES `missions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `mission_org_backers` (
	`id` text PRIMARY KEY NOT NULL,
	`mission_id` text NOT NULL,
	`org_id` text NOT NULL,
	`added_by_user_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`mission_id`) REFERENCES `missions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`added_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `mission_subproblems` (
	`id` text PRIMARY KEY NOT NULL,
	`mission_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description_md` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`created_by_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`mission_id`) REFERENCES `missions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `missions` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`problem_md` text DEFAULT '' NOT NULL,
	`summary_md` text DEFAULT '' NOT NULL,
	`theme` text DEFAULT 'other' NOT NULL,
	`topic_tags_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`creator_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mission_contribution_reviews_uq` ON `mission_contribution_reviews` (`contribution_id`,`reviewer_id`);--> statement-breakpoint
CREATE INDEX `mission_contribution_reviews_contrib_idx` ON `mission_contribution_reviews` (`contribution_id`);--> statement-breakpoint
CREATE INDEX `mission_contributions_mission_idx` ON `mission_contributions` (`mission_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `mission_contributions_user_idx` ON `mission_contributions` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `mission_members_pk` ON `mission_members` (`mission_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `mission_members_user_idx` ON `mission_members` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `mission_org_backers_uq` ON `mission_org_backers` (`mission_id`,`org_id`);--> statement-breakpoint
CREATE INDEX `mission_org_backers_mission_idx` ON `mission_org_backers` (`mission_id`);--> statement-breakpoint
CREATE INDEX `mission_subproblems_mission_idx` ON `mission_subproblems` (`mission_id`,`order`);--> statement-breakpoint
CREATE UNIQUE INDEX `mission_subproblems_slug_uq` ON `mission_subproblems` (`mission_id`,`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `missions_slug_unique` ON `missions` (`slug`);--> statement-breakpoint
CREATE INDEX `missions_slug_idx` ON `missions` (`slug`);--> statement-breakpoint
CREATE INDEX `missions_status_idx` ON `missions` (`status`,`created_at`);
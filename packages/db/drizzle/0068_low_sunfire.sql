CREATE TABLE `bounty_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`bounty_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'claimed' NOT NULL,
	`claimed_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`bounty_id`) REFERENCES `research_bounties`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `bounty_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`writeup` text DEFAULT '' NOT NULL,
	`artifacts_json` text DEFAULT '[]' NOT NULL,
	`ai_review_json` text,
	`submitted_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `bounty_claims`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `mastery_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`captured_on` text NOT NULL,
	`mastered_count` integer DEFAULT 0 NOT NULL,
	`in_progress_count` integer DEFAULT 0 NOT NULL,
	`untouched_count` integer DEFAULT 0 NOT NULL,
	`avg_quiz_score` real,
	`weak_concept_count` integer DEFAULT 0 NOT NULL,
	`captured_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reproduction_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`reproduction_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`verdict` text NOT NULL,
	`notes_md` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`reproduction_id`) REFERENCES `reproductions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `research_bounties` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description_md` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'other' NOT NULL,
	`linked_paper_id` text,
	`linked_article_id` text,
	`reward_xp` integer DEFAULT 0 NOT NULL,
	`reward_badge_slug` text,
	`status` text DEFAULT 'open' NOT NULL,
	`max_claimants` integer DEFAULT 1 NOT NULL,
	`deadline_at` text,
	`discoverable` integer DEFAULT true NOT NULL,
	`poster_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`poster_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `reproductions` ADD `credential_minted_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `credentials_public` integer DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `bounty_claims_uq` ON `bounty_claims` (`bounty_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `bounty_claims_bounty_idx` ON `bounty_claims` (`bounty_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `bounty_submissions_claim_uq` ON `bounty_submissions` (`claim_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `mastery_snapshots_uq` ON `mastery_snapshots` (`user_id`,`captured_on`);--> statement-breakpoint
CREATE INDEX `mastery_snapshots_user_idx` ON `mastery_snapshots` (`user_id`,`captured_on`);--> statement-breakpoint
CREATE UNIQUE INDEX `reproduction_reviews_uq` ON `reproduction_reviews` (`reproduction_id`,`reviewer_id`);--> statement-breakpoint
CREATE INDEX `reproduction_reviews_repro_idx` ON `reproduction_reviews` (`reproduction_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `research_bounties_slug_unique` ON `research_bounties` (`slug`);--> statement-breakpoint
CREATE INDEX `research_bounties_discover_idx` ON `research_bounties` (`discoverable`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `research_bounties_poster_idx` ON `research_bounties` (`poster_id`,`created_at`);
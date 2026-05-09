CREATE TABLE `author_claim_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`external_paper_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`evidence_text` text DEFAULT '' NOT NULL,
	`evidence_url` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewer_id` text,
	`review_note` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`decided_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `external_paper_authorships` (
	`id` text PRIMARY KEY NOT NULL,
	`external_paper_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`user_id` text NOT NULL,
	`verified_via` text NOT NULL,
	`verified_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `social_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`author_ref` text NOT NULL,
	`user_id` text,
	`text` text NOT NULL,
	`url` text NOT NULL,
	`posted_at` text,
	`referenced_source` text,
	`referenced_source_id` text,
	`referenced_paper_id` text,
	`fetched_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `author_claim_requests_status_idx` ON `author_claim_requests` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `author_claim_requests_user_idx` ON `author_claim_requests` (`user_id`);--> statement-breakpoint
CREATE INDEX `author_claim_requests_paper_idx` ON `author_claim_requests` (`external_paper_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `external_paper_authorships_paper_ordinal_uq` ON `external_paper_authorships` (`external_paper_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `external_paper_authorships_user_idx` ON `external_paper_authorships` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `social_posts_source_uq` ON `social_posts` (`source`,`source_id`);--> statement-breakpoint
CREATE INDEX `social_posts_author_idx` ON `social_posts` (`author_ref`,`posted_at`);--> statement-breakpoint
CREATE INDEX `social_posts_paper_idx` ON `social_posts` (`referenced_paper_id`,`posted_at`);--> statement-breakpoint
CREATE INDEX `social_posts_user_idx` ON `social_posts` (`user_id`,`posted_at`);
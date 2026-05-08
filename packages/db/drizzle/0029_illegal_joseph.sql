CREATE TABLE `capstone_peer_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`status` text NOT NULL,
	`score` real NOT NULL,
	`feedback` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `capstone_submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `capstone_peer_reviews_pk` ON `capstone_peer_reviews` (`submission_id`,`reviewer_id`);--> statement-breakpoint
CREATE INDEX `capstone_peer_reviews_submission_idx` ON `capstone_peer_reviews` (`submission_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `capstone_peer_reviews_reviewer_idx` ON `capstone_peer_reviews` (`reviewer_id`,`created_at`);
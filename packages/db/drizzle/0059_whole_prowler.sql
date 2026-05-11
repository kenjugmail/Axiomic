CREATE TABLE `password_reset_tokens` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `sessions` ADD `user_agent` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `ip` text;--> statement-breakpoint
ALTER TABLE `users` ADD `pending_email` text;--> statement-breakpoint
CREATE INDEX `password_reset_tokens_user_idx` ON `password_reset_tokens` (`user_id`);
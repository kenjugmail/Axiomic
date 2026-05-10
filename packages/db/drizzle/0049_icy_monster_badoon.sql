CREATE TABLE `xp_purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`cosmetic_slug` text NOT NULL,
	`amount` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `pet_cosmetics` ADD `xp_cost` integer;--> statement-breakpoint
CREATE INDEX `xp_purchases_user_idx` ON `xp_purchases` (`user_id`,`created_at`);
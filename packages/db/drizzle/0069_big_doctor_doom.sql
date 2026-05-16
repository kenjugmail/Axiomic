CREATE TABLE `review_room_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`room_kind` text NOT NULL,
	`room_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body_md` text DEFAULT '' NOT NULL,
	`parent_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `reproductions` ADD `credential_mint_weight` real;--> statement-breakpoint
CREATE INDEX `review_room_messages_room_idx` ON `review_room_messages` (`room_kind`,`room_id`,`created_at`);
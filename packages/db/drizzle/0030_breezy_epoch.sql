CREATE TABLE `kernel_files` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kernel_key` text NOT NULL,
	`attachment_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kernel_files_pk` ON `kernel_files` (`kernel_key`,`name`,`owner_id`);--> statement-breakpoint
CREATE INDEX `kernel_files_owner_idx` ON `kernel_files` (`owner_id`,`kernel_key`);
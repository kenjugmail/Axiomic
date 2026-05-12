CREATE TABLE `pet_skin_inventory` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`skin_slug` text NOT NULL,
	`acquired_at` text DEFAULT (datetime('now')) NOT NULL,
	`granted_by_id` text,
	`granted_in_class_id` text,
	`granted_note` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`granted_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`granted_in_class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pet_skins` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`rarity` text DEFAULT 'common' NOT NULL,
	`obtain` text DEFAULT 'xp' NOT NULL,
	`xp_cost` integer,
	`description` text DEFAULT '' NOT NULL,
	`fx_filter` text,
	`fx_opacity` real DEFAULT 1 NOT NULL,
	`fx_glow_color` text,
	`fx_glow_blur` real,
	`fx_glow_alpha` real,
	`fx_bg` text,
	`fx_particles` text,
	`fx_ring` text,
	`fx_animated` text
);
--> statement-breakpoint
ALTER TABLE `pets` ADD `active_skin_slug` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `pet_skin_inventory_uniq` ON `pet_skin_inventory` (`user_id`,`skin_slug`);--> statement-breakpoint
CREATE INDEX `pet_skin_inventory_user_idx` ON `pet_skin_inventory` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pet_skins_slug_unique` ON `pet_skins` (`slug`);
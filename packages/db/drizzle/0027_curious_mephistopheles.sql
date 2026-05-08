CREATE TABLE `capstone_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`capstone_id` text NOT NULL,
	`version` integer NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`content_intro` text DEFAULT '' NOT NULL,
	`content_undergrad` text DEFAULT '' NOT NULL,
	`content_grad` text DEFAULT '' NOT NULL,
	`milestones_json` text DEFAULT '[]' NOT NULL,
	`edited_by` text,
	`edit_message` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`capstone_id`) REFERENCES `capstones`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`edited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `research_paper_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`paper_id` text NOT NULL,
	`version` integer NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`abstract` text DEFAULT '' NOT NULL,
	`content_intro` text DEFAULT '' NOT NULL,
	`content_undergrad` text DEFAULT '' NOT NULL,
	`content_grad` text DEFAULT '' NOT NULL,
	`paper_structure_json` text DEFAULT '{}' NOT NULL,
	`references_json` text DEFAULT '[]' NOT NULL,
	`edited_by` text,
	`edit_message` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`paper_id`) REFERENCES `research_papers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`edited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `capstones` ADD `current_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `research_papers` ADD `current_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `capstone_versions_pk` ON `capstone_versions` (`capstone_id`,`version`);--> statement-breakpoint
CREATE INDEX `capstone_versions_capstone_idx` ON `capstone_versions` (`capstone_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `research_paper_versions_pk` ON `research_paper_versions` (`paper_id`,`version`);--> statement-breakpoint
CREATE INDEX `research_paper_versions_paper_idx` ON `research_paper_versions` (`paper_id`,`version`);
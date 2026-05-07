CREATE TABLE `research_papers` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`format` text DEFAULT 'research' NOT NULL,
	`abstract` text DEFAULT '' NOT NULL,
	`content_intro` text DEFAULT '' NOT NULL,
	`content_undergrad` text DEFAULT '' NOT NULL,
	`content_grad` text DEFAULT '' NOT NULL,
	`canonical_tier` text DEFAULT 'undergrad' NOT NULL,
	`paper_structure_json` text DEFAULT '{}' NOT NULL,
	`references_json` text DEFAULT '[]' NOT NULL,
	`coauthors_json` text DEFAULT '[]' NOT NULL,
	`cover_emoji` text DEFAULT '📄' NOT NULL,
	`accent_color` text DEFAULT 'violet' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`author_id` text NOT NULL,
	`last_editor_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`last_editor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_papers_slug_unique` ON `research_papers` (`slug`);--> statement-breakpoint
CREATE INDEX `research_papers_author_idx` ON `research_papers` (`author_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `research_papers_status_idx` ON `research_papers` (`status`,`created_at`);
ALTER TABLE `capstone_enrollments` ADD `doi` text;--> statement-breakpoint
ALTER TABLE `capstone_tracks` ADD `doi` text;--> statement-breakpoint
ALTER TABLE `capstone_tracks` ADD `citation_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `capstone_tracks` ADD `last_cited_at` text;--> statement-breakpoint
ALTER TABLE `capstones` ADD `doi` text;--> statement-breakpoint
ALTER TABLE `capstones` ADD `citation_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `capstones` ADD `last_cited_at` text;--> statement-breakpoint
ALTER TABLE `research_papers` ADD `doi` text;--> statement-breakpoint
ALTER TABLE `research_papers` ADD `citation_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `research_papers` ADD `last_cited_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `onboarding_goal` text;
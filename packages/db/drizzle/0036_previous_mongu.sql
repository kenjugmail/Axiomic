CREATE TABLE `external_papers` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`doi` text,
	`title` text NOT NULL,
	`abstract` text DEFAULT '' NOT NULL,
	`authors_json` text DEFAULT '[]' NOT NULL,
	`venue` text,
	`published_at` text,
	`pdf_url` text,
	`html_url` text,
	`topics_json` text DEFAULT '[]' NOT NULL,
	`citation_count` integer DEFAULT 0 NOT NULL,
	`raw_json` text DEFAULT '{}' NOT NULL,
	`fetched_at` text DEFAULT (datetime('now')) NOT NULL,
	`content_hash` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `job_leases` (
	`job_name` text PRIMARY KEY NOT NULL,
	`lease_holder` text NOT NULL,
	`lease_expires_at` text NOT NULL,
	`last_run_at` text,
	`last_status` text,
	`last_error_message` text,
	`last_duration_ms` integer
);
--> statement-breakpoint
CREATE TABLE `job_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`job_name` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`error_message` text,
	`items_processed` integer DEFAULT 0 NOT NULL,
	`duration_ms` integer
);
--> statement-breakpoint
ALTER TABLE `users` ADD `orcid` text;--> statement-breakpoint
ALTER TABLE `users` ADD `scholar_url` text;--> statement-breakpoint
ALTER TABLE `users` ADD `bluesky_handle` text;--> statement-breakpoint
ALTER TABLE `users` ADD `twitter_handle` text;--> statement-breakpoint
ALTER TABLE `users` ADD `institution` text;--> statement-breakpoint
ALTER TABLE `users` ADD `h_index` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `publication_corpus_vector_json` text;--> statement-breakpoint
ALTER TABLE `users` ADD `external_author_ids_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `external_papers_source_uq` ON `external_papers` (`source`,`source_id`);--> statement-breakpoint
CREATE INDEX `external_papers_doi_idx` ON `external_papers` (`doi`);--> statement-breakpoint
CREATE INDEX `external_papers_published_idx` ON `external_papers` (`published_at`);--> statement-breakpoint
CREATE INDEX `job_runs_by_job_idx` ON `job_runs` (`job_name`,`started_at`);
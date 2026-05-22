CREATE TABLE `lesson_quality_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`run_at` text NOT NULL,
	`node_slug` text NOT NULL,
	`composite` integer NOT NULL,
	`total_body_words` integer NOT NULL,
	`name_drop_count` integer NOT NULL,
	`has_viz` integer NOT NULL,
	`flags` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lesson_quality_snapshots_run_idx` ON `lesson_quality_snapshots` (`run_at`);--> statement-breakpoint
CREATE INDEX `lesson_quality_snapshots_slug_idx` ON `lesson_quality_snapshots` (`node_slug`);
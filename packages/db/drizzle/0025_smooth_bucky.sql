CREATE TABLE `cached_embeddings` (
	`corpus_kind` text NOT NULL,
	`corpus_id` text NOT NULL,
	`content_hash` text NOT NULL,
	`vector_json` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cached_embeddings_pk` ON `cached_embeddings` (`corpus_kind`,`corpus_id`);
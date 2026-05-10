CREATE TABLE `equipment` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`discipline` text NOT NULL,
	`manufacturer` text,
	`model` text,
	`manual_md` text DEFAULT '' NOT NULL,
	`location_hint` text,
	`training_cert_slug` text,
	`hazards_md` text DEFAULT '' NOT NULL,
	`attachment_refs_json` text DEFAULT '[]' NOT NULL,
	`booking_policy` text DEFAULT 'open' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`author_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `equipment_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`equipment_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`title` text NOT NULL,
	`body_md` text NOT NULL,
	`kind` text NOT NULL,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `protocol_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`protocol_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`title` text NOT NULL,
	`instruction_md` text NOT NULL,
	`safety_notes_md` text DEFAULT '' NOT NULL,
	`verification_md` text DEFAULT '' NOT NULL,
	`inline_quiz_json` text,
	`attachment_refs_json` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`protocol_id`) REFERENCES `protocols`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `protocol_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`protocol_id` text NOT NULL,
	`version` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	`edited_by` text,
	`edit_message` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`protocol_id`) REFERENCES `protocols`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`edited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `protocols` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`discipline` text NOT NULL,
	`category` text,
	`summary` text DEFAULT '' NOT NULL,
	`content_intro` text DEFAULT '' NOT NULL,
	`content_undergrad` text DEFAULT '' NOT NULL,
	`content_grad` text DEFAULT '' NOT NULL,
	`biosafety_level` integer,
	`hazards_md` text DEFAULT '' NOT NULL,
	`equipment_required_json` text DEFAULT '[]' NOT NULL,
	`reagents_json` text DEFAULT '[]' NOT NULL,
	`estimated_minutes` integer,
	`required_certs_json` text DEFAULT '[]' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`author_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_slug_unique` ON `equipment` (`slug`);--> statement-breakpoint
CREATE INDEX `equipment_discipline_idx` ON `equipment` (`discipline`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_operations_pk` ON `equipment_operations` (`equipment_id`,`ordinal`);--> statement-breakpoint
CREATE UNIQUE INDEX `protocol_steps_pk` ON `protocol_steps` (`protocol_id`,`ordinal`);--> statement-breakpoint
CREATE UNIQUE INDEX `protocol_versions_uq` ON `protocol_versions` (`protocol_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `protocols_slug_unique` ON `protocols` (`slug`);--> statement-breakpoint
CREATE INDEX `protocols_discipline_idx` ON `protocols` (`discipline`,`status`);--> statement-breakpoint
CREATE INDEX `protocols_author_idx` ON `protocols` (`author_id`,`created_at`);
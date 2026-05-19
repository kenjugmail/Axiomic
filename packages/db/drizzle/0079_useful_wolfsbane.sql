ALTER TABLE `exam_attempt_answers` ADD `grid_in_response` text;--> statement-breakpoint
ALTER TABLE `exam_attempt_answers` ADD `selected_indexes_json` text;--> statement-breakpoint
ALTER TABLE `exam_attempts` ADD `section_deadlines_json` text;--> statement-breakpoint
ALTER TABLE `exam_attempts` ADD `current_section_idx` integer;--> statement-breakpoint
ALTER TABLE `exam_attempts` ADD `break_until_at` text;--> statement-breakpoint
ALTER TABLE `exam_attempts` ADD `calculator_state_json` text;--> statement-breakpoint
ALTER TABLE `exam_attempts` ADD `customizer_json` text;--> statement-breakpoint
ALTER TABLE `exam_questions` ADD `accepted_answers_json` text;--> statement-breakpoint
ALTER TABLE `exam_questions` ADD `tolerance` real;--> statement-breakpoint
ALTER TABLE `exam_questions` ADD `correct_indexes_json` text;--> statement-breakpoint
ALTER TABLE `exam_questions` ADD `image_url` text;--> statement-breakpoint
ALTER TABLE `exam_questions` ADD `meta_json` text;
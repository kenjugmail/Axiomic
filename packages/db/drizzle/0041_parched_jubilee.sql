ALTER TABLE `exam_attempt_answers` ADD `essay_response` text;--> statement-breakpoint
ALTER TABLE `exam_attempt_answers` ADD `essay_score` integer;--> statement-breakpoint
ALTER TABLE `exam_attempt_answers` ADD `essay_feedback_md` text;--> statement-breakpoint
ALTER TABLE `exam_questions` ADD `type` text DEFAULT 'multiple_choice' NOT NULL;--> statement-breakpoint
ALTER TABLE `exam_questions` ADD `rubric_md` text;--> statement-breakpoint
ALTER TABLE `exam_questions` ADD `max_essay_score` integer;--> statement-breakpoint
CREATE INDEX `exam_questions_type_idx` ON `exam_questions` (`section_id`,`type`);
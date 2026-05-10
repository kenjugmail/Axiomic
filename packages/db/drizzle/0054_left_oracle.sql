DROP INDEX IF EXISTS `pets_user_id_unique`;--> statement-breakpoint
ALTER TABLE `users` ADD `active_pet_id` text;--> statement-breakpoint
CREATE INDEX `pets_user_idx` ON `pets` (`user_id`);--> statement-breakpoint
-- S104 backfill: every existing pet becomes its owner's active pet.
-- Subquery is safe because the prior UNIQUE on pets.user_id meant
-- there was at most one pet per user when this migration runs.
UPDATE `users`
SET `active_pet_id` = (SELECT `id` FROM `pets` WHERE `pets`.`user_id` = `users`.`id`)
WHERE `active_pet_id` IS NULL;
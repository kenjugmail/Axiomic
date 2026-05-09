CREATE UNIQUE INDEX `users_orcid_uq` ON `users` (`orcid`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_bluesky_handle_uq` ON `users` (`bluesky_handle`);
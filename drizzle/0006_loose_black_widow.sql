CREATE TABLE `provider_key_settings` (
	`provider` text PRIMARY KEY NOT NULL,
	`active_key_id` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);

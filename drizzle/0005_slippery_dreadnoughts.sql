CREATE TABLE `password_credentials` (
	`user_id` text PRIMARY KEY NOT NULL,
	`algorithm` text NOT NULL,
	`iterations` integer NOT NULL,
	`salt` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
